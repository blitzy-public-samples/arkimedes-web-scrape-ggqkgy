"""
Enterprise-grade proxy middleware component for managing proxy server integration
in web scraping operations. Implements advanced proxy rotation, failure recovery,
circuit breaking, and secure request routing.
"""

# Standard library imports
import ssl
import logging
from typing import Dict, Optional, Tuple, Any
import asyncio

# External imports
import aiohttp  # v3.8.0
from cachetools import TTLCache  # v5.3.0
from circuit_breaker import CircuitBreaker  # v1.0.0

# Internal imports
from ...services.proxy import ProxyService
from ...utils.retry import AsyncRetry
from ...utils.logging import get_logger

# Constants for proxy configuration
PROXY_RETRY_ATTEMPTS = 3
PROXY_RETRY_DELAY = 1.0
PROXY_MAX_DELAY = 5.0
PROXY_CACHE_TTL = 300  # 5 minutes
PROXY_HEALTH_CHECK_INTERVAL = 60  # 1 minute
CIRCUIT_BREAKER_THRESHOLD = 5
CIRCUIT_BREAKER_TIMEOUT = 30

class ProxyMiddleware:
    """
    Enterprise-grade middleware for handling proxy routing, rotation, and failure
    recovery in scraping operations.
    """

    def __init__(self, proxy_service: ProxyService, config: Optional[Dict] = None):
        """
        Initialize proxy middleware with enterprise service configuration.

        Args:
            proxy_service: ProxyService instance for proxy management
            config: Optional configuration overrides
        """
        self._proxy_service = proxy_service
        self._logger = get_logger(__name__, {"component": "ProxyMiddleware"})
        self._config = config or {}
        
        # Initialize connector cache with TTL
        self._connectors = TTLCache(
            maxsize=1000,
            ttl=self._config.get('connector_ttl', PROXY_CACHE_TTL)
        )
        
        # Initialize circuit breaker for failure protection
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=self._config.get('circuit_breaker_threshold', 
                                             CIRCUIT_BREAKER_THRESHOLD),
            recovery_timeout=self._config.get('circuit_breaker_timeout',
                                            CIRCUIT_BREAKER_TIMEOUT)
        )
        
        # Health status tracking
        self._health_status: Dict[str, float] = {}
        
        # Start health check task
        asyncio.create_task(self._health_check_loop())

    async def _health_check_loop(self):
        """Background task for periodic proxy health checks."""
        while True:
            try:
                for proxy_url in list(self._connectors.keys()):
                    health_status = await self._proxy_service.get_health_status(proxy_url)
                    self._health_status[proxy_url] = health_status
                    
                    if health_status < 0.5:  # Unhealthy threshold
                        await self.handle_proxy_failure(
                            proxy_url,
                            Exception("Health check failed"),
                            {"reason": "health_check"}
                        )
                        
                await asyncio.sleep(PROXY_HEALTH_CHECK_INTERVAL)
                
            except Exception as e:
                self._logger.error(
                    "Health check error",
                    extra={"error": str(e)},
                    exc_info=True
                )

    @AsyncRetry(
        max_retries=PROXY_RETRY_ATTEMPTS,
        initial_delay=PROXY_RETRY_DELAY,
        max_delay=PROXY_MAX_DELAY
    )
    async def get_proxy_connector(
        self,
        proxy_url: str,
        ssl_context: Optional[ssl.SSLContext] = None
    ) -> aiohttp.TCPConnector:
        """
        Gets or creates a proxy connector with advanced caching and health checks.

        Args:
            proxy_url: Proxy server URL
            ssl_context: Optional SSL context for secure connections

        Returns:
            Configured aiohttp TCPConnector

        Raises:
            RuntimeError: If proxy is unhealthy or circuit breaker is open
        """
        # Check circuit breaker status
        if self._circuit_breaker.is_open():
            raise RuntimeError("Circuit breaker is open")
            
        # Validate proxy health
        if self._health_status.get(proxy_url, 1.0) < 0.5:
            raise RuntimeError("Proxy is unhealthy")
            
        # Check cache for existing connector
        if proxy_url in self._connectors:
            return self._connectors[proxy_url]
            
        try:
            # Create new connector with security settings
            if not ssl_context:
                ssl_context = ssl.create_default_context()
                ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
                
            connector = aiohttp.TCPConnector(
                ssl=ssl_context,
                enable_cleanup_closed=True,
                force_close=True,
                verify_ssl=True
            )
            
            # Validate proxy before caching
            await self._proxy_service.validate_proxy(proxy_url)
            
            # Cache the connector
            self._connectors[proxy_url] = connector
            self._health_status[proxy_url] = 1.0
            
            return connector
            
        except Exception as e:
            self._circuit_breaker.record_failure()
            raise RuntimeError(f"Failed to create proxy connector: {str(e)}")

    async def handle_proxy_failure(
        self,
        proxy_url: str,
        error: Exception,
        context: Dict[str, Any]
    ) -> str:
        """
        Handles proxy failure with comprehensive error tracking and recovery.

        Args:
            proxy_url: Failed proxy URL
            error: Exception that occurred
            context: Additional context information

        Returns:
            New validated proxy URL
        """
        try:
            # Log failure with context
            self._logger.error(
                "Proxy failure detected",
                extra={
                    "proxy_url": proxy_url,
                    "error": str(error),
                    "context": context
                },
                exc_info=True
            )
            
            # Update circuit breaker
            self._circuit_breaker.record_failure()
            
            # Report failure to proxy service
            await self._proxy_service.report_failure(proxy_url, error, context)
            
            # Remove failed connector from cache
            self._connectors.pop(proxy_url, None)
            self._health_status.pop(proxy_url, None)
            
            # Get new proxy from service
            new_proxy_url, _ = await self._proxy_service.get_proxy(context)
            
            # Validate new proxy
            await self._proxy_service.validate_proxy(new_proxy_url)
            
            return new_proxy_url
            
        except Exception as e:
            self._logger.error(
                "Failed to handle proxy failure",
                extra={"error": str(e)},
                exc_info=True
            )
            raise

    async def cleanup(self) -> None:
        """
        Performs comprehensive cleanup of proxy resources with monitoring.
        """
        try:
            # Close all active connectors
            for connector in self._connectors.values():
                await connector.close()
                
            # Clear caches
            self._connectors.clear()
            self._health_status.clear()
            
            # Reset circuit breaker
            self._circuit_breaker.reset()
            
            self._logger.info("Proxy middleware cleanup completed")
            
        except Exception as e:
            self._logger.error(
                "Cleanup error",
                extra={"error": str(e)},
                exc_info=True
            )
            raise

@AsyncRetry(
    max_retries=PROXY_RETRY_ATTEMPTS,
    initial_delay=PROXY_RETRY_DELAY,
    max_delay=PROXY_MAX_DELAY
)
async def create_proxy_connector(
    proxy_url: str,
    ssl_context: Optional[ssl.SSLContext] = None
) -> aiohttp.TCPConnector:
    """
    Creates an aiohttp connector configured with proxy settings and SSL context.

    Args:
        proxy_url: Proxy server URL
        ssl_context: Optional SSL context for secure connections

    Returns:
        Configured aiohttp TCPConnector with SSL support
    """
    try:
        # Configure SSL context if not provided
        if not ssl_context:
            ssl_context = ssl.create_default_context()
            ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
            
        # Create connector with security settings
        connector = aiohttp.TCPConnector(
            ssl=ssl_context,
            enable_cleanup_closed=True,
            force_close=True,
            verify_ssl=True,
            keepalive_timeout=30,
            limit=100  # Connection pool limit
        )
        
        return connector
        
    except Exception as e:
        logging.error(f"Failed to create proxy connector: {str(e)}")
        raise

# Export public interface
__all__ = ['ProxyMiddleware', 'create_proxy_connector']