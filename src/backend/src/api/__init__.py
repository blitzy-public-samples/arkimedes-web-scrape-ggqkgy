"""
API package initialization module that configures and exports a production-ready FastAPI application
instance with comprehensive middleware, monitoring, security, and error handling capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from datetime import datetime
from typing import Dict, Any

# Third-party imports with versions
from fastapi import FastAPI, Request, Response  # v0.100.0
from fastapi.middleware.cors import CORSMiddleware  # v0.100.0
from prometheus_client import Counter, Histogram  # v0.17.0
import structlog  # v23.1.0

# Internal imports
from .server import app
from .core.config import settings
from .core.middleware import (
    RateLimitMiddleware,
    AuthMiddleware,
    request_logging_middleware,
    error_handling_middleware
)

# Initialize version
__version__ = '1.0.0'

# Initialize structured logging
logger = structlog.get_logger(__name__)

# Initialize Prometheus metrics
request_counter = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"]
)
request_latency = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"]
)

def configure_app(app: FastAPI) -> FastAPI:
    """
    Configures the FastAPI application with comprehensive middleware stack,
    security features, and monitoring capabilities.

    Args:
        app: FastAPI application instance

    Returns:
        FastAPI: Configured application instance
    """
    try:
        # Configure OpenAPI documentation
        app.title = settings.PROJECT_NAME
        app.description = "Enterprise Web Scraping Platform API"
        app.version = __version__
        app.docs_url = "/api/docs"
        app.redoc_url = "/api/redoc"
        app.openapi_url = "/api/openapi.json"

        # Configure security headers middleware
        @app.middleware("http")
        async def add_security_headers(request: Request, call_next):
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            return response

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

        # Configure request logging middleware
        app.middleware("http")(request_logging_middleware)

        # Configure rate limiting middleware
        app.add_middleware(
            RateLimitMiddleware,
            redis_client=settings.get_redis_client(),
            rate_limit=settings.RATE_LIMIT_PER_MINUTE
        )

        # Configure authentication middleware
        app.add_middleware(AuthMiddleware)

        # Configure error handling middleware
        app.middleware("http")(error_handling_middleware)

        # Configure startup event handler
        @app.on_event("startup")
        async def startup_event():
            logger.info(
                "Starting application server",
                version=__version__,
                environment=settings.API_ENVIRONMENT
            )

        # Configure shutdown event handler
        @app.on_event("shutdown")
        async def shutdown_event():
            logger.info("Shutting down application server")

        logger.info(
            "Application configured successfully",
            version=__version__,
            environment=settings.API_ENVIRONMENT
        )

        return app

    except Exception as e:
        logger.error(
            "Failed to configure application",
            error=str(e),
            exc_info=True
        )
        raise

# Configure and export application instance
app = configure_app(app)

# Export public interface
__all__ = [
    'app',
    '__version__'
]