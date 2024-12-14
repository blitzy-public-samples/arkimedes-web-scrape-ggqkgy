"""
Enterprise-grade proxy management service implementing secure proxy rotation,
health monitoring, and automatic failover capabilities.
"""

# Standard library imports
import asyncio
import time
from typing import Dict, Tuple, Optional, Any
from dataclasses import dataclass
from urllib.parse import urlparse
import ssl

# External imports
import aiohttp  # v3.8.0
import bright_data  # v2.0.0
from prometheus_client import Counter, Gauge, Histogram  # v0.17.0
from circuit_breaker import CircuitBreaker  # v1.0.0

# Internal imports
from ..utils.retry import AsyncRetry
from ..utils.logging import get_logger

# Constants for proxy configuration
PROXY_POOL_SIZE = 100
PROXY_HEALTH_CHECK_INTERVAL = 300  # 5 minutes
PROXY_SUCCESS_THRESHOLD = 0.95
PROXY_ROTATION_INTERVAL = 600  # 10 minutes
PROXY_CIRCUIT_BREAKER_THRESHOLD = 0.85
PROXY_METRICS_RETENTION = 86400  # 24 hours

# Metrics collectors
proxy_requests = Counter(
    'proxy_requests_total',
    'Total number of proxy requests',
    ['proxy_id', 'status']
)
proxy_latency = Histogram(
    'proxy_request_latency_seconds',
    'Proxy request latency in seconds',
    ['proxy_id']
)
proxy_health = Gauge(
    'proxy_health_score',
    'Proxy health score',
    ['proxy_id']
)

@dataclass
class ProxyMetrics:
    """Tracks performance metrics for individual proxies."""
    success_count: int = 0
    failure_count: int = 0
    total_latency: float = 0.0
    last_used: float = 0.0
    last_success: float = 0.0
    health_score: float = 1.0

class ProxyContext:
    """Context manager for proxy usage tracking."""
    def __init__(self, proxy_url: str, service: 'ProxyService'):
        self.proxy_url = proxy_url
        self.service = service
        self.start_time = 0.0
        
    async def __aenter__(self):
        self.start_time = time.time()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        if exc_type is None:
            await self.service._record_success(self.proxy_url, duration)
        else:
            await self.service._record_failure(self.proxy_url, exc_val)

@AsyncRetry(max_retries=3, initial_delay=1.0, max_delay=5.0)
async def validate_proxy_url(proxy_url: str, security_config: Dict) -> Tuple[bool, str]:
    """
    Validates proxy URL format, configuration, and security requirements.
    
    Args:
        proxy_url: Proxy URL to validate
        security_config: Security configuration parameters
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        # Parse and validate URL format
        parsed = urlparse(proxy_url)
        if not all([parsed.scheme, parsed.hostname, parsed.port]):
            return False, "Invalid proxy URL format"
            
        # Validate security requirements
        if security_config.get('require_tls') and parsed.scheme != 'https':
            return False, "TLS is required"
            
        if not parsed.username or not parsed.password:
            return False, "Authentication credentials required"
            
        # Verify against whitelist if configured
        whitelist = security_config.get('proxy_whitelist', [])
        if whitelist and parsed.hostname not in whitelist:
            return False, "Proxy not in whitelist"
            
        return True, ""
        
    except Exception as e:
        return False, f"Validation error: {str(e)}"

class ProxyService:
    """
    Enterprise-grade proxy management service with comprehensive monitoring,
    security, and reliability features.
    """
    
    def __init__(
        self,
        api_key: str,
        pool_size: int = PROXY_POOL_SIZE,
        security_config: Dict = None,
        performance_config: Dict = None
    ):
        """
        Initialize the proxy service with enterprise configuration.
        
        Args:
            api_key: Bright Data API key
            pool_size: Size of the proxy pool
            security_config: Security configuration
            performance_config: Performance tuning parameters
        """
        self._logger = get_logger(__name__)
        self._pool_size = pool_size
        self._security_config = security_config or {}
        self._performance_config = performance_config or {}
        
        # Initialize proxy client
        self._proxy_client = bright_data.Client(
            api_key=api_key,
            ssl_context=self._create_ssl_context()
        )
        
        # Initialize tracking components
        self._proxy_metrics: Dict[str, ProxyMetrics] = {}
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        self._pool_lock = asyncio.Lock()
        
        # Start background tasks
        self._start_background_tasks()
        
    def _create_ssl_context(self) -> ssl.SSLContext:
        """Create secure SSL context for proxy connections."""
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.verify_mode = ssl.CERT_REQUIRED
        return context
        
    def _start_background_tasks(self):
        """Start background monitoring and maintenance tasks."""
        asyncio.create_task(self._health_check_loop())
        asyncio.create_task(self._rotation_loop())
        
    async def _health_check_loop(self):
        """Periodic health check for all proxies."""
        while True:
            try:
                async with self._pool_lock:
                    for proxy_url in list(self._proxy_metrics.keys()):
                        await self._check_proxy_health(proxy_url)
                await asyncio.sleep(PROXY_HEALTH_CHECK_INTERVAL)
            except Exception as e:
                self._logger.error(f"Health check error: {str(e)}")
                
    async def _rotation_loop(self):
        """Periodic proxy rotation for load distribution."""
        while True:
            try:
                async with self._pool_lock:
                    await self._rotate_proxies()
                await asyncio.sleep(PROXY_ROTATION_INTERVAL)
            except Exception as e:
                self._logger.error(f"Rotation error: {str(e)}")
                
    async def _check_proxy_health(self, proxy_url: str):
        """Check health of a specific proxy."""
        try:
            async with aiohttp.ClientSession() as session:
                start_time = time.time()
                async with session.get(
                    'https://api.brightdata.com/health',
                    proxy=proxy_url,
                    timeout=10
                ) as response:
                    if response.status == 200:
                        duration = time.time() - start_time
                        await self._record_success(proxy_url, duration)
                    else:
                        await self._record_failure(proxy_url, Exception("Health check failed"))
        except Exception as e:
            await self._record_failure(proxy_url, e)
            
    async def _rotate_proxies(self):
        """Rotate proxies based on performance metrics."""
        try:
            # Remove underperforming proxies
            for proxy_url, metrics in list(self._proxy_metrics.items()):
                if metrics.health_score < PROXY_SUCCESS_THRESHOLD:
                    await self._remove_proxy(proxy_url)
                    
            # Add new proxies to maintain pool size
            current_size = len(self._proxy_metrics)
            if current_size < self._pool_size:
                needed = self._pool_size - current_size
                new_proxies = await self._proxy_client.get_proxies(count=needed)
                for proxy in new_proxies:
                    await self._add_proxy(proxy.url)
                    
        except Exception as e:
            self._logger.error(f"Proxy rotation error: {str(e)}")
            
    async def _add_proxy(self, proxy_url: str):
        """Add a new proxy to the pool."""
        is_valid, error = await validate_proxy_url(proxy_url, self._security_config)
        if not is_valid:
            self._logger.warning(f"Invalid proxy rejected: {error}")
            return
            
        self._proxy_metrics[proxy_url] = ProxyMetrics()
        self._circuit_breakers[proxy_url] = CircuitBreaker(
            failure_threshold=PROXY_CIRCUIT_BREAKER_THRESHOLD,
            recovery_timeout=300
        )
        
    async def _remove_proxy(self, proxy_url: str):
        """Remove a proxy from the pool."""
        self._proxy_metrics.pop(proxy_url, None)
        self._circuit_breakers.pop(proxy_url, None)
        proxy_health.remove(proxy_url)
        
    async def _record_success(self, proxy_url: str, duration: float):
        """Record successful proxy operation."""
        metrics = self._proxy_metrics.get(proxy_url)
        if metrics:
            metrics.success_count += 1
            metrics.total_latency += duration
            metrics.last_success = time.time()
            metrics.health_score = (
                metrics.success_count /
                (metrics.success_count + metrics.failure_count)
            )
            
            proxy_requests.labels(proxy_url, 'success').inc()
            proxy_latency.labels(proxy_url).observe(duration)
            proxy_health.labels(proxy_url).set(metrics.health_score)
            
    async def _record_failure(self, proxy_url: str, error: Exception):
        """Record proxy failure."""
        metrics = self._proxy_metrics.get(proxy_url)
        if metrics:
            metrics.failure_count += 1
            metrics.health_score = (
                metrics.success_count /
                (metrics.success_count + metrics.failure_count)
            )
            
            proxy_requests.labels(proxy_url, 'failure').inc()
            proxy_health.labels(proxy_url).set(metrics.health_score)
            
            self._logger.error(
                f"Proxy failure: {str(error)}",
                extra={"proxy_url": proxy_url}
            )
            
    @AsyncRetry(max_retries=3, initial_delay=1.0, max_delay=5.0)
    async def get_proxy(self, request_context: Dict) -> Tuple[str, ProxyContext]:
        """
        Get a healthy proxy using intelligent selection and load balancing.
        
        Args:
            request_context: Context information for proxy selection
            
        Returns:
            Tuple of (proxy_url, proxy_context)
            
        Raises:
            RuntimeError: If no healthy proxy is available
        """
        async with self._pool_lock:
            # Filter healthy proxies
            healthy_proxies = [
                proxy_url for proxy_url, cb in self._circuit_breakers.items()
                if not cb.is_open() and
                self._proxy_metrics[proxy_url].health_score >= PROXY_SUCCESS_THRESHOLD
            ]
            
            if not healthy_proxies:
                raise RuntimeError("No healthy proxies available")
                
            # Select best proxy based on health score and latency
            selected_proxy = max(
                healthy_proxies,
                key=lambda p: self._proxy_metrics[p].health_score
            )
            
            # Update usage metrics
            self._proxy_metrics[selected_proxy].last_used = time.time()
            
            return selected_proxy, ProxyContext(selected_proxy, self)
            
    async def report_failure(
        self,
        proxy_url: str,
        error: Exception,
        context: Dict
    ) -> None:
        """
        Report and handle proxy failures with circuit breaker integration.
        
        Args:
            proxy_url: Failed proxy URL
            error: Exception that occurred
            context: Failure context information
        """
        async with self._pool_lock:
            await self._record_failure(proxy_url, error)
            
            circuit_breaker = self._circuit_breakers.get(proxy_url)
            if circuit_breaker:
                circuit_breaker.record_failure()
                
                if circuit_breaker.is_open():
                    self._logger.warning(
                        f"Circuit breaker opened for proxy",
                        extra={"proxy_url": proxy_url}
                    )
                    await self._remove_proxy(proxy_url)
                    
            # Request replacement if needed
            if len(self._proxy_metrics) < self._pool_size:
                try:
                    new_proxy = await self._proxy_client.get_proxy()
                    await self._add_proxy(new_proxy.url)
                except Exception as e:
                    self._logger.error(f"Failed to get replacement proxy: {str(e)}")