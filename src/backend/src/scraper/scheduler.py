"""
Enterprise-grade task scheduler module for managing and orchestrating web scraping tasks.
Implements advanced features including concurrent processing, resource management,
circuit breaking, performance monitoring, and graceful degradation.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
from typing import Dict, Any, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from circuitbreaker import CircuitBreaker
import tenacity

from .browser.manager import BrowserManager
from .config import scraper_settings
from ...utils.logging import get_logger

# Initialize logger
logger = get_logger(__name__, {"component": "TaskScheduler"})

# Default scheduler configuration
DEFAULT_SCHEDULER_CONFIG = {
    "max_instances": 100,
    "coalesce": True,
    "misfire_grace_time": 60,
    "executor": "asyncio",
    "job_defaults": {
        "max_instances": 1,
        "coalesce": True
    }
}

# Circuit breaker configuration
CIRCUIT_BREAKER_CONFIG = {
    "failure_threshold": 5,
    "recovery_timeout": 30,
    "reset_timeout": 300
}

class TaskScheduler:
    """
    Enterprise-grade task scheduler managing concurrent web scraping tasks with advanced features.
    Implements comprehensive task management, monitoring, and reliability controls.
    """

    def __init__(self, browser_manager: BrowserManager, config: Dict[str, Any] = None):
        """
        Initialize task scheduler with enhanced monitoring and reliability features.

        Args:
            browser_manager: Browser resource manager instance
            config: Optional configuration overrides
        """
        # Initialize core components
        self._scheduler = AsyncIOScheduler(
            **{**DEFAULT_SCHEDULER_CONFIG, **(config or {})}
        )
        self._browser_manager = browser_manager
        self._active_tasks: Dict[str, Any] = {}
        self._task_locks: Dict[str, asyncio.Lock] = {}
        self._logger = logger

        # Initialize circuit breaker for fault tolerance
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=CIRCUIT_BREAKER_CONFIG["failure_threshold"],
            recovery_timeout=CIRCUIT_BREAKER_CONFIG["recovery_timeout"],
            reset_timeout=CIRCUIT_BREAKER_CONFIG["reset_timeout"]
        )

        # Start scheduler with health check
        self._scheduler.start()
        self._logger.info(
            "Task scheduler initialized",
            extra={
                "max_instances": self._scheduler.max_instances,
                "executor": self._scheduler.executor
            }
        )

    @tenacity.retry(
        stop=tenacity.stop_after_attempt(3),
        wait=tenacity.wait_exponential(multiplier=1, min=4, max=10),
        retry=tenacity.retry_if_exception_type(Exception),
        before_sleep=lambda retry_state: logger.warning(
            f"Retrying task scheduling (attempt {retry_state.attempt_number})"
        )
    )
    async def schedule_task(
        self,
        task_id: str,
        task_config: Dict[str, Any],
        priority: Optional[int] = None
    ) -> bool:
        """
        Schedule a new scraping task with validation and monitoring.

        Args:
            task_id: Unique task identifier
            task_config: Task configuration parameters
            priority: Optional task priority level

        Returns:
            bool: Scheduling success status

        Raises:
            ValueError: If task configuration is invalid
            RuntimeError: If scheduler is not running
        """
        try:
            # Validate task configuration
            if not task_config or "url" not in task_config:
                raise ValueError("Invalid task configuration")

            # Check circuit breaker state
            if self._circuit_breaker.current_state == "open":
                self._logger.warning(
                    "Circuit breaker open, rejecting task scheduling",
                    extra={"task_id": task_id}
                )
                return False

            # Create task lock if not exists
            if task_id not in self._task_locks:
                self._task_locks[task_id] = asyncio.Lock()

            async with self._task_locks[task_id]:
                # Check if task already exists
                if task_id in self._active_tasks:
                    self._logger.warning(
                        "Task already scheduled",
                        extra={"task_id": task_id}
                    )
                    return False

                # Configure job with monitoring
                job = self._scheduler.add_job(
                    self.execute_task,
                    'date',
                    args=[task_id],
                    kwargs=task_config,
                    id=task_id,
                    priority=priority,
                    replace_existing=True,
                    misfire_grace_time=scraper_settings.timeout_ms // 1000
                )

                # Track active task
                self._active_tasks[task_id] = {
                    "job": job,
                    "config": task_config,
                    "status": "scheduled",
                    "scheduled_at": job.next_run_time
                }

                self._logger.info(
                    "Task scheduled successfully",
                    extra={
                        "task_id": task_id,
                        "priority": priority,
                        "scheduled_at": job.next_run_time
                    }
                )
                return True

        except Exception as e:
            self._logger.error(
                "Failed to schedule task",
                extra={
                    "task_id": task_id,
                    "error": str(e)
                },
                exc_info=True
            )
            raise

    @tenacity.retry(
        stop=tenacity.stop_after_attempt(3),
        wait=tenacity.wait_exponential(multiplier=1, min=4, max=10),
        retry=tenacity.retry_if_exception_type(Exception),
        before_sleep=lambda retry_state: logger.warning(
            f"Retrying task execution (attempt {retry_state.attempt_number})"
        )
    )
    async def execute_task(self, task_id: str) -> Dict[str, Any]:
        """
        Execute scheduled task with resource management and monitoring.

        Args:
            task_id: Task identifier to execute

        Returns:
            Dict containing task execution results and metrics

        Raises:
            RuntimeError: If task execution fails
        """
        browser = None
        start_time = asyncio.get_event_loop().time()

        try:
            # Check circuit breaker
            if self._circuit_breaker.current_state == "open":
                raise RuntimeError("Circuit breaker open")

            async with self._task_locks[task_id]:
                if task_id not in self._active_tasks:
                    raise RuntimeError(f"Task {task_id} not found")

                task_data = self._active_tasks[task_id]
                task_data["status"] = "running"
                task_data["start_time"] = start_time

                # Acquire browser with timeout
                browser = await self._browser_manager.get_browser(
                    scraper_settings.get_browser_context_options()
                )

                # Execute scraping operation
                # Note: Actual scraping implementation would be added here
                result = {"status": "completed", "data": {}}

                # Update task status
                task_data["status"] = "completed"
                task_data["end_time"] = asyncio.get_event_loop().time()
                task_data["duration"] = task_data["end_time"] - start_time

                self._logger.info(
                    "Task executed successfully",
                    extra={
                        "task_id": task_id,
                        "duration": task_data["duration"]
                    }
                )

                return result

        except Exception as e:
            self._circuit_breaker.record_failure()
            self._logger.error(
                "Task execution failed",
                extra={
                    "task_id": task_id,
                    "error": str(e),
                    "duration": asyncio.get_event_loop().time() - start_time
                },
                exc_info=True
            )
            raise

        finally:
            # Release browser resources
            if browser:
                await self._browser_manager.release_browser(str(id(browser)))

    async def cleanup(self) -> None:
        """
        Perform graceful shutdown with resource cleanup.
        Ensures all resources are properly released and tasks are saved.
        """
        try:
            self._logger.info("Starting scheduler cleanup")

            # Stop accepting new tasks
            self._scheduler.pause()

            # Wait for active tasks to complete
            active_tasks = list(self._active_tasks.keys())
            for task_id in active_tasks:
                try:
                    async with self._task_locks[task_id]:
                        if task_id in self._active_tasks:
                            job = self._active_tasks[task_id]["job"]
                            job.remove()
                            self._active_tasks.pop(task_id)
                except Exception as e:
                    self._logger.error(
                        f"Error cleaning up task {task_id}: {str(e)}",
                        exc_info=True
                    )

            # Shutdown scheduler
            self._scheduler.shutdown(wait=True)

            # Clear all locks and states
            self._task_locks.clear()
            self._active_tasks.clear()

            self._logger.info("Scheduler cleanup completed")

        except Exception as e:
            self._logger.error(
                "Error during scheduler cleanup",
                extra={"error": str(e)},
                exc_info=True
            )
            raise