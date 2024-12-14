"""
FastAPI route handlers for web scraping task management endpoints.
Implements secure REST API operations for task CRUD with comprehensive validation,
monitoring, and error handling.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from typing import Optional
from uuid import UUID

# Third-party imports
from fastapi import APIRouter, Depends, HTTPException, status  # v0.100.0
import structlog  # v23.1.0
from opentelemetry import trace  # v1.20.0

# Internal imports
from ...services.task import TaskService
from ..schemas.tasks import TaskCreate, TaskUpdate, TaskResponse, TaskFilter, TaskInDB
from ..core.dependencies import get_current_user, get_db, check_rate_limit

# Initialize router with prefix and tags
router = APIRouter(prefix='/api/v1/tasks', tags=['tasks'])

# Initialize logger and tracer
logger = structlog.get_logger(__name__)
tracer = trace.get_tracer(__name__)

@router.post('/', response_model=TaskInDB, status_code=status.HTTP_201_CREATED)
@tracer.start_as_current_span('create_task')
async def create_task(
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
    _: bool = Depends(check_rate_limit)
) -> TaskInDB:
    """
    Create a new web scraping task with comprehensive validation.

    Args:
        task_data: Task creation data
        current_user: Authenticated user information
        db: Database session
        _: Rate limit check result

    Returns:
        Created task details

    Raises:
        HTTPException: If task creation fails or validation errors occur
    """
    try:
        logger.info(
            "task_creation_started",
            user_id=current_user["id"],
            task_data=task_data.dict(exclude_unset=True)
        )

        task_service = TaskService(db)
        task = await task_service.create_task(task_data, UUID(current_user["id"]))

        logger.info(
            "task_created_successfully",
            task_id=str(task.id),
            user_id=current_user["id"]
        )

        return task

    except ValueError as e:
        logger.error(
            "task_creation_validation_error",
            error=str(e),
            user_id=current_user["id"]
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "task_creation_failed",
            error=str(e),
            user_id=current_user["id"],
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create task"
        )

@router.get('/{task_id}', response_model=TaskInDB)
@tracer.start_as_current_span('get_task')
async def get_task(
    task_id: UUID,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
    _: bool = Depends(check_rate_limit)
) -> TaskInDB:
    """
    Retrieve task details by ID with access control.

    Args:
        task_id: Task identifier
        current_user: Authenticated user information
        db: Database session
        _: Rate limit check result

    Returns:
        Task details if found and authorized

    Raises:
        HTTPException: If task not found or unauthorized
    """
    try:
        task_service = TaskService(db)
        task = await task_service.get_task(task_id, UUID(current_user["id"]))

        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )

        logger.info(
            "task_retrieved",
            task_id=str(task_id),
            user_id=current_user["id"]
        )

        return task

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "task_retrieval_failed",
            error=str(e),
            task_id=str(task_id),
            user_id=current_user["id"],
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve task"
        )

@router.put('/{task_id}', response_model=TaskInDB)
@tracer.start_as_current_span('update_task')
async def update_task(
    task_id: UUID,
    task_data: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
    _: bool = Depends(check_rate_limit)
) -> TaskInDB:
    """
    Update existing task with validation and access control.

    Args:
        task_id: Task identifier
        task_data: Updated task data
        current_user: Authenticated user information
        db: Database session
        _: Rate limit check result

    Returns:
        Updated task details

    Raises:
        HTTPException: If update fails or unauthorized
    """
    try:
        logger.info(
            "task_update_started",
            task_id=str(task_id),
            user_id=current_user["id"],
            updates=task_data.dict(exclude_unset=True)
        )

        task_service = TaskService(db)
        task = await task_service.update_task(
            task_id,
            task_data,
            UUID(current_user["id"])
        )

        logger.info(
            "task_updated_successfully",
            task_id=str(task_id),
            user_id=current_user["id"]
        )

        return task

    except ValueError as e:
        logger.error(
            "task_update_validation_error",
            error=str(e),
            task_id=str(task_id),
            user_id=current_user["id"]
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "task_update_failed",
            error=str(e),
            task_id=str(task_id),
            user_id=current_user["id"],
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update task"
        )

@router.delete('/{task_id}', status_code=status.HTTP_204_NO_CONTENT)
@tracer.start_as_current_span('delete_task')
async def delete_task(
    task_id: UUID,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
    _: bool = Depends(check_rate_limit)
) -> None:
    """
    Delete task with cleanup and access control.

    Args:
        task_id: Task identifier
        current_user: Authenticated user information
        db: Database session
        _: Rate limit check result

    Raises:
        HTTPException: If deletion fails or unauthorized
    """
    try:
        logger.info(
            "task_deletion_started",
            task_id=str(task_id),
            user_id=current_user["id"]
        )

        task_service = TaskService(db)
        success = await task_service.delete_task(task_id, UUID(current_user["id"]))

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )

        logger.info(
            "task_deleted_successfully",
            task_id=str(task_id),
            user_id=current_user["id"]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "task_deletion_failed",
            error=str(e),
            task_id=str(task_id),
            user_id=current_user["id"],
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task"
        )

@router.get('/', response_model=TaskResponse)
@tracer.start_as_current_span('list_tasks')
async def list_tasks(
    filters: Optional[TaskFilter] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
    _: bool = Depends(check_rate_limit)
) -> TaskResponse:
    """
    List tasks with filtering and pagination.

    Args:
        filters: Optional task filters
        current_user: Authenticated user information
        db: Database session
        _: Rate limit check result

    Returns:
        Filtered task list with pagination metadata

    Raises:
        HTTPException: If listing fails
    """
    try:
        logger.info(
            "task_listing_started",
            user_id=current_user["id"],
            filters=filters.dict() if filters else None
        )

        task_service = TaskService(db)
        response = await task_service.list_tasks(
            UUID(current_user["id"]),
            filters
        )

        logger.info(
            "tasks_listed_successfully",
            user_id=current_user["id"],
            total_tasks=response.total
        )

        return response

    except ValueError as e:
        logger.error(
            "task_listing_validation_error",
            error=str(e),
            user_id=current_user["id"]
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "task_listing_failed",
            error=str(e),
            user_id=current_user["id"],
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list tasks"
        )