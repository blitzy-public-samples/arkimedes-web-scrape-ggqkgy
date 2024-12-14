"""
Authentication and authorization request handlers for the Web Scraping Platform.
Implements OAuth 2.0 + OIDC with enhanced security features and comprehensive audit logging.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
import logging
import uuid

# Third-party imports with versions
from fastapi import APIRouter, Depends, HTTPException, Request, status  # v0.100.0
from fastapi.security import OAuth2PasswordBearer  # v0.100.0
import pyotp  # v2.8.0
from redis_rate_limit import RateLimiter  # v3.0.0

# Internal imports
from .models import User
from .schemas import Token, TokenPayload, LoginRequest, MFASetup
from ..core.security import (
    SecurityError,
    verify_password,
    create_access_token,
    decode_access_token
)
from ..core.config import settings
from ...utils.encryption import encrypt, decrypt

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/auth", tags=["authentication"])

# OAuth2 scheme configuration
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Initialize rate limiter
rate_limiter = RateLimiter(
    redis_url=settings.get_redis_uri(),
    rate=settings.RATE_LIMIT_PER_MINUTE,
    prefix="auth_rate_limit:"
)

class AuthHandler:
    """Enhanced authentication handler with comprehensive security features."""
    
    def __init__(self, db_session, token_manager=None):
        """
        Initialize authentication handler with security components.
        
        Args:
            db_session: Database session for user operations
            token_manager: Optional custom token management service
        """
        self.db = db_session
        self.token_manager = token_manager
        self.token_type = "bearer"
        self.rate_limiter = rate_limiter
        
    async def validate_token(self, token: str, device_context: Dict) -> User:
        """
        Validate JWT token with enhanced security checks.
        
        Args:
            token: JWT token to validate
            device_context: Device information for security validation
            
        Returns:
            User: Validated user instance
            
        Raises:
            SecurityError: If token validation fails
        """
        try:
            # Decode and validate token
            payload = decode_access_token(token)
            
            # Verify token claims
            if not all(k in payload for k in ["sub", "exp", "jti", "device_id"]):
                raise SecurityError(
                    message="Invalid token claims",
                    error_code="AUTH001",
                    details={"missing_claims": True}
                )
                
            # Verify device context
            if payload["device_id"] != device_context.get("device_id"):
                raise SecurityError(
                    message="Device mismatch",
                    error_code="AUTH002",
                    details={"device_validation": False}
                )
                
            # Get user from database
            user = await self.db.get(User, payload["sub"])
            if not user:
                raise SecurityError(
                    message="User not found",
                    error_code="AUTH003"
                )
                
            # Verify user is active
            if not user.is_active:
                raise SecurityError(
                    message="User account disabled",
                    error_code="AUTH004"
                )
                
            return user
            
        except SecurityError:
            raise
        except Exception as e:
            raise SecurityError(
                message="Token validation failed",
                error_code="AUTH005",
                details={"error": str(e)}
            )

    async def authenticate_user(
        self,
        username: str,
        password: str,
        device_context: Dict
    ) -> Optional[Tuple[User, Dict]]:
        """
        Authenticate user with enhanced security validation.
        
        Args:
            username: User email or username
            password: User password
            device_context: Device information for security context
            
        Returns:
            Optional[Tuple[User, Dict]]: Authenticated user and security context if valid
        """
        try:
            # Rate limit check
            if not await self.rate_limiter.check(device_context["ip_address"]):
                logger.warning(f"Rate limit exceeded for IP: {device_context['ip_address']}")
                return None
                
            # Get user from database
            user = await self.db.get_user_by_email(username)
            if not user:
                logger.warning(f"Login attempt for non-existent user: {username}")
                return None
                
            # Verify password
            if not verify_password(password, user.hashed_password):
                # Record failed attempt
                is_locked = user.record_login_attempt(success=False)
                await self.db.commit()
                
                if is_locked:
                    logger.warning(f"Account locked for user: {username}")
                return None
                
            # Calculate security context
            security_context = {
                "device_fingerprint": self._calculate_device_fingerprint(device_context),
                "risk_score": self._calculate_risk_score(user, device_context),
                "last_login": user.last_login.isoformat() if user.last_login else None,
                "login_count": user.login_count if hasattr(user, 'login_count') else 0
            }
            
            # Update user login status
            user.record_login_attempt(success=True)
            user.last_login = datetime.utcnow()
            await self.db.commit()
            
            return user, security_context
            
        except Exception as e:
            logger.error(f"Authentication error: {str(e)}")
            return None

    def _calculate_device_fingerprint(self, device_context: Dict) -> str:
        """Generate unique device fingerprint for security tracking."""
        fingerprint_data = f"{device_context['user_agent']}:{device_context['ip_address']}"
        return encrypt(settings.SECRET_KEY.encode(), fingerprint_data.encode()).decode()

    def _calculate_risk_score(self, user: User, device_context: Dict) -> float:
        """Calculate security risk score based on various factors."""
        risk_score = 0.0
        
        # New device penalty
        if device_context.get("device_id") not in user.known_devices:
            risk_score += 0.3
            
        # Failed login attempts impact
        risk_score += user.failed_login_attempts * 0.1
        
        # Time since last login impact
        if user.last_login:
            hours_since_login = (datetime.utcnow() - user.last_login).total_seconds() / 3600
            if hours_since_login > 168:  # 1 week
                risk_score += 0.2
                
        # IP geolocation impact
        if device_context.get("country") != user.last_login_country:
            risk_score += 0.4
            
        return min(risk_score, 1.0)

@router.post("/login", response_model=Token)
async def login(
    login_data: LoginRequest,
    request: Request,
    auth_handler: AuthHandler = Depends()
) -> Token:
    """
    Handle user login with progressive security measures.
    
    Args:
        login_data: Login credentials and device information
        request: FastAPI request object
        auth_handler: Authentication handler instance
        
    Returns:
        Token: Enhanced JWT token response
        
    Raises:
        HTTPException: If authentication fails
    """
    try:
        # Extract device context
        device_context = {
            **login_data.device_info,
            "ip_address": request.client.host,
            "request_id": str(uuid.uuid4())
        }
        
        # Authenticate user
        auth_result = await auth_handler.authenticate_user(
            login_data.email,
            login_data.password,
            device_context
        )
        
        if not auth_result:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
            
        user, security_context = auth_result
        
        # Handle MFA if enabled
        if user.is_mfa_enabled:
            if not login_data.mfa_code:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="MFA code required"
                )
                
            # Verify MFA code
            totp = pyotp.TOTP(decrypt(settings.SECRET_KEY.encode(), user.mfa_secret))
            if not totp.verify(login_data.mfa_code):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid MFA code"
                )
                
        # Generate token family ID
        token_family = str(uuid.uuid4())
        
        # Create access token
        access_token = create_access_token(
            data={
                "sub": str(user.id),
                "role": user.role,
                "device_id": device_context["device_id"],
                "security_context": security_context
            },
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        # Create refresh token
        refresh_token = create_access_token(
            data={
                "sub": str(user.id),
                "token_family": token_family,
                "device_id": device_context["device_id"]
            },
            expires_delta=timedelta(days=30),
            scope="refresh"
        )
        
        # Store token metadata
        await auth_handler.token_manager.store_token_metadata(
            user.id,
            token_family,
            device_context,
            security_context
        )
        
        return Token(
            access_token=access_token,
            token_type=auth_handler.token_type,
            refresh_token=refresh_token,
            token_family=token_family
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

# Export public interface
__all__ = [
    "router",
    "AuthHandler",
    "oauth2_scheme"
]