"""
Core initialization module for the web scraping platform API.
Provides comprehensive configuration, security, monitoring, and middleware setup.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
import logging
from typing import Dict, Any

# Third-party imports with versions
from fastapi import FastAPI  # v0.100.0
from prometheus_client import CollectorRegistry, Counter, Histogram  # v0.17.0
from opentelemetry import trace  # v1.20.0
from opentelemetry.sdk.trace import TracerProvider  # v1.20.0
from opentelemetry.sdk.trace.export import BatchSpanProcessor  # v1.20.0
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter  # v1.20.0

# Internal imports
from .config import settings
from .exceptions import WebScraperException, RateLimitExceeded, ProxyError
from .middleware import (
    RateLimitMiddleware,
    AuthMiddleware,
    request_logging_middleware,
    error_handling_middleware
)
from ...services.metrics import MetricsService
from ...services.cache import CacheService
from ...utils.logging import setup_logging, get_logger

# Module constants
VERSION = "1.0.0"
API_PREFIX = "/api/v1"
METRICS_PREFIX = "web_scraper_api"
DEFAULT_TIMEOUT = 30.0

# Initialize logging
logger = get_logger(__name__)

def initialize_monitoring(app: FastAPI) -> None:
    """
    Initialize comprehensive monitoring, metrics collection, and distributed tracing.
    
    Args:
        app: FastAPI application instance
    """
    # Initialize Prometheus metrics
    registry = CollectorRegistry()
    
    # Request metrics
    request_counter = Counter(
        f"{METRICS_PREFIX}_requests_total",
        "Total API requests",
        ["method", "endpoint", "status"],
        registry=registry
    )
    
    request_latency = Histogram(
        f"{METRICS_PREFIX}_request_duration_seconds",
        "Request duration in seconds",
        ["method", "endpoint"],
        buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0),
        registry=registry
    )
    
    # Initialize OpenTelemetry tracing
    trace.set_tracer_provider(TracerProvider())
    otlp_exporter = OTLPSpanExporter(
        endpoint=settings.OTLP_ENDPOINT,
        insecure=not settings.OTLP_USE_SSL
    )
    span_processor = BatchSpanProcessor(otlp_exporter)
    trace.get_tracer_provider().add_span_processor(span_processor)
    
    # Add metrics middleware
    @app.middleware("http")
    async def metrics_middleware(request, call_next):
        request_counter.labels(
            method=request.method,
            endpoint=request.url.path,
            status="pending"
        ).inc()
        
        with request_latency.labels(
            method=request.method,
            endpoint=request.url.path
        ).time():
            response = await call_next(request)
            
        request_counter.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        
        return response

def configure_security(app: FastAPI) -> None:
    """
    Configure comprehensive security middleware and settings.
    
    Args:
        app: FastAPI application instance
    """
    # Initialize cache service for rate limiting
    cache_service = CacheService(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD,
        use_ssl=True
    )
    
    # Initialize rate limiting middleware
    rate_limit = RateLimitMiddleware(
        redis_client=cache_service._redis_client,
        rate_limit=settings.RATE_LIMIT_PER_MINUTE
    )
    
    # Initialize authentication middleware
    auth = AuthMiddleware(cache_ttl=300)
    
    # Add security middleware
    app.middleware("http")(rate_limit.check_rate_limit)
    app.middleware("http")(auth.authenticate)
    
    # Configure security headers
    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

def create_application() -> FastAPI:
    """
    Create and configure the FastAPI application with all required middleware and settings.
    
    Returns:
        FastAPI: Configured application instance
    """
    # Initialize FastAPI with configuration
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=VERSION,
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=f"{API_PREFIX}/redoc",
        openapi_url=f"{API_PREFIX}/openapi.json",
        debug=settings.DEBUG
    )
    
    # Configure logging
    setup_logging(
        log_level=logging.INFO if not settings.DEBUG else logging.DEBUG,
        log_file_path=settings.LOG_FILE_PATH
    )
    
    # Initialize monitoring
    initialize_monitoring(app)
    
    # Configure security
    configure_security(app)
    
    # Add core middleware
    app.middleware("http")(request_logging_middleware)
    app.middleware("http")(error_handling_middleware)
    
    logger.info(
        "FastAPI application initialized successfully",
        extra={"version": VERSION, "environment": settings.ENVIRONMENT}
    )
    
    return app

# Initialize application instance
app = create_application()

# Export public interface
__all__ = [
    "app",
    "settings",
    "WebScraperException",
    "RateLimitExceeded",
    "ProxyError",
    "VERSION",
    "API_PREFIX"
]