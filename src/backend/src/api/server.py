"""
Enterprise-grade FastAPI application server module that configures and initializes 
the web scraping platform's REST API with comprehensive middleware stack, security 
features, observability, and high availability support.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
from functools import lru_cache
from typing import Dict, Any, Optional

# Third-party imports with versions
from fastapi import FastAPI, Request, Response  # v0.100.0
from fastapi.middleware.cors import CORSMiddleware  # v0.100.0
from prometheus_client import CollectorRegistry, Counter, Histogram  # v0.17.0
import structlog  # v23.1.0
import redis.asyncio as redis  # v4.5.0

# Internal imports
from .core.config import settings
from .core.middleware import (
    RateLimitMiddleware,
    AuthMiddleware,
    request_logging_middleware,
    error_handling_middleware
)
from .routes import (
    health_router,
    tasks_router,
    metrics_router
)

# Initialize structured logging
logger = structlog.get_logger(__name__)

# Initialize Prometheus metrics
REGISTRY = CollectorRegistry()
request_counter = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
    registry=REGISTRY
)
request_latency = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    registry=REGISTRY
)

def create_application() -> FastAPI:
    """
    Creates and configures the FastAPI application instance with comprehensive
    middleware stack and security features.

    Returns:
        FastAPI: Configured FastAPI application instance
    """
    # Initialize FastAPI with enhanced OpenAPI documentation
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="Enterprise Web Scraping Platform API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        debug=settings.DEBUG
    )

    # Configure security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # Configure request tracing middleware
    app.middleware("http")(request_logging_middleware)

    # Configure rate limiting with Redis
    redis_client = redis.Redis.from_url(
        settings.get_redis_uri(),
        encoding="utf-8",
        decode_responses=True
    )
    app.add_middleware(
        RateLimitMiddleware,
        redis_client=redis_client,
        rate_limit=settings.RATE_LIMIT_CONFIG["requests_per_minute"]
    )

    # Configure authentication middleware
    app.add_middleware(AuthMiddleware)

    # Configure error handling middleware
    app.middleware("http")(error_handling_middleware)

    # Configure CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Total-Count",
            "X-Page-Count",
            "X-Current-Page",
            "X-Rate-Limit-Remaining",
            "X-Rate-Limit-Reset"
        ]
    )

    # Register routers
    app.include_router(
        health_router,
        prefix=f"{settings.API_V1_PREFIX}/health",
        tags=["health"]
    )
    app.include_router(
        tasks_router,
        prefix=f"{settings.API_V1_PREFIX}/tasks",
        tags=["tasks"]
    )
    app.include_router(
        metrics_router,
        prefix=f"{settings.API_V1_PREFIX}/metrics",
        tags=["metrics"]
    )

    # Configure startup event handler
    @app.on_event("startup")
    async def startup_event():
        logger.info(
            "Starting application server",
            version="1.0.0",
            debug=settings.DEBUG
        )

    # Configure shutdown event handler
    @app.on_event("shutdown")
    async def shutdown_event():
        logger.info("Shutting down application server")
        # Close Redis connection
        await redis_client.close()
        # Allow time for cleanup
        await asyncio.sleep(1)

    return app

@lru_cache()
def get_application() -> FastAPI:
    """
    Returns singleton FastAPI application instance with caching.

    Returns:
        FastAPI: Cached FastAPI application instance
    """
    return create_application()

# Export application instance
app = get_application()

# Export public interface
__all__ = [
    "app",
    "create_application",
    "get_application"
]