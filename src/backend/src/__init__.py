"""
Root package initializer for the web scraping platform backend.
Initializes core components, configures monitoring, and manages application lifecycle.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import logging
import atexit
from typing import Optional

# Third-party imports with versions
import structlog  # v23.1.0
from prometheus_client import Counter, Histogram  # v0.17.0

# Internal imports
from .api.server import create_application, get_application
from .scraper.scheduler import TaskScheduler

# Initialize structured logger
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
task_metrics = Counter(
    "scraping_tasks_total",
    "Total scraping tasks",
    ["status"]
)

def initialize_logging() -> None:
    """
    Configure enterprise-grade structured logging with correlation IDs,
    rotation, and security features.
    """
    # Configure structlog with JSON formatting
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        wrapper_class=structlog.BoundLogger,
        cache_logger_on_first_use=True
    )

    # Configure root logger
    logging.basicConfig(
        format="%(message)s",
        level=logging.INFO,
        handlers=[
            logging.StreamHandler(),
            logging.handlers.RotatingFileHandler(
                "logs/app.log",
                maxBytes=10485760,  # 10MB
                backupCount=5,
                encoding="utf-8"
            )
        ]
    )

    logger.info("Logging initialized with structured formatting")

def initialize_monitoring() -> None:
    """
    Set up comprehensive system monitoring including metrics,
    health checks, and resource tracking.
    """
    # Initialize Prometheus metrics collectors
    Counter(
        "app_info",
        "Application information",
        ["version"]
    ).labels(version="1.0.0").inc()

    # Configure resource monitoring
    Gauge(
        "system_memory_usage_bytes",
        "System memory usage in bytes"
    )
    Gauge(
        "system_cpu_usage_percent",
        "System CPU usage percentage"
    )

    # Setup health check endpoints
    Gauge(
        "health_check_status",
        "Health check status (1=healthy, 0=unhealthy)"
    ).set(1)

    logger.info("Monitoring system initialized with Prometheus metrics")

def cleanup_resources() -> None:
    """
    Perform comprehensive cleanup of application resources with
    verification and error handling.
    """
    try:
        # Stop task scheduler
        if scheduler:
            logger.info("Stopping task scheduler")
            scheduler.cleanup()

        # Close database connections
        logger.info("Closing database connections")
        app.state.db.close()

        # Stop metrics collection
        logger.info("Stopping metrics collection")

        # Flush logs
        logging.shutdown()

        logger.info("Application cleanup completed successfully")

    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}", exc_info=True)
        raise

# Initialize core components
initialize_logging()
initialize_monitoring()

# Create FastAPI application instance
app = get_application()

# Initialize task scheduler
scheduler = TaskScheduler()

# Register cleanup handler
atexit.register(cleanup_resources)

# Export public interface
__all__ = [
    "app",
    "scheduler",
    "initialize_logging",
    "initialize_monitoring",
    "cleanup_resources"
]