"""
Enterprise-grade service layer for managing web scraping tasks.
Provides high-level business logic for task lifecycle management, scheduling,
execution, monitoring, and compliance.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any

# Third-party imports
from sqlalchemy import select  # v2.0.0
from sqlalchemy.ext.asyncio import AsyncSession  # v2.0.0
from opentelemetry import trace  # v1.20.0
from circuitbreaker import circuit  # v1.4.0

# Internal imports
from ..db.models.task import Task, TASK_STATUSES
from ..api.schemas.tasks import TaskCreate, TaskUpdate, TaskFilter, TaskResponse
from ..scraper.scheduler import TaskScheduler
from ..utils.logging import get_logger
from ..utils.retry import AsyncRetry

# Initialize logger and tracer
logger = get_logger(__name__, {"component": "TaskService"})
tracer = trace.get_tracer(__name__)

# Constants
DEFAULT_PAGE_SIZE = 50
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
MAX_RETRY_ATTEMPTS = 3
METRICS_COLLECTION_INTERVAL = 60

class TaskService:
    """
    Enterprise service class for managing web scraping tasks lifecycle with 
    comprehensive monitoring, security, and reliability features.
    """

    def __init__(self, db_session: AsyncSession, scheduler: TaskScheduler) -> None:
        """
        Initialize task service with enhanced monitoring and security features.

        Args:
            db_session: Database session for persistence
            scheduler: Task scheduler instance
        """
        self._db = db_session
        self._scheduler = scheduler
        self._logger = logger
        self._active_tasks: Dict[str, Any] = {}

    @AsyncRetry(max_retries=MAX_RETRY_ATTEMPTS)
    @circuit(failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD)
    @trace.start_as_current_span("create_task")
    async def create_task(self, task_data: TaskCreate, user_id: uuid.UUID) -> Task:
        """
        Create and schedule a new scraping task with comprehensive validation.

        Args:
            task_data: Task creation data
            user_id: ID of user creating the task

        Returns:
            Created task instance

        Raises:
            ValueError: If task data is invalid
            RuntimeError: If task creation fails
        """
        try:
            # Create task record
            task = Task(
                name=task_data.name,
                configuration=task_data.configuration.dict(),
                user_id=user_id,
                schedule=task_data.schedule
            )

            # Persist to database
            self._db.add(task)
            await self._db.flush()
            await self._db.refresh(task)

            # Schedule task execution
            success = await self._scheduler.schedule_task(
                str(task.id),
                task.configuration,
                task_data.priority
            )

            if not success:
                raise RuntimeError("Failed to schedule task")

            await self._db.commit()

            self._logger.info(
                "Task created successfully",
                extra={
                    "task_id": str(task.id),
                    "user_id": str(user_id),
                    "configuration": task.configuration
                }
            )

            return task

        except Exception as e:
            await self._db.rollback()
            self._logger.error(
                "Failed to create task",
                extra={
                    "error": str(e),
                    "task_data": task_data.dict(),
                    "user_id": str(user_id)
                },
                exc_info=True
            )
            raise

    @AsyncRetry(max_retries=MAX_RETRY_ATTEMPTS)
    @circuit(failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD)
    @trace.start_as_current_span("update_task")
    async def update_task(
        self, 
        task_id: uuid.UUID, 
        task_data: TaskUpdate,
        user_id: uuid.UUID
    ) -> Task:
        """
        Update existing task with validation and state management.

        Args:
            task_id: Task identifier
            task_data: Updated task data
            user_id: ID of user updating the task

        Returns:
            Updated task instance

        Raises:
            ValueError: If task data is invalid
            RuntimeError: If task update fails
        """
        try:
            # Fetch existing task
            task = await self._db.get(Task, task_id)
            if not task:
                raise ValueError(f"Task {task_id} not found")

            # Validate user permission
            if task.user_id != user_id:
                raise ValueError("Unauthorized task update attempt")

            # Update task fields
            if task_data.name is not None:
                task.name = task_data.name
            if task_data.configuration is not None:
                task.update_configuration(task_data.configuration.dict())
            if task_data.status is not None:
                task.update_status(task_data.status)
            if task_data.schedule is not None:
                task.update_schedule(task_data.schedule)

            # Update scheduler if needed
            if task_data.configuration or task_data.schedule:
                await self._scheduler.update_task(
                    str(task_id),
                    task.configuration,
                    task_data.priority
                )

            await self._db.commit()
            await self._db.refresh(task)

            self._logger.info(
                "Task updated successfully",
                extra={
                    "task_id": str(task_id),
                    "user_id": str(user_id),
                    "updates": task_data.dict(exclude_unset=True)
                }
            )

            return task

        except Exception as e:
            await self._db.rollback()
            self._logger.error(
                "Failed to update task",
                extra={
                    "error": str(e),
                    "task_id": str(task_id),
                    "user_id": str(user_id)
                },
                exc_info=True
            )
            raise

    @AsyncRetry(max_retries=MAX_RETRY_ATTEMPTS)
    @circuit(failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD)
    @trace.start_as_current_span("delete_task")
    async def delete_task(self, task_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """
        Delete task with cleanup and validation.

        Args:
            task_id: Task identifier
            user_id: ID of user deleting the task

        Returns:
            bool indicating success

        Raises:
            ValueError: If task not found or unauthorized
            RuntimeError: If deletion fails
        """
        try:
            # Fetch task
            task = await self._db.get(Task, task_id)
            if not task:
                raise ValueError(f"Task {task_id} not found")

            # Validate user permission
            if task.user_id != user_id:
                raise ValueError("Unauthorized task deletion attempt")

            # Cancel scheduled task
            await self._scheduler.cancel_task(str(task_id))

            # Delete from database
            await self._db.delete(task)
            await self._db.commit()

            self._logger.info(
                "Task deleted successfully",
                extra={
                    "task_id": str(task_id),
                    "user_id": str(user_id)
                }
            )

            return True

        except Exception as e:
            await self._db.rollback()
            self._logger.error(
                "Failed to delete task",
                extra={
                    "error": str(e),
                    "task_id": str(task_id),
                    "user_id": str(user_id)
                },
                exc_info=True
            )
            raise

    @AsyncRetry(max_retries=MAX_RETRY_ATTEMPTS)
    @trace.start_as_current_span("list_tasks")
    async def list_tasks(
        self,
        user_id: uuid.UUID,
        filters: Optional[TaskFilter] = None
    ) -> TaskResponse:
        """
        List tasks with filtering and pagination.

        Args:
            user_id: User identifier for filtering
            filters: Optional task filters

        Returns:
            TaskResponse containing filtered tasks and metadata
        """
        try:
            # Build base query
            query = select(Task).where(Task.user_id == user_id)

            # Apply filters
            if filters:
                if filters.status:
                    query = query.where(Task.status == filters.status)
                if filters.priority:
                    query = query.where(Task.priority == filters.priority)
                if filters.is_active is not None:
                    query = query.where(Task.is_active == filters.is_active)
                if filters.start_date:
                    query = query.where(Task.created_at >= filters.start_date)
                if filters.end_date:
                    query = query.where(Task.created_at <= filters.end_date)

                # Apply sorting
                if filters.sort_by:
                    sort_column = getattr(Task, filters.sort_by)
                    query = query.order_by(
                        sort_column.desc() if filters.sort_order == 'desc'
                        else sort_column.asc()
                    )

            # Execute count query
            total = await self._db.scalar(
                select(func.count()).select_from(query.subquery())
            )

            # Apply pagination
            page = filters.page if filters else 1
            size = filters.size if filters else DEFAULT_PAGE_SIZE
            query = query.offset((page - 1) * size).limit(size)

            # Execute main query
            result = await self._db.execute(query)
            tasks = result.scalars().all()

            return TaskResponse(
                data=tasks,
                total=total,
                page=page,
                size=size,
                metadata={
                    "timestamp": datetime.utcnow().isoformat(),
                    "filters_applied": filters.dict() if filters else None
                }
            )

        except Exception as e:
            self._logger.error(
                "Failed to list tasks",
                extra={
                    "error": str(e),
                    "user_id": str(user_id),
                    "filters": filters.dict() if filters else None
                },
                exc_info=True
            )
            raise

    async def cleanup(self) -> None:
        """
        Perform graceful service shutdown and resource cleanup.
        """
        try:
            self._logger.info("Starting task service cleanup")
            
            # Cancel all active tasks
            cleanup_tasks = []
            for task_id in list(self._active_tasks.keys()):
                cleanup_tasks.append(self._scheduler.cancel_task(task_id))
            
            if cleanup_tasks:
                await asyncio.gather(*cleanup_tasks, return_exceptions=True)
            
            # Clear internal state
            self._active_tasks.clear()
            
            self._logger.info("Task service cleanup completed")
            
        except Exception as e:
            self._logger.error(
                "Error during task service cleanup",
                extra={"error": str(e)},
                exc_info=True
            )
            raise

# Export public interface
__all__ = ['TaskService']