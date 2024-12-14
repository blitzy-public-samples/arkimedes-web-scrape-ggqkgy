"""
Comprehensive unit test suite for core platform services including cache, proxy, storage,
and metrics services with extensive coverage of reliability, security, and performance scenarios.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import pytest
import asyncio
import json
import time
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock

# Third-party imports with versions
import fakeredis  # v2.18.0
import pytest_asyncio  # v0.21.0
from prometheus_client import CollectorRegistry  # v0.17.0

# Internal service imports
from ...src.services.cache import CacheService
from ...src.services.proxy import ProxyService
from ...src.services.storage import StorageService
from ...src.services.metrics import MetricsService

# Test data constants
TEST_PROXY_URL = "https://proxy.example.com:8080"
TEST_TASK_ID = "test-task-123"
TEST_DATA = {"key": "value", "nested": {"subkey": "subvalue"}}
TEST_ENCRYPTION_KEY = b"test-key-32-bytes-long-exactly!!"

@pytest.fixture
async def cache_service():
    """Fixture providing mock Redis cache service."""
    mock_redis = fakeredis.FakeRedis()
    service = CacheService(
        host="localhost",
        port=6379,
        password="test",
        use_ssl=True
    )
    service._redis_client = mock_redis
    service._connected = True
    return service

@pytest.fixture
async def proxy_service():
    """Fixture providing mock proxy service."""
    service = ProxyService(
        api_key="test-key",
        pool_size=10,
        security_config={"require_tls": True},
        performance_config={"max_retries": 3}
    )
    return service

@pytest.fixture
async def storage_service():
    """Fixture providing mock storage service."""
    service = StorageService(
        config={"encryption_key": TEST_ENCRYPTION_KEY},
        pool_size=10
    )
    return service

@pytest.fixture
async def metrics_service(cache_service):
    """Fixture providing mock metrics service."""
    service = MetricsService(cache_service=cache_service)
    return service

class TestCacheService:
    """Test suite for Redis caching service with connection pooling, encryption, and rate limiting."""

    @pytest.mark.asyncio
    async def test_cache_connection(self, cache_service):
        """Tests Redis connection establishment and pooling."""
        # Test successful connection
        assert await cache_service.connect() is True
        assert cache_service._connected is True

        # Test connection error handling
        with patch.object(cache_service._redis_client, 'ping', side_effect=Exception("Connection error")):
            with pytest.raises(Exception) as exc_info:
                await cache_service.connect()
            assert "Connection error" in str(exc_info.value)

        # Test connection pool management
        assert cache_service._pool is not None
        await cache_service.disconnect()
        assert cache_service._connected is False

    @pytest.mark.asyncio
    async def test_cache_operations(self, cache_service):
        """Tests cache operations with encryption and concurrent access."""
        test_key = "test_key"
        test_value = {"data": "test_value"}

        # Test set operation
        assert await cache_service.set(test_key, test_value) is True

        # Test get operation
        cached_value = await cache_service.get(test_key)
        assert cached_value == test_value

        # Test concurrent access
        async def concurrent_access():
            tasks = []
            for i in range(10):
                key = f"concurrent_key_{i}"
                tasks.append(cache_service.set(key, {"count": i}))
                tasks.append(cache_service.get(key))
            return await asyncio.gather(*tasks)

        results = await concurrent_access()
        assert len(results) == 20  # 10 sets + 10 gets
        assert all(r is not None for r in results)

        # Test delete operation
        assert await cache_service.delete(test_key) is True
        assert await cache_service.get(test_key) is None

    @pytest.mark.asyncio
    async def test_rate_limiting(self, cache_service):
        """Tests rate limiting with distributed counters."""
        limit_key = "rate_limit_test"
        rate_limit = 5

        # Test rate limit enforcement
        results = []
        for _ in range(rate_limit + 2):
            results.append(await cache_service.check_rate_limit(limit_key, rate_limit))

        assert sum(results) == rate_limit  # Only rate_limit requests should succeed
        assert not results[-1]  # Last request should be rate limited

        # Test rate limit reset
        await asyncio.sleep(1)  # Wait for rate limit window to expire
        assert await cache_service.check_rate_limit(limit_key, rate_limit) is True

class TestProxyService:
    """Test suite for proxy management with rotation, health checks, and circuit breaker."""

    @pytest.mark.asyncio
    async def test_proxy_rotation(self, proxy_service):
        """Tests proxy rotation with load balancing."""
        # Test proxy acquisition
        proxy_url, context = await proxy_service.get_proxy({"request_type": "scraping"})
        assert proxy_url is not None
        assert context is not None

        # Test proxy failure handling
        await proxy_service.report_failure(
            proxy_url,
            Exception("Test failure"),
            {"error_type": "connection_error"}
        )

        # Verify circuit breaker triggered
        with pytest.raises(RuntimeError):
            for _ in range(10):  # Trigger circuit breaker
                await proxy_service.report_failure(
                    proxy_url,
                    Exception("Repeated failure"),
                    {"error_type": "connection_error"}
                )

    @pytest.mark.asyncio
    async def test_proxy_health_check(self, proxy_service):
        """Tests proxy health monitoring and management."""
        # Mock health check response
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_get.return_value.__aenter__.return_value.status = 200
            assert await proxy_service._check_proxy_health(TEST_PROXY_URL)

        # Test unhealthy proxy detection
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_get.return_value.__aenter__.return_value.status = 500
            assert not await proxy_service._check_proxy_health(TEST_PROXY_URL)

class TestStorageService:
    """Test suite for storage operations with encryption and integrity checks."""

    @pytest.mark.asyncio
    async def test_task_data_storage(self, storage_service):
        """Tests task data storage with encryption."""
        test_task_data = {
            "url": "https://example.com",
            "credentials": {"username": "test", "password": "secret"},
            "schedule": "daily"
        }

        # Test encrypted storage
        task_id = await storage_service.store_task_data(test_task_data, encrypt_fields=True)
        assert task_id is not None

        # Test data retrieval with decryption
        stored_data = await storage_service.get_task_data(task_id)
        assert stored_data["url"] == test_task_data["url"]
        assert "credentials" in stored_data
        assert stored_data["schedule"] == test_task_data["schedule"]

    @pytest.mark.asyncio
    async def test_scraped_data_storage(self, storage_service):
        """Tests scraped data storage with tiering."""
        test_scraped_data = {
            "url": "https://example.com/page1",
            "content": "Test content",
            "timestamp": datetime.utcnow().isoformat()
        }

        # Test data storage
        data_id = await storage_service.store_scraped_data(
            TEST_TASK_ID,
            test_scraped_data,
            cache_enabled=True
        )
        assert data_id is not None

        # Test archival
        assert await storage_service.archive_data(data_id, "warm")
        assert await storage_service.archive_data(data_id, "cold")

class TestMetricsService:
    """Test suite for metrics collection and performance validation."""

    @pytest.mark.asyncio
    async def test_task_metrics(self, metrics_service):
        """Tests task performance metrics collection."""
        # Test metrics recording
        await metrics_service.record_task_execution(
            task_id=TEST_TASK_ID,
            duration=10.5,
            pages_processed=100,
            errors=0,
            timing_breakdown={
                "connection": 0.5,
                "processing": 9.0,
                "storage": 1.0
            }
        )

        # Verify metrics aggregation
        metrics = metrics_service.get_system_metrics()
        assert metrics["current"]["total_tasks"] == 1
        assert metrics["current"]["total_pages"] == 100
        assert metrics["current"]["total_errors"] == 0
        assert abs(metrics["current"]["avg_duration"] - 10.5) < 0.1

    @pytest.mark.asyncio
    async def test_system_metrics(self, metrics_service):
        """Tests system resource metrics collection."""
        # Allow metrics collection to run
        await asyncio.sleep(1)

        # Verify system metrics
        metrics = metrics_service.get_system_metrics()
        assert "current" in metrics
        assert "aggregates" in metrics
        assert "cpu_average" in metrics["aggregates"]
        assert "memory_used_percent" in metrics["aggregates"]
        assert "disk_used_percent" in metrics["aggregates"]

async def setup_module():
    """Module setup function for test environment configuration."""
    # Initialize test registry
    registry = CollectorRegistry()
    
    # Configure test environment
    os.environ["TESTING"] = "true"
    
    # Clear any existing test data
    await asyncio.sleep(0)

async def teardown_module():
    """Module cleanup function for test environment."""
    # Clear test data
    os.environ.pop("TESTING", None)
    
    # Reset metrics
    CollectorRegistry.clear()
    
    # Allow cleanup to complete
    await asyncio.sleep(0)