"""
Initialization module for integration tests providing comprehensive test utilities,
fixtures, and configuration for enterprise-grade testing of the web scraping platform.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import pytest
from typing import Dict, Any, List, Optional
from datetime import datetime

# Third-party imports with versions
from pytest import fixture, hookimpl  # v7.4.0

# Internal imports
from ...utils.logging import get_logger
from ...services.metrics import MetricsCollector

# Initialize logger
logger = get_logger(__name__, {"component": "IntegrationTests"})

# Test configuration constants
INTEGRATION_MARKER = pytest.mark.integration
SLOW_TEST_MARKER = pytest.mark.slow
TEST_CATEGORIES = {
    "api": {
        "timeout": 60,
        "resources": ["database", "redis", "browser"]
    },
    "scraping": {
        "timeout": 120,
        "resources": ["browser", "proxy"]
    },
    "storage": {
        "timeout": 30,
        "resources": ["database", "s3"]
    }
}
DEFAULT_TIMEOUT = 60
MAX_CONCURRENT_TESTS = 10

class TestResourceManager:
    """
    Manages test resources and ensures proper cleanup after test execution.
    Implements comprehensive resource tracking and cleanup procedures.
    """

    def __init__(self) -> None:
        """Initialize the resource manager with tracking capabilities."""
        self._active_resources: Dict[str, Any] = {}
        self._cleanup_queue: List[str] = []
        self._metrics_collector = MetricsCollector()
        self._logger = logger.bind(component="TestResourceManager")

    async def track_resource(self, resource_id: str, resource: Any) -> None:
        """
        Track a test resource for proper cleanup.

        Args:
            resource_id: Unique resource identifier
            resource: Resource instance to track
        """
        try:
            self._active_resources[resource_id] = {
                "resource": resource,
                "created_at": datetime.utcnow(),
                "status": "active"
            }
            self._cleanup_queue.append(resource_id)

            # Record metrics
            await self._metrics_collector.record_resource_usage(
                resource_id=resource_id,
                resource_type=type(resource).__name__
            )

            self._logger.info(
                "Resource tracked",
                extra={
                    "resource_id": resource_id,
                    "resource_type": type(resource).__name__
                }
            )

        except Exception as e:
            self._logger.error(
                "Failed to track resource",
                extra={
                    "resource_id": resource_id,
                    "error": str(e)
                }
            )
            raise

    async def cleanup(self) -> None:
        """Clean up all tracked resources with error handling."""
        cleanup_errors = []

        for resource_id in reversed(self._cleanup_queue):
            try:
                resource_data = self._active_resources.get(resource_id)
                if not resource_data:
                    continue

                resource = resource_data["resource"]
                
                # Handle different resource types
                if hasattr(resource, "cleanup"):
                    await resource.cleanup()
                elif hasattr(resource, "close"):
                    await resource.close()
                elif hasattr(resource, "__aexit__"):
                    await resource.__aexit__(None, None, None)

                self._active_resources.pop(resource_id, None)
                self._logger.info(
                    "Resource cleaned up",
                    extra={"resource_id": resource_id}
                )

            except Exception as e:
                cleanup_errors.append(f"Failed to cleanup {resource_id}: {str(e)}")
                self._logger.error(
                    "Resource cleanup failed",
                    extra={
                        "resource_id": resource_id,
                        "error": str(e)
                    }
                )

        if cleanup_errors:
            raise RuntimeError(f"Resource cleanup errors: {', '.join(cleanup_errors)}")

@hookimpl(tryfirst=True)
def pytest_configure(config: Any) -> None:
    """
    Configure pytest with integration test markers and resource tracking.

    Args:
        config: pytest configuration object
    """
    # Register integration test marker
    config.addinivalue_line(
        "markers",
        "integration: mark test as integration test with optional parameters"
    )

    # Register slow test marker
    config.addinivalue_line(
        "markers",
        "slow: mark test as slow with configurable threshold"
    )

    # Configure test categories
    for category, settings in TEST_CATEGORIES.items():
        config.addinivalue_line(
            "markers",
            f"{category}: mark test as {category} test with timeout={settings['timeout']}"
        )

    # Initialize resource manager
    config.resource_manager = TestResourceManager()

@hookimpl
def pytest_runtest_setup(item: Any) -> None:
    """
    Setup test environment with necessary resources and monitoring.

    Args:
        item: pytest test item
    """
    # Configure test timeout
    timeout = DEFAULT_TIMEOUT
    for marker in item.iter_markers(name="integration"):
        timeout = marker.kwargs.get("timeout", DEFAULT_TIMEOUT)

    # Setup resource tracking
    if hasattr(item.config, "resource_manager"):
        item.resource_manager = item.config.resource_manager

    # Configure test monitoring
    logger.info(
        "Test setup",
        extra={
            "test_name": item.name,
            "test_path": str(item.path),
            "timeout": timeout
        }
    )

@hookimpl
def pytest_runtest_teardown(item: Any) -> None:
    """
    Cleanup test resources and verify test environment.

    Args:
        item: pytest test item
    """
    try:
        if hasattr(item, "resource_manager"):
            asyncio.run(item.resource_manager.cleanup())

    except Exception as e:
        logger.error(
            "Test teardown failed",
            extra={
                "test_name": item.name,
                "error": str(e)
            }
        )
        raise

# Export public interface
__all__ = [
    "INTEGRATION_MARKER",
    "SLOW_TEST_MARKER",
    "TEST_CATEGORIES",
    "TestResourceManager"
]