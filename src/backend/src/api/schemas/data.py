"""
Enhanced Pydantic schema definitions for scraped data validation, transformation, and API responses.
Implements comprehensive validation rules, versioning, and error tracking.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from uuid import UUID

# Third-party imports with versions
from pydantic import BaseModel, Field, validator, root_validator  # v2.0.0

# Internal imports
from ..core.config import settings

# Global constants
DATA_STATUSES = ["pending", "valid", "invalid", "error", "processing"]
SCHEMA_VERSION = "1.0.0"

class DataBase(BaseModel):
    """
    Enhanced base model for scraped data with comprehensive audit trails and versioning.
    Implements core data fields with validation and metadata tracking.
    """
    id: UUID = Field(
        ...,
        description="Unique identifier for the data record"
    )
    execution_id: UUID = Field(
        ...,
        description="Reference to the scraping task execution"
    )
    collected_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp when data was collected"
    )
    version: str = Field(
        default=SCHEMA_VERSION,
        description="Schema version for data compatibility"
    )
    status: str = Field(
        default="pending",
        description="Current status of the data record"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Record creation timestamp"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last update timestamp"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata for the record"
    )

    @validator("status")
    def validate_status(cls, value: str) -> str:
        """
        Validates status transitions and ensures status value is allowed.
        
        Args:
            value: Status value to validate
            
        Returns:
            Validated status string
            
        Raises:
            ValueError: If status is invalid
        """
        if value not in DATA_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(DATA_STATUSES)}")
        return value

    @root_validator
    def validate_timestamps(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates timestamp consistency across the record.
        
        Args:
            values: Dictionary of field values
            
        Returns:
            Validated values dictionary
        """
        collected_at = values.get("collected_at")
        created_at = values.get("created_at")
        updated_at = values.get("updated_at")

        if collected_at and created_at and collected_at > created_at:
            raise ValueError("collected_at cannot be after created_at")
        
        if created_at and updated_at and updated_at < created_at:
            raise ValueError("updated_at cannot be before created_at")

        return values

class ScrapedData(DataBase):
    """
    Enhanced model for raw and transformed data with comprehensive validation tracking.
    Implements data transformation history and error context.
    """
    raw_data: Dict[str, Any] = Field(
        ...,
        description="Original scraped data"
    )
    transformed_data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Processed and transformed data"
    )
    validation_results: Dict[str, Any] = Field(
        default_factory=dict,
        description="Detailed validation results"
    )
    transformation_history: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="History of data transformations"
    )
    error_context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Context for any errors encountered"
    )

    @validator("raw_data")
    def validate_raw_data(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates raw data structure and content.
        
        Args:
            value: Raw data dictionary to validate
            
        Returns:
            Validated raw data dictionary
        """
        if not value:
            raise ValueError("raw_data cannot be empty")
        
        # Ensure schema version compatibility
        if "_schema_version" in value and value["_schema_version"] != SCHEMA_VERSION:
            raise ValueError(f"Schema version mismatch. Expected {SCHEMA_VERSION}")
        
        return value

    @root_validator
    def validate_transformation(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates transformation consistency and tracks changes.
        
        Args:
            values: Dictionary of field values
            
        Returns:
            Validated values dictionary
        """
        raw_data = values.get("raw_data")
        transformed_data = values.get("transformed_data")
        transformation_history = values.get("transformation_history", [])

        if transformed_data:
            # Track transformation
            transformation_history.append({
                "timestamp": datetime.utcnow().isoformat(),
                "original_fields": list(raw_data.keys()),
                "transformed_fields": list(transformed_data.keys())
            })
            values["transformation_history"] = transformation_history

        return values

class DataResponse(BaseModel):
    """
    Enhanced API response model with metadata and pagination support.
    Implements standardized response format with error handling.
    """
    data: List[ScrapedData] = Field(
        default_factory=list,
        description="List of scraped data records"
    )
    total: int = Field(
        default=0,
        description="Total number of records"
    )
    page: int = Field(
        default=1,
        description="Current page number",
        ge=1
    )
    size: int = Field(
        default=settings.DEFAULT_PAGE_SIZE,
        description="Number of records per page",
        ge=1,
        le=settings.MAX_PAGE_SIZE
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Response metadata"
    )
    error: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Error details if any"
    )
    schema_version: str = Field(
        default=SCHEMA_VERSION,
        description="API schema version"
    )

class DataFilter(BaseModel):
    """
    Enhanced query filter model with validation and optimization support.
    Implements comprehensive filtering capabilities with query hints.
    """
    status: Optional[str] = Field(
        default=None,
        description="Filter by data status"
    )
    execution_id: Optional[UUID] = Field(
        default=None,
        description="Filter by execution ID"
    )
    start_date: Optional[datetime] = Field(
        default=None,
        description="Filter by start date"
    )
    end_date: Optional[datetime] = Field(
        default=None,
        description="Filter by end date"
    )
    page: int = Field(
        default=1,
        description="Page number",
        ge=1
    )
    size: int = Field(
        default=settings.DEFAULT_PAGE_SIZE,
        description="Page size",
        ge=1,
        le=settings.MAX_PAGE_SIZE
    )
    query_hints: Dict[str, Any] = Field(
        default_factory=dict,
        description="Query optimization hints"
    )

    @validator("status")
    def validate_status_filter(cls, value: Optional[str]) -> Optional[str]:
        """
        Validates status filter value.
        
        Args:
            value: Status value to validate
            
        Returns:
            Validated status string or None
        """
        if value and value not in DATA_STATUSES:
            raise ValueError(f"Invalid status filter. Must be one of: {', '.join(DATA_STATUSES)}")
        return value

    @validator("end_date")
    def validate_date_range(cls, value: Optional[datetime], values: Dict[str, Any]) -> Optional[datetime]:
        """
        Validates date range consistency.
        
        Args:
            value: End date to validate
            values: Dictionary of field values
            
        Returns:
            Validated end date or None
        """
        start_date = values.get("start_date")
        if start_date and value and value < start_date:
            raise ValueError("end_date must be after start_date")
        return value