"""
Core middleware module implementing enterprise-grade request/response processing,
authentication, rate limiting, and logging for the FastAPI web scraping platform.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import time
import uuid
from typing import Dict, Optional, Callable, Any
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
import structlog  # v23.1.0
from redis import Redis  # v4.5.0
from circuitbreaker import circuit  # v1.4.0

# Internal imports
from .config import settings
from .security import decode_access_token
from ...services.metrics import MetricsCollector
from ...utils.logging import get_logger, set_correlation_id

# Constants
RATE_LIMIT_WINDOW = 60  # 1 minute window
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
CIRCUIT_BREAKER_RECOVERY_TIMEOUT = 30

# Initialize services
logger = structlog.get_logger(__name__)
metrics_collector = MetricsCollector()

class RateLimitMiddleware:
    """
    Enhanced rate limiting middleware with Redis connection pooling,
    circuit breakers, and fallback mechanisms.
    """

    def __init__(self, redis_client: Redis, rate_limit: int = settings.RATE_LIMIT_PER_MINUTE):
        """Initialize rate limit middleware with Redis connection pooling."""
        self.redis_client = redis_client
        self.rate_limit = rate_limit
        self.redis_pool = Redis(
            connection_pool=redis_client.connection_pool,
            socket_timeout=settings.REQUEST_TIMEOUT_SECONDS,
            retry_on_timeout=True
        )
        self.fallback_limits: Dict[str, Dict] = {}
        logger.info("Rate limit middleware initialized", rate_limit=rate_limit)

    @circuit(failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            recovery_timeout=CIRCUIT_BREAKER_RECOVERY_TIMEOUT)
    async def check_rate_limit(self, client_id: str, tier: str) -> bool:
        """Check rate limit with atomic Redis operations and fallback mechanism."""
        try:
            # Atomic rate limit check
            key = f"rate_limit:{tier}:{client_id}"
            pipe = self.redis_client.pipeline()
            
            # Multi-command atomic operation
            pipe.incr(key)
            pipe.expire(key, RATE_LIMIT_WINDOW)
            current_requests = pipe.execute()[0]

            # Check against limit
            is_limited = current_requests > self.rate_limit

            # Record metrics
            metrics_collector.record_rate_limit_event(
                client_id=client_id,
                tier=tier,
                is_limited=is_limited
            )

            return is_limited

        except Exception as e:
            logger.error("Redis rate limit check failed", error=str(e))
            
            # Fallback to in-memory rate limiting
            if client_id not in self.fallback_limits:
                self.fallback_limits[client_id] = {
                    "count": 0,
                    "window_start": time.time()
                }

            # Reset window if expired
            current_time = time.time()
            if current_time - self.fallback_limits[client_id]["window_start"] > RATE_LIMIT_WINDOW:
                self.fallback_limits[client_id] = {
                    "count": 1,
                    "window_start": current_time
                }
                return False

            # Increment counter
            self.fallback_limits[client_id]["count"] += 1
            return self.fallback_limits[client_id]["count"] > self.rate_limit

class AuthMiddleware:
    """Enhanced authentication middleware with token caching and RBAC."""

    def __init__(self, cache_ttl: int = 300):
        """Initialize authentication middleware with caching."""
        self.token_cache: Dict[str, Dict] = {}
        self.cache_ttl = cache_ttl
        self.role_permissions = {
            "admin": {"can_write": True, "can_delete": True},
            "operator": {"can_write": True, "can_delete": False},
            "viewer": {"can_write": False, "can_delete": False}
        }
        logger.info("Auth middleware initialized", cache_ttl=cache_ttl)

    async def authenticate(self, request: Request) -> Dict:
        """Validate JWT with caching and RBAC checks."""
        try:
            # Extract token
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                raise ValueError("Missing or invalid authorization header")

            token = auth_header.split(" ")[1]

            # Check cache
            if token in self.token_cache:
                cache_entry = self.token_cache[token]
                if time.time() - cache_entry["timestamp"] < self.cache_ttl:
                    return cache_entry["claims"]

            # Validate token
            claims = decode_access_token(token)

            # Verify role permissions
            role = claims.get("role", "viewer")
            if role not in self.role_permissions:
                raise ValueError(f"Invalid role: {role}")

            # Update cache
            self.token_cache[token] = {
                "claims": claims,
                "timestamp": time.time()
            }

            # Record metrics
            metrics_collector.record_auth_event(
                user_id=claims.get("sub"),
                role=role,
                success=True
            )

            return claims

        except Exception as e:
            logger.error("Authentication failed", error=str(e))
            metrics_collector.record_auth_event(
                user_id=None,
                role=None,
                success=False
            )
            raise

async def request_logging_middleware(request: Request, call_next: Callable) -> Response:
    """Enhanced request logging with correlation IDs and sampling."""
    # Generate correlation ID
    correlation_id = str(uuid.uuid4())
    set_correlation_id(correlation_id)

    # Start timing
    start_time = time.time()

    # Log request
    logger.info(
        "Request started",
        method=request.method,
        url=str(request.url),
        correlation_id=correlation_id,
        client_host=request.client.host if request.client else None,
        headers={k: v for k, v in request.headers.items() if k.lower() not in {"authorization"}}
    )

    try:
        # Process request
        response = await call_next(request)

        # Calculate duration
        duration = time.time() - start_time

        # Log response
        logger.info(
            "Request completed",
            status_code=response.status_code,
            duration=duration,
            correlation_id=correlation_id
        )

        # Add correlation ID header
        response.headers["X-Correlation-ID"] = correlation_id

        # Collect metrics
        metrics_collector.collect_system_metrics(
            request_duration=duration,
            status_code=response.status_code,
            endpoint=str(request.url.path)
        )

        return response

    except Exception as e:
        logger.error(
            "Request failed",
            error=str(e),
            correlation_id=correlation_id,
            exc_info=True
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "correlation_id": correlation_id}
        )

async def error_handling_middleware(request: Request, call_next: Callable) -> Response:
    """Comprehensive error handling with recovery mechanisms."""
    try:
        return await call_next(request)

    except Exception as e:
        error_id = str(uuid.uuid4())
        logger.error(
            "Unhandled exception",
            error_id=error_id,
            error=str(e),
            exc_info=True
        )

        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "error_id": error_id,
                "message": str(e) if settings.DEBUG else "An unexpected error occurred"
            }
        )

# Export middleware components
__all__ = [
    "RateLimitMiddleware",
    "AuthMiddleware",
    "request_logging_middleware",
    "error_handling_middleware"
]