"""
Initialization module for Pydantic schema definitions used across the web scraping platform's API layer.
Provides centralized schema validation, serialization, and standardized API response models.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Version tracking for schema compatibility
__version__ = "1.0.0"

# Import all schema models from data module
from .data import (
    DataBase,
    ScrapedData,
    DataResponse,
    DataFilter
)

# Import all schema models from tasks module
from .tasks import (
    TaskBase,
    TaskConfig,
    TaskSchedule,
    TaskCreate,
    TaskResponse,
    TaskFilter
)

# Export all public schema models
__all__ = [
    # Data-related schemas
    "DataBase",
    "ScrapedData", 
    "DataResponse",
    "DataFilter",
    
    # Task-related schemas
    "TaskBase",
    "TaskConfig",
    "TaskSchedule", 
    "TaskCreate",
    "TaskResponse",
    "TaskFilter"
]

# Schema version compatibility mapping
SCHEMA_VERSIONS = {
    "1.0.0": {
        "data": {
            "DataBase": DataBase,
            "ScrapedData": ScrapedData,
            "DataResponse": DataResponse,
            "DataFilter": DataFilter
        },
        "tasks": {
            "TaskBase": TaskBase,
            "TaskConfig": TaskConfig,
            "TaskSchedule": TaskSchedule,
            "TaskCreate": TaskCreate,
            "TaskResponse": TaskResponse,
            "TaskFilter": TaskFilter
        }
    }
}

def get_schema_version() -> str:
    """
    Returns the current schema version.
    
    Returns:
        str: Current schema version
    """
    return __version__

def get_schema_models(version: str = __version__):
    """
    Retrieves schema models for a specific version.
    
    Args:
        version: Schema version to retrieve
        
    Returns:
        dict: Dictionary of schema models for the specified version
        
    Raises:
        ValueError: If version is not supported
    """
    if version not in SCHEMA_VERSIONS:
        raise ValueError(f"Unsupported schema version: {version}")
    return SCHEMA_VERSIONS[version]