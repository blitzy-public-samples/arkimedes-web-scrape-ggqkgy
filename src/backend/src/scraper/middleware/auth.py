"""
Authentication middleware for web scraping tasks implementing secure site-specific authentication,
token management, and session handling with comprehensive retry logic and monitoring capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from functools import wraps

# Third-party imports with versions
import aiohttp  # v3.8.0
from aiohttp import ClientSession, ClientTimeout
from tenacity import (  # v8.2.0
    retry, 
    stop_after_attempt, 
    wait_exponential,
    RetryError
)
from yarl import URL  # v1.9.0
from prometheus_client import Counter, Gauge  # v0.17.0

# Internal imports
from api.core.security import create_access_token, decode_access_token
from utils.encryption import encrypt, decrypt, EncryptionError

# Configure logging
logger = logging.getLogger(__name__)

class AuthenticationError(Exception):
    """Custom exception for authentication-related errors."""
    
    def __init__(self, message: str, site_id: str, error_code: str, details: Optional[Dict] = None):
        super().__init__(message)
        self.message = message
        self.site_id = site_id
        self.error_code = error_code
        self.details = details or {}
        self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict:
        """Convert error to dictionary format for API responses."""
        return {
            "error": {
                "code": self.error_code,
                "message": self.message,
                "site_id": self.site_id,
                "details": self.details,
                "timestamp": self.timestamp
            }
        }

def circuit_breaker(failure_threshold: int = 5, recovery_timeout: int = 30):
    """Circuit breaker decorator for authentication flows."""
    def decorator(func):
        failures = {}
        
        @wraps(func)
        async def wrapper(self, site_id: str, *args, **kwargs):
            current_time = datetime.utcnow()
            
            # Check if circuit is open
            if site_id in failures:
                failure_count, last_failure = failures[site_id]
                if failure_count >= failure_threshold:
                    if (current_time - last_failure).seconds < recovery_timeout:
                        raise AuthenticationError(
                            message="Authentication circuit breaker open",
                            site_id=site_id,
                            error_code="AUTH_008",
                            details={"recovery_in": recovery_timeout - (current_time - last_failure).seconds}
                        )
                    failures.pop(site_id)
                    
            try:
                result = await func(self, site_id, *args, **kwargs)
                if site_id in failures:
                    failures.pop(site_id)
                return result
            except Exception as e:
                if site_id not in failures:
                    failures[site_id] = [1, current_time]
                else:
                    failures[site_id][0] += 1
                    failures[site_id][1] = current_time
                raise e
                
        return wrapper
    return decorator

class AuthenticationMiddleware:
    """Advanced middleware for handling site-specific authentication with comprehensive security features."""
    
    def __init__(self, credentials: Dict[str, Any], session: Optional[ClientSession] = None):
        """Initialize authentication middleware with encrypted credentials and monitoring."""
        self._session = session or ClientSession(
            timeout=ClientTimeout(total=30),
            connector=aiohttp.TCPConnector(ssl=True)
        )
        
        # Encrypt credentials
        self._encrypted_credentials = {
            site_id: encrypt(site_id.encode(), str(creds).encode()).decode()
            for site_id, creds in credentials.items()
        }
        
        # Initialize token cache
        self._tokens = {}
        
        # Initialize metrics
        self._auth_attempts = Counter(
            'scraper_auth_attempts_total',
            'Total number of authentication attempts',
            ['site_id', 'status']
        )
        self._active_sessions = Gauge(
            'scraper_active_sessions',
            'Number of active authenticated sessions',
            ['site_id']
        )

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self.close()

    async def close(self):
        """Close sessions and cleanup resources."""
        if self._session and not self._session.closed:
            await self._session.close()

    def _get_credentials(self, site_id: str) -> Dict:
        """Securely retrieve and decrypt credentials."""
        try:
            encrypted_creds = self._encrypted_credentials.get(site_id)
            if not encrypted_creds:
                raise AuthenticationError(
                    message="No credentials found for site",
                    site_id=site_id,
                    error_code="AUTH_001"
                )
            
            decrypted = decrypt(site_id.encode(), encrypted_creds)
            return eval(decrypted.decode())
        except EncryptionError as e:
            raise AuthenticationError(
                message="Failed to decrypt credentials",
                site_id=site_id,
                error_code="AUTH_002",
                details={"error": str(e)}
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=1, max=10)
    )
    @circuit_breaker(failure_threshold=5, recovery_timeout=30)
    async def authenticate(self, site_id: str, auth_params: Optional[Dict] = None) -> Dict:
        """Authenticate with target site using appropriate auth flow."""
        try:
            # Check existing valid token
            if site_id in self._tokens:
                token_data = self._tokens[site_id]
                try:
                    decode_access_token(token_data["access_token"])
                    return token_data
                except Exception:
                    self._tokens.pop(site_id)

            # Get credentials
            creds = self._get_credentials(site_id)
            auth_params = auth_params or {}
            
            # Increment attempt counter
            self._auth_attempts.labels(site_id=site_id, status="attempt").inc()

            # Execute authentication flow
            async with self._session.post(
                URL(creds["auth_url"]),
                json={**creds, **auth_params},
                ssl=True
            ) as response:
                if response.status != 200:
                    raise AuthenticationError(
                        message="Authentication request failed",
                        site_id=site_id,
                        error_code="AUTH_003",
                        details={"status": response.status}
                    )
                    
                auth_data = await response.json()
                
                # Create and store tokens
                tokens = {
                    "access_token": create_access_token(
                        data={"site_id": site_id, **auth_data},
                        expires_delta=timedelta(minutes=30)
                    ),
                    "refresh_token": auth_data.get("refresh_token"),
                    "expires_at": datetime.utcnow() + timedelta(minutes=30)
                }
                self._tokens[site_id] = tokens
                
                # Update metrics
                self._auth_attempts.labels(site_id=site_id, status="success").inc()
                self._active_sessions.labels(site_id=site_id).inc()
                
                return tokens

        except AuthenticationError:
            raise
        except Exception as e:
            self._auth_attempts.labels(site_id=site_id, status="failure").inc()
            raise AuthenticationError(
                message="Authentication failed",
                site_id=site_id,
                error_code="AUTH_004",
                details={"error": str(e)}
            )

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(min=1, max=5)
    )
    async def refresh_auth(self, site_id: str, refresh_token: str) -> Dict:
        """Securely refresh authentication tokens."""
        try:
            creds = self._get_credentials(site_id)
            
            async with self._session.post(
                URL(creds["refresh_url"]),
                json={"refresh_token": refresh_token},
                ssl=True
            ) as response:
                if response.status != 200:
                    raise AuthenticationError(
                        message="Token refresh failed",
                        site_id=site_id,
                        error_code="AUTH_005",
                        details={"status": response.status}
                    )
                    
                refresh_data = await response.json()
                
                # Update tokens
                tokens = {
                    "access_token": create_access_token(
                        data={"site_id": site_id, **refresh_data},
                        expires_delta=timedelta(minutes=30)
                    ),
                    "refresh_token": refresh_data.get("refresh_token", refresh_token),
                    "expires_at": datetime.utcnow() + timedelta(minutes=30)
                }
                self._tokens[site_id] = tokens
                
                return tokens

        except Exception as e:
            raise AuthenticationError(
                message="Token refresh failed",
                site_id=site_id,
                error_code="AUTH_006",
                details={"error": str(e)}
            )

async def create_auth_middleware(
    credentials: Dict[str, Any],
    session: Optional[ClientSession] = None
) -> AuthenticationMiddleware:
    """Factory function for creating configured authentication middleware."""
    try:
        middleware = AuthenticationMiddleware(credentials, session)
        return middleware
    except Exception as e:
        raise AuthenticationError(
            message="Failed to create authentication middleware",
            site_id="global",
            error_code="AUTH_007",
            details={"error": str(e)}
        )

# Export public interface
__all__ = [
    "AuthenticationMiddleware",
    "create_auth_middleware",
    "AuthenticationError"
]