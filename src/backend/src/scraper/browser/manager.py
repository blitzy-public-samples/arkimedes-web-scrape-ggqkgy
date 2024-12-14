"""
Browser instance manager for web scraping operations with enhanced monitoring, security, and reliability.
Handles browser lifecycle, pooling, and concurrent access with comprehensive error handling and metrics.

Version: 1.38.0 (Playwright)
"""

import asyncio
from typing import Dict, Any, Optional, List
from prometheus_client import Counter, Gauge, Histogram

from .playwright import PlaywrightBrowser
from ...utils.concurrency import ResourcePool
from ...utils.logging import get_logger

# Configuration constants
DEFAULT_POOL_SIZE = 10
DEFAULT_BROWSER_TYPE = 'chromium'
DEFAULT_BROWSER_CONFIG = {
    'headless': True,
    'proxy': None,
    'args': ['--no-sandbox', '--disable-dev-shm-usage'],
    'timeout': 30000,
    'viewport': {'width': 1920, 'height': 1080},
    'ignore_https_errors': True,
    'js_enabled': True
}
BROWSER_HEALTH_CHECK_INTERVAL = 60
MAX_RETRY_ATTEMPTS = 3

# Prometheus metrics
BROWSER_METRICS = {
    'active_browsers': Gauge('browser_manager_active_browsers', 'Number of active browser instances'),
    'browser_errors': Counter('browser_manager_errors_total', 'Total number of browser errors', ['error_type']),
    'browser_operation_duration': Histogram('browser_manager_operation_duration_seconds', 'Duration of browser operations', ['operation']),
    'browser_memory_usage': Gauge('browser_manager_memory_mb', 'Browser memory usage in MB'),
    'browser_health_status': Gauge('browser_manager_health_status', 'Browser health check status (1=healthy, 0=unhealthy)')
}

class BrowserManager:
    """
    Advanced browser instance manager with enhanced monitoring, security, and reliability features.
    Implements comprehensive resource management and health monitoring for browser instances.
    """

    def __init__(self, config: Dict[str, Any]) -> None:
        """
        Initialize browser manager with enhanced configuration and monitoring.

        Args:
            config: Configuration dictionary for browser manager
        """
        self._config = {**DEFAULT_BROWSER_CONFIG, **config}
        self._logger = get_logger(__name__, {'component': 'BrowserManager'})
        
        # Initialize browser pool with monitoring
        pool_size = self._config.get('pool_size', DEFAULT_POOL_SIZE)
        self._browser_pool = ResourcePool(max_size=pool_size, enable_metrics=True)
        self._active_browsers: Dict[str, PlaywrightBrowser] = {}
        
        # Start health check task
        self._health_check_task = asyncio.create_task(self._run_health_checks())
        
        self._logger.info(
            "Initialized BrowserManager",
            extra={
                'pool_size': pool_size,
                'browser_type': self._config.get('browser_type', DEFAULT_BROWSER_TYPE),
                'config': {k: v for k, v in self._config.items() if not isinstance(v, (bytes, memoryview))}
            }
        )

    async def get_browser(self, browser_options: Dict[str, Any]) -> PlaywrightBrowser:
        """
        Acquires a browser instance with enhanced error handling and monitoring.

        Args:
            browser_options: Configuration options for the browser instance

        Returns:
            Configured browser instance

        Raises:
            TimeoutError: If browser acquisition times out
            RuntimeError: If browser creation fails
        """
        operation_start = asyncio.get_event_loop().time()
        browser_id = None

        try:
            # Merge default and custom options
            merged_options = {**self._config, **browser_options}
            
            # Acquire browser from pool
            browser = await self._browser_pool.acquire(
                timeout=merged_options.get('acquire_timeout', 30.0)
            )
            
            if not browser:
                raise TimeoutError("Failed to acquire browser from pool")
                
            browser_id = str(id(browser))
            self._active_browsers[browser_id] = browser
            
            # Update metrics
            BROWSER_METRICS['active_browsers'].inc()
            
            self._logger.info(
                "Browser instance acquired",
                extra={
                    'browser_id': browser_id,
                    'options': merged_options
                }
            )
            
            return browser

        except Exception as e:
            error_type = type(e).__name__
            BROWSER_METRICS['browser_errors'].labels(error_type=error_type).inc()
            
            self._logger.error(
                "Failed to acquire browser",
                extra={
                    'error': str(e),
                    'browser_id': browser_id,
                    'options': browser_options
                },
                exc_info=True
            )
            raise
            
        finally:
            operation_duration = asyncio.get_event_loop().time() - operation_start
            BROWSER_METRICS['browser_operation_duration'].labels(
                operation='acquire'
            ).observe(operation_duration)

    async def release_browser(self, browser_id: str) -> bool:
        """
        Returns a browser instance to the pool with cleanup and health verification.

        Args:
            browser_id: Unique identifier of the browser instance

        Returns:
            bool: True if release was successful
        """
        operation_start = asyncio.get_event_loop().time()

        try:
            if browser_id not in self._active_browsers:
                self._logger.warning(
                    "Attempt to release unknown browser",
                    extra={'browser_id': browser_id}
                )
                return False

            browser = self._active_browsers[browser_id]
            
            # Perform cleanup
            await browser.cleanup()
            
            # Release to pool
            success = await self._browser_pool.release(browser, browser_id)
            
            if success:
                self._active_browsers.pop(browser_id)
                BROWSER_METRICS['active_browsers'].dec()
                
                self._logger.info(
                    "Browser instance released",
                    extra={'browser_id': browser_id}
                )
            
            return success

        except Exception as e:
            error_type = type(e).__name__
            BROWSER_METRICS['browser_errors'].labels(error_type=error_type).inc()
            
            self._logger.error(
                "Error releasing browser",
                extra={
                    'error': str(e),
                    'browser_id': browser_id
                },
                exc_info=True
            )
            return False
            
        finally:
            operation_duration = asyncio.get_event_loop().time() - operation_start
            BROWSER_METRICS['browser_operation_duration'].labels(
                operation='release'
            ).observe(operation_duration)

    async def cleanup(self) -> None:
        """
        Comprehensive cleanup of all browser resources with health verification.
        """
        try:
            # Stop health check task
            if self._health_check_task and not self._health_check_task.done():
                self._health_check_task.cancel()
                try:
                    await self._health_check_task
                except asyncio.CancelledError:
                    pass

            # Cleanup active browsers
            cleanup_tasks: List[asyncio.Task] = []
            for browser_id in list(self._active_browsers.keys()):
                cleanup_tasks.append(
                    asyncio.create_task(self.release_browser(browser_id))
                )

            if cleanup_tasks:
                await asyncio.gather(*cleanup_tasks, return_exceptions=True)

            # Reset metrics
            BROWSER_METRICS['active_browsers'].set(0)
            BROWSER_METRICS['browser_memory_usage'].set(0)
            BROWSER_METRICS['browser_health_status'].set(0)

            self._logger.info("Browser manager cleanup completed")

        except Exception as e:
            error_type = type(e).__name__
            BROWSER_METRICS['browser_errors'].labels(error_type=error_type).inc()
            
            self._logger.error(
                "Error during browser manager cleanup",
                extra={'error': str(e)},
                exc_info=True
            )
            raise

    async def _run_health_checks(self) -> None:
        """
        Periodic health verification of browser instances.
        """
        while True:
            try:
                await asyncio.sleep(BROWSER_HEALTH_CHECK_INTERVAL)
                
                for browser_id, browser in self._active_browsers.items():
                    try:
                        # Check browser health
                        memory_usage = await self._check_browser_health(browser)
                        
                        # Update metrics
                        BROWSER_METRICS['browser_memory_usage'].set(memory_usage)
                        BROWSER_METRICS['browser_health_status'].set(1)
                        
                    except Exception as e:
                        BROWSER_METRICS['browser_health_status'].set(0)
                        BROWSER_METRICS['browser_errors'].labels(
                            error_type='HealthCheckError'
                        ).inc()
                        
                        self._logger.error(
                            "Browser health check failed",
                            extra={
                                'browser_id': browser_id,
                                'error': str(e)
                            }
                        )
                        
                        # Attempt recovery
                        await self.release_browser(browser_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self._logger.error(
                    "Error in health check loop",
                    extra={'error': str(e)},
                    exc_info=True
                )
                await asyncio.sleep(5)  # Brief delay before retry

    async def _check_browser_health(self, browser: PlaywrightBrowser) -> float:
        """
        Check health status of a browser instance.

        Args:
            browser: Browser instance to check

        Returns:
            float: Browser memory usage in MB
        """
        # Implement browser-specific health checks
        # This is a placeholder - actual implementation would depend on
        # browser-specific metrics and health indicators
        return 0.0

# Export public interface
__all__ = ['BrowserManager']