"""
Web Scraping Platform - Scraper Module Initialization
Provides secure, high-performance entry point for the scraping engine with comprehensive
monitoring and resource management capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import logging
from typing import Dict, Any, Optional, AsyncIterator
from contextlib import asynccontextmanager

# Internal imports with version comments
from .scheduler import TaskScheduler  # v1.0.0
from .config import scraper_settings  # v1.0.0
from .browser.manager import BrowserManager  # v1.38.0 (Playwright)
from ..utils.logging import get_logger

# Module version
__version__ = "1.0.0"

# Configure module-level logger
logger = get_logger(__name__, {"component": "ScrapeEngine"})

# Thread safety lock for initialization
_lock = asyncio.Lock()
_instance: Optional[TaskScheduler] = None

@asynccontextmanager
async def initialize_scraper(
    config: Dict[str, Any],
    validate_ssl: bool = True
) -> AsyncIterator[TaskScheduler]:
    """
    Initialize the scraping engine with comprehensive validation and monitoring.
    Implements thread-safe singleton pattern with resource cleanup.

    Args:
        config: Configuration dictionary for scraper initialization
        validate_ssl: Flag to enable SSL certificate validation

    Yields:
        TaskScheduler: Initialized task scheduler instance

    Raises:
        ValueError: If configuration validation fails
        RuntimeError: If initialization fails
    """
    global _instance

    try:
        async with _lock:
            # Validate configuration
            if not scraper_settings.validate_configuration():
                raise ValueError("Invalid scraper configuration")

            # Configure logging
            log_config = config.get("logging", {})
            logger.setLevel(log_config.get("level", logging.INFO))

            if not _instance:
                logger.info(
                    "Initializing scraper engine",
                    extra={
                        "config": {
                            k: v for k, v in config.items() 
                            if not isinstance(v, (bytes, memoryview))
                        }
                    }
                )

                # Initialize browser manager
                browser_manager = BrowserManager(
                    scraper_settings.get_browser_context_options()
                )

                # Initialize task scheduler
                _instance = TaskScheduler(
                    browser_manager=browser_manager,
                    config=config
                )

                # Perform health check
                if not await _instance.health_check():
                    raise RuntimeError("Scheduler health check failed")

                logger.info("Scraper engine initialized successfully")

            yield _instance

    except Exception as e:
        logger.error(
            "Failed to initialize scraper engine",
            extra={"error": str(e)},
            exc_info=True
        )
        raise

async def shutdown_scraper(
    scheduler: TaskScheduler,
    wait_for_tasks: bool = True
) -> None:
    """
    Perform graceful shutdown of the scraping engine with resource cleanup.

    Args:
        scheduler: Task scheduler instance to shut down
        wait_for_tasks: Flag to wait for active tasks completion

    Raises:
        RuntimeError: If shutdown process fails
    """
    global _instance

    try:
        async with _lock:
            if scheduler is not _instance:
                logger.warning("Attempt to shut down unregistered scheduler instance")
                return

            logger.info("Initiating scraper engine shutdown")

            # Cancel or wait for active tasks
            if not wait_for_tasks:
                await scheduler.cancel_all_tasks()
            else:
                await scheduler.wait_for_tasks()

            # Stop scheduler and cleanup resources
            await scheduler.cleanup()

            # Reset singleton instance
            _instance = None

            logger.info("Scraper engine shutdown completed")

    except Exception as e:
        logger.error(
            "Error during scraper engine shutdown",
            extra={"error": str(e)},
            exc_info=True
        )
        raise RuntimeError(f"Shutdown failed: {str(e)}")

    finally:
        # Ensure logs are flushed
        for handler in logger.handlers:
            handler.flush()

# Export public interface
__all__ = [
    "__version__",
    "initialize_scraper",
    "shutdown_scraper",
    "TaskScheduler",
    "scraper_settings"
]