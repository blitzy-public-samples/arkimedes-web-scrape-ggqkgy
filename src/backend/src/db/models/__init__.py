"""
Database models initialization module for the Web Scraping Platform.
Manages SQLAlchemy model initialization, relationship validation, and version tracking.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from typing import List, Type
import logging

# Internal imports
from .user import User
from .task import Task, TASK_STATUSES, TASK_PRIORITIES
from .execution import Execution, EXECUTION_STATUSES
from .data import Data, DATA_TYPES, VALIDATION_STATUSES

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
MODEL_VERSION = '1.0.0'

# List of all database models for initialization
ALL_MODELS: List[Type] = [
    User,
    Task,
    Execution,
    Data
]

def validate_relationships() -> bool:
    """
    Validates model relationships and foreign key constraints.
    Ensures all model relationships are properly configured.
    
    Returns:
        bool: True if all relationships are valid
    """
    try:
        logger.info("Validating model relationships...")
        
        # Validate User-Task relationship
        if not hasattr(User, 'tasks') or not hasattr(Task, 'user'):
            logger.error("Invalid User-Task relationship configuration")
            return False
            
        # Validate Task-Execution relationship
        if not hasattr(Task, 'executions') or not hasattr(Execution, 'task'):
            logger.error("Invalid Task-Execution relationship configuration")
            return False
            
        # Validate Execution-Data relationship
        if not hasattr(Execution, 'data_points') or not hasattr(Data, 'execution'):
            logger.error("Invalid Execution-Data relationship configuration")
            return False
            
        # Validate foreign key constraints
        relationships = [
            (Task, 'user_id', User),
            (Execution, 'task_id', Task),
            (Data, 'execution_id', Execution)
        ]
        
        for model, fk_field, parent_model in relationships:
            if not hasattr(model, fk_field):
                logger.error(f"Missing foreign key {fk_field} in {model.__name__}")
                return False
                
        logger.info("Model relationships validated successfully")
        return True
        
    except Exception as e:
        logger.error(f"Error validating relationships: {str(e)}")
        return False

def initialize_models() -> None:
    """
    Initializes all database models in the correct dependency order.
    Performs relationship validation and version tracking.
    """
    try:
        logger.info(f"Initializing database models version {MODEL_VERSION}")
        
        # Log model initialization order
        model_order = [model.__name__ for model in ALL_MODELS]
        logger.info(f"Model initialization order: {', '.join(model_order)}")
        
        # Validate model relationships
        if not validate_relationships():
            raise RuntimeError("Model relationship validation failed")
            
        # Log successful initialization
        logger.info("Database models initialized successfully")
        
    except Exception as e:
        logger.error(f"Error initializing models: {str(e)}")
        raise

# Export public interface
__all__ = [
    # Models
    'User',
    'Task',
    'Execution',
    'Data',
    
    # Constants
    'MODEL_VERSION',
    'ALL_MODELS',
    'TASK_STATUSES',
    'TASK_PRIORITIES',
    'EXECUTION_STATUSES',
    'DATA_TYPES',
    'VALIDATION_STATUSES',
    
    # Functions
    'initialize_models',
    'validate_relationships'
]