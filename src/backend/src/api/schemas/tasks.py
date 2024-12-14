"""
Pydantic schema definitions for web scraping task validation, API requests and responses.
Implements comprehensive data models with enhanced versioning and metadata support.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID

# Third-party imports with versions
from pydantic import BaseModel, Field, validator  # v2.0.0

# Internal imports
from ..core.config import settings

# Global constants for task validation
TASK_STATUSES = ['pending', 'active', 'paused', 'completed', 'failed']
TASK_PRIORITIES = ['low', 'medium', 'high']
SORT_FIELDS = ['created_at', 'updated_at', 'priority', 'status']

class TaskBase(BaseModel):
    """
    Base model for task configuration with comprehensive validation rules.
    Implements core task attributes and metadata tracking.
    """
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Task name for identification"
    )
    configuration: Dict[str, Any] = Field(
        ...,
        description="Task configuration including selectors and rules"
    )
    status: str = Field(
        default='pending',
        description="Current task status"
    )
    priority: str = Field(
        default='medium',
        description="Task execution priority"
    )
    schedule: str = Field(
        ...,
        description="Task execution schedule in cron format"
    )
    is_active: bool = Field(
        default=True,
        description="Flag indicating if task is active"
    )
    retry_count: int = Field(
        default=3,
        ge=0,
        le=10,
        description="Maximum retry attempts on failure"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional task metadata"
    )

    @validator('status')
    def validate_status(cls, value: str) -> str:
        """Validate task status against allowed values."""
        if value not in TASK_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(TASK_STATUSES)}")
        return value

    @validator('priority')
    def validate_priority(cls, value: str) -> str:
        """Validate task priority against allowed values."""
        if value not in TASK_PRIORITIES:
            raise ValueError(f"Invalid priority. Must be one of: {', '.join(TASK_PRIORITIES)}")
        return value

    @validator('configuration')
    def validate_configuration(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        """Validate task configuration structure."""
        required_fields = {'url', 'selectors', 'output_format'}
        if not all(field in value for field in required_fields):
            raise ValueError(f"Configuration must contain: {', '.join(required_fields)}")
        return value

class TaskInDB(TaskBase):
    """
    Enhanced database model for tasks with versioning and execution history.
    Extends TaskBase with database-specific fields and tracking.
    """
    id: UUID = Field(..., description="Unique task identifier")
    user_id: UUID = Field(..., description="Task owner identifier")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    next_run: Optional[datetime] = Field(None, description="Next scheduled execution time")
    metadata: Dict[str, Any] = Field(
        default_factory=lambda: {"version": settings.API_VERSION}
    )
    execution_history: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Historical execution records"
    )
    version: str = Field(
        default=settings.API_VERSION,
        description="Schema version"
    )
    performance_metrics: Dict[str, Any] = Field(
        default_factory=dict,
        description="Task performance statistics"
    )

    class Config:
        """Pydantic model configuration"""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }

class TaskResponse(BaseModel):
    """
    Enhanced API response model with pagination and metadata.
    Implements standardized response format for task endpoints.
    """
    data: List[TaskInDB] = Field(..., description="Task data")
    total: int = Field(..., description="Total number of records")
    page: int = Field(default=1, ge=1, description="Current page number")
    size: int = Field(default=settings.DEFAULT_PAGE_SIZE, description="Page size")
    version: str = Field(default=settings.API_VERSION, description="API version")
    metadata: Dict[str, Any] = Field(
        default_factory=lambda: {
            "version": settings.API_VERSION,
            "timestamp": datetime.utcnow().isoformat()
        }
    )
    error: Optional[Dict[str, Any]] = Field(None, description="Error details if any")
    warnings: List[str] = Field(default_factory=list, description="Warning messages")

class TaskFilter(BaseModel):
    """
    Enhanced query filter model with sorting and pagination.
    Implements comprehensive filtering capabilities for task queries.
    """
    status: Optional[str] = Field(None, description="Filter by task status")
    priority: Optional[str] = Field(None, description="Filter by priority")
    is_active: Optional[bool] = Field(None, description="Filter by active status")
    start_date: Optional[datetime] = Field(None, description="Filter by start date")
    end_date: Optional[datetime] = Field(None, description="Filter by end date")
    sort_by: Optional[str] = Field(
        default='created_at',
        description="Field to sort by"
    )
    sort_order: Optional[str] = Field(
        default='desc',
        description="Sort order (asc/desc)"
    )
    page: int = Field(default=1, ge=1, description="Page number")
    size: int = Field(
        default=settings.DEFAULT_PAGE_SIZE,
        ge=1,
        le=100,
        description="Page size"
    )

    @validator('sort_by')
    def validate_sort_field(cls, value: str) -> str:
        """Validate sorting field against allowed values."""
        if value not in SORT_FIELDS:
            raise ValueError(f"Invalid sort field. Must be one of: {', '.join(SORT_FIELDS)}")
        return value

    @validator('sort_order')
    def validate_sort_order(cls, value: str) -> str:
        """Validate sort order value."""
        if value not in ('asc', 'desc'):
            raise ValueError("Sort order must be either 'asc' or 'desc'")
        return value

    @validator('end_date')
    def validate_date_range(cls, value: Optional[datetime], values: Dict[str, Any]) -> Optional[datetime]:
        """Validate date range consistency."""
        if value and values.get('start_date') and value < values['start_date']:
            raise ValueError("End date must be after start date")
        return value