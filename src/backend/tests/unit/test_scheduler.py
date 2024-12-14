"""
Comprehensive unit test suite for TaskScheduler class validating concurrent processing,
resource management, and performance monitoring capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timedelta

# Internal imports
from ...src.scraper.scheduler import TaskScheduler, DEFAULT_SCHEDULER_CONFIG
from ...src.scraper.browser.manager import BrowserManager

# Test configuration constants
TEST_CONFIG = {
    "max_instances": 100,
    "coalesce": True,
    "misfire_grace_time": 30,
    "performance_metrics": True,
    "resource_tracking": True,
    "failover_enabled": True
}

TEST_TASK_CONFIG = {
    "url": "https://example.com",
    "schedule": "*/5 * * * *",
    "extractors": ["title", "price", "availability"],
    "proxy_enabled": True,
    "retry_config": {
        "max_attempts": 3,
        "backoff_factor": 2
    },
    "timeout": 30
}

@pytest.mark.asyncio
class TestTaskScheduler:
    """
    Comprehensive test suite for TaskScheduler functionality including performance
    and resource management validation.
    """

    async def setup_method(self, method):
        """Initialize test environment before each test case."""
        # Create mock browser manager
        self.browser_manager = AsyncMock(spec=BrowserManager)
        self.browser_manager.get_browser = AsyncMock(return_value=Mock())
        self.browser_manager.release_browser = AsyncMock(return_value=True)
        self.browser_manager.get_pool_metrics = AsyncMock(return_value={
            "active_browsers": 0,
            "pool_size": TEST_CONFIG["max_instances"]
        })

        # Initialize scheduler with test configuration
        self.scheduler = TaskScheduler(
            browser_manager=self.browser_manager,
            config=TEST_CONFIG
        )

        # Track active tasks for cleanup
        self._active_tasks = []

    async def teardown_method(self, method):
        """Clean up resources after each test."""
        try:
            # Cancel all active tasks
            for task_id in self._active_tasks:
                await self.scheduler.cancel_task(task_id)

            # Cleanup scheduler resources
            await self.scheduler.cleanup()

            # Verify browser manager cleanup
            self.browser_manager.cleanup.assert_called_once()

        except Exception as e:
            pytest.fail(f"Teardown failed: {str(e)}")

    @pytest.mark.asyncio
    async def test_scheduler_initialization(self):
        """Verify TaskScheduler initialization with configuration validation."""
        assert self.scheduler._scheduler is not None
        assert self.scheduler._browser_manager == self.browser_manager
        assert self.scheduler._active_tasks == {}
        assert self.scheduler._circuit_breaker is not None
        assert self.scheduler._scheduler.running

        # Verify configuration
        scheduler_config = self.scheduler._scheduler._scheduler.conf
        assert scheduler_config.max_instances == TEST_CONFIG["max_instances"]
        assert scheduler_config.coalesce == TEST_CONFIG["coalesce"]
        assert scheduler_config.misfire_grace_time == TEST_CONFIG["misfire_grace_time"]

    @pytest.mark.asyncio
    @pytest.mark.timeout(60)
    async def test_schedule_task(self):
        """Test scheduling and execution of scraping tasks with performance monitoring."""
        task_id = "test_task_1"
        
        # Schedule test task
        success = await self.scheduler.schedule_task(task_id, TEST_TASK_CONFIG)
        assert success is True
        
        # Verify task tracking
        assert task_id in self.scheduler._active_tasks
        task_data = self.scheduler._active_tasks[task_id]
        assert task_data["status"] == "scheduled"
        assert task_data["config"] == TEST_TASK_CONFIG
        assert task_data["scheduled_at"] is not None

        # Track for cleanup
        self._active_tasks.append(task_id)

        # Verify browser resource management
        self.browser_manager.get_browser.assert_not_called()  # Not called until execution

        # Wait for task execution
        await asyncio.sleep(1)
        
        # Verify execution
        self.browser_manager.get_browser.assert_called_once()
        assert task_data["status"] in ["completed", "running"]

    @pytest.mark.asyncio
    @pytest.mark.timeout(120)
    async def test_concurrent_task_limit(self):
        """Validate enforcement of maximum concurrent tasks and resource management."""
        # Schedule maximum allowed tasks
        task_ids = []
        for i in range(TEST_CONFIG["max_instances"]):
            task_id = f"concurrent_task_{i}"
            success = await self.scheduler.schedule_task(
                task_id,
                {**TEST_TASK_CONFIG, "priority": i}
            )
            assert success is True
            task_ids.append(task_id)
            self._active_tasks.append(task_id)

        # Verify task limit enforcement
        overflow_task = "overflow_task"
        success = await self.scheduler.schedule_task(overflow_task, TEST_TASK_CONFIG)
        assert success is False  # Should fail due to max_instances limit

        # Verify resource allocation
        pool_metrics = await self.browser_manager.get_pool_metrics()
        assert pool_metrics["active_browsers"] <= TEST_CONFIG["max_instances"]

        # Test task cancellation
        for task_id in task_ids[:10]:  # Cancel first 10 tasks
            success = await self.scheduler.cancel_task(task_id)
            assert success is True
            assert task_id not in self.scheduler._active_tasks

        # Verify resource cleanup
        await asyncio.sleep(1)
        self.browser_manager.release_browser.assert_called()

    @pytest.mark.asyncio
    async def test_task_lifecycle_management(self):
        """Test complete task lifecycle including pause, resume, and cancellation."""
        task_id = "lifecycle_task"
        
        # Schedule task
        success = await self.scheduler.schedule_task(task_id, TEST_TASK_CONFIG)
        assert success is True
        self._active_tasks.append(task_id)

        # Test pause
        success = await self.scheduler.pause_task(task_id)
        assert success is True
        assert self.scheduler._active_tasks[task_id]["status"] == "paused"

        # Test resume
        success = await self.scheduler.resume_task(task_id)
        assert success is True
        assert self.scheduler._active_tasks[task_id]["status"] == "scheduled"

        # Test cancellation
        success = await self.scheduler.cancel_task(task_id)
        assert success is True
        assert task_id not in self.scheduler._active_tasks

    @pytest.mark.asyncio
    async def test_performance_metrics(self):
        """Validate performance metrics collection and accuracy."""
        task_id = "metrics_task"
        
        # Schedule and execute task
        await self.scheduler.schedule_task(task_id, TEST_TASK_CONFIG)
        self._active_tasks.append(task_id)
        
        # Wait for execution
        await asyncio.sleep(1)
        
        # Get metrics
        metrics = await self.scheduler.get_metrics()
        
        # Verify metrics structure
        assert "active_tasks" in metrics
        assert "completed_tasks" in metrics
        assert "failed_tasks" in metrics
        assert "average_execution_time" in metrics
        assert "resource_utilization" in metrics

        # Verify metric values
        assert metrics["active_tasks"] >= 0
        assert metrics["completed_tasks"] >= 0
        assert isinstance(metrics["average_execution_time"], float)

    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test error handling and circuit breaker functionality."""
        task_id = "error_task"
        
        # Mock browser manager to simulate errors
        self.browser_manager.get_browser.side_effect = Exception("Simulated error")
        
        # Schedule task
        await self.scheduler.schedule_task(task_id, TEST_TASK_CONFIG)
        self._active_tasks.append(task_id)
        
        # Wait for execution attempt
        await asyncio.sleep(1)
        
        # Verify error handling
        task_data = self.scheduler._active_tasks[task_id]
        assert task_data["status"] == "failed"
        
        # Verify circuit breaker state
        assert self.scheduler._circuit_breaker.current_state == "open"

    @pytest.mark.asyncio
    async def test_resource_cleanup(self):
        """Validate resource cleanup and memory management."""
        # Schedule multiple tasks
        task_ids = [f"cleanup_task_{i}" for i in range(5)]
        for task_id in task_ids:
            await self.scheduler.schedule_task(task_id, TEST_TASK_CONFIG)
            self._active_tasks.append(task_id)

        # Trigger cleanup
        await self.scheduler.cleanup()

        # Verify cleanup
        assert len(self.scheduler._active_tasks) == 0
        assert len(self.scheduler._task_locks) == 0
        self.browser_manager.cleanup.assert_called_once()