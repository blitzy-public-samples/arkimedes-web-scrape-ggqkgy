"""
Core FastAPI dependency injection module providing enterprise-grade dependencies for authentication,
database sessions, rate limiting, and middleware with comprehensive security features.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from typing import AsyncGenerator, Dict, Optional
from datetime import datetime
import logging
import json

# Third-party imports with versions
from fastapi import Depends, HTTPException, status, Request, Header  # v0.100.0
from sqlalchemy.ext.asyncio import AsyncSession  # v2.0.0
import redis  # v4.5.0
import structlog  # v23.1.0

# Internal imports
from .security import decode_access_token
from .config import settings
from ...services.auth import AuthService

# Configure structured logging
logger = structlog.get_logger(__name__)

# Initialize Redis client for rate limiting
redis_client = redis.Redis.from_url(
    settings.get_redis_uri(),
    decode_responses=True,
    health_check_interval=30
)

class RateLimiter:
    """Enhanced rate limiting implementation with burst support and monitoring."""

    def __init__(
        self,
        redis_client: redis.Redis,
        rate_limit: int = settings.RATE_LIMIT_PER_MINUTE,
        burst_multiplier: float = 1.5,
        cleanup_interval: int = 3600
    ):
        """
        Initialize rate limiter with Redis backend and configuration.
        
        Args:
            redis_client: Redis client instance
            rate_limit: Requests per minute limit
            burst_multiplier: Burst allowance multiplier
            cleanup_interval: Cleanup interval in seconds
        """
        self._redis_client = redis_client
        self._rate_limit = rate_limit
        self._burst_multiplier = burst_multiplier
        self._cleanup_interval = cleanup_interval

    async def check_rate_limit(self, client_id: str, tier: str) -> Dict:
        """
        Check rate limit with burst support and monitoring.
        
        Args:
            client_id: Unique client identifier
            tier: Client tier for limit calculation
            
        Returns:
            Dict containing rate limit status and metrics
        """
        try:
            # Calculate tier-based limits
            base_limit = self._rate_limit
            if tier == "premium":
                base_limit *= 2
            elif tier == "enterprise":
                base_limit *= 5

            # Calculate burst limit
            burst_limit = int(base_limit * self._burst_multiplier)

            # Generate Redis keys
            count_key = f"ratelimit:{client_id}:count"
            reset_key = f"ratelimit:{client_id}:reset"

            # Get current usage
            pipe = self._redis_client.pipeline()
            pipe.incr(count_key)
            pipe.get(reset_key)
            current_count, reset_time = await pipe.execute()

            # Initialize reset time if not set
            if not reset_time:
                reset_time = datetime.utcnow().timestamp() + 60
                await self._redis_client.setex(reset_key, 60, reset_time)

            # Check limits
            is_allowed = int(current_count) <= burst_limit

            # Prepare response headers
            headers = {
                "X-RateLimit-Limit": str(base_limit),
                "X-RateLimit-Remaining": str(max(0, burst_limit - int(current_count))),
                "X-RateLimit-Reset": reset_time
            }

            # Log metrics
            logger.info(
                "rate_limit_check",
                client_id=client_id,
                tier=tier,
                current_count=current_count,
                is_allowed=is_allowed
            )

            return {
                "allowed": is_allowed,
                "headers": headers,
                "current_count": int(current_count)
            }

        except redis.RedisError as e:
            logger.error("rate_limit_error", error=str(e))
            return {"allowed": True, "headers": {}, "current_count": 0}

# Initialize rate limiter
rate_limiter = RateLimiter(redis_client)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Enhanced FastAPI dependency for database session management with connection pooling.
    
    Yields:
        AsyncSession: Managed database session with automatic cleanup
    """
    session = None
    try:
        # Get session from pool
        session = await AsyncSession()
        
        # Configure session
        await session.execute("SET SESSION statement_timeout = '30s'")
        await session.execute("SET SESSION idle_in_transaction_session_timeout = '60s'")
        
        # Log session creation
        logger.info("database_session_created", session_id=id(session))
        
        yield session
        
    except Exception as e:
        logger.error("database_session_error", error=str(e))
        if session:
            await session.rollback()
        raise
    finally:
        if session:
            await session.close()
            logger.info("database_session_closed", session_id=id(session))

async def get_current_user(
    authorization: str = Header(...),
    mfa_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Dict:
    """
    Enhanced FastAPI dependency for JWT authentication with MFA support.
    
    Args:
        authorization: JWT token in Authorization header
        mfa_token: Optional MFA token
        db: Database session
        
    Returns:
        Dict containing authenticated user information
        
    Raises:
        HTTPException: If authentication fails
    """
    try:
        # Extract token
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication scheme"
            )
        token = authorization.split(" ")[1]

        # Decode and validate token
        try:
            payload = decode_access_token(token)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(e)
            )

        # Initialize auth service
        auth_service = AuthService(redis_client)

        # Get user from database
        user = await auth_service.get_user_by_id(payload["sub"], db)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # Check MFA if enabled
        if user.is_mfa_enabled and not mfa_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="MFA token required"
            )
        elif user.is_mfa_enabled:
            mfa_valid = await auth_service.verify_mfa(user, mfa_token)
            if not mfa_valid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid MFA token"
                )

        # Log authentication
        logger.info(
            "user_authenticated",
            user_id=user.id,
            username=user.username,
            mfa_enabled=user.is_mfa_enabled
        )

        return {
            "id": str(user.id),
            "username": user.username,
            "role": user.role,
            "permissions": user.get_permissions()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("authentication_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )

async def check_rate_limit(
    request: Request,
    user: Dict = Depends(get_current_user)
) -> bool:
    """
    Enhanced FastAPI dependency for advanced rate limiting with burst support.
    
    Args:
        request: FastAPI request object
        user: Authenticated user information
        
    Returns:
        bool: True if within rate limit
        
    Raises:
        HTTPException: If rate limit exceeded
    """
    try:
        # Generate client identifier
        client_id = f"{user['id']}:{request.client.host}"

        # Check rate limit
        result = await rate_limiter.check_rate_limit(client_id, user.get("tier", "basic"))

        # Add rate limit headers
        for header, value in result["headers"].items():
            request.state.rate_limit_headers[header] = value

        if not result["allowed"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded",
                headers=result["headers"]
            )

        return True

    except HTTPException:
        raise
    except Exception as e:
        logger.error("rate_limit_error", error=str(e))
        return True

async def verify_api_key(
    api_key: str = Header(...),
    db: AsyncSession = Depends(get_db)
) -> Dict:
    """
    Enhanced FastAPI dependency for API key authentication.
    
    Args:
        api_key: API key header
        db: Database session
        
    Returns:
        Dict containing API client information
        
    Raises:
        HTTPException: If API key is invalid
    """
    try:
        # Initialize auth service
        auth_service = AuthService(redis_client)

        # Verify API key
        client = await auth_service.verify_api_key(api_key, db)
        if not client:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key"
            )

        # Log API key usage
        logger.info(
            "api_key_used",
            client_id=client["id"],
            client_name=client["name"]
        )

        return client

    except HTTPException:
        raise
    except Exception as e:
        logger.error("api_key_verification_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key verification failed"
        )

# Export public interface
__all__ = [
    "get_db",
    "get_current_user",
    "check_rate_limit",
    "verify_api_key",
    "RateLimiter"
]