"""
Enterprise-grade data processing pipeline initialization module.
Provides unified interface for data validation, cleaning, and transformation operations.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import logging
import asyncio
from typing import Dict, Any, Optional, Union, Awaitable
from functools import wraps

# Third-party imports with versions
from prometheus_client import Counter, Histogram  # v0.17.0

# Internal imports
from .validator import DataValidator
from .cleaner import DataCleaner
from .transformer import DataTransformer
from .processor import DataProcessor

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DEFAULT_VALIDATION_RULES = {
    'accuracy_threshold': 0.999,  # 99.9% accuracy requirement
    'schema_compliance': True,
    'strict_mode': True
}

DEFAULT_CLEANING_RULES = {
    'remove_duplicates': True,
    'handle_missing': 'interpolate',
    'sanitize_html': True
}

DEFAULT_TRANSFORMATION_RULES = {
    'date_format': 'ISO8601',
    'number_format': 'float64',
    'text_encoding': 'UTF-8'
}

# Pipeline configuration cache
PIPELINE_CONFIG_CACHE = {}

# Prometheus metrics
pipeline_creation_counter = Counter(
    'pipeline_creation_total',
    'Total number of pipeline creation attempts',
    ['status']
)

pipeline_creation_duration = Histogram(
    'pipeline_creation_duration_seconds',
    'Time spent creating pipeline instances',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)

def performance_monitor(func):
    """Decorator for monitoring pipeline creation performance."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        with pipeline_creation_duration.time():
            try:
                result = await func(*args, **kwargs)
                pipeline_creation_counter.labels(status='success').inc()
                return result
            except Exception as e:
                pipeline_creation_counter.labels(status='error').inc()
                logger.error(f"Pipeline creation failed: {str(e)}")
                raise
    return wrapper

def error_handler(func):
    """Decorator for handling pipeline creation errors."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            logger.error(
                "Pipeline creation error",
                extra={
                    "error": str(e),
                    "validation_rules": kwargs.get("validation_rules"),
                    "cleaning_rules": kwargs.get("cleaning_rules"),
                    "transformation_rules": kwargs.get("transformation_rules")
                }
            )
            raise RuntimeError(f"Failed to create pipeline: {str(e)}")
    return wrapper

@asyncio.coroutine
@performance_monitor
@error_handler
async def create_pipeline(
    validation_rules: Dict[str, Any] = None,
    cleaning_rules: Dict[str, Any] = None,
    transformation_rules: Dict[str, Any] = None,
    use_cache: bool = True,
    async_mode: bool = True
) -> Union[DataProcessor, Awaitable[DataProcessor]]:
    """
    Enhanced factory function to create a configured data processing pipeline.
    
    Args:
        validation_rules: Custom validation rules
        cleaning_rules: Custom cleaning rules
        transformation_rules: Custom transformation rules
        use_cache: Whether to use pipeline configuration cache
        async_mode: Whether to return an awaitable pipeline
        
    Returns:
        Configured DataProcessor instance or awaitable
    """
    try:
        # Merge with default configurations
        final_validation_rules = {**DEFAULT_VALIDATION_RULES, **(validation_rules or {})}
        final_cleaning_rules = {**DEFAULT_CLEANING_RULES, **(cleaning_rules or {})}
        final_transformation_rules = {**DEFAULT_TRANSFORMATION_RULES, **(transformation_rules or {})}

        # Generate cache key if caching is enabled
        if use_cache:
            cache_key = hash(f"{str(final_validation_rules)}{str(final_cleaning_rules)}{str(final_transformation_rules)}")
            if cache_key in PIPELINE_CONFIG_CACHE:
                logger.info("Using cached pipeline configuration")
                return PIPELINE_CONFIG_CACHE[cache_key]

        # Create pipeline configuration
        pipeline_config = {
            "validation": {
                "rules": final_validation_rules,
                "schema_version": "1.0.0"
            },
            "cleaning": {
                "rules": final_cleaning_rules,
                "field_encodings": {"text": "UTF-8"}
            },
            "transformation": {
                "rules": final_transformation_rules,
                "field_mappings": {}
            },
            "cache_ttl": 3600,
            "validation_rules": final_validation_rules
        }

        # Initialize pipeline components
        validator = DataValidator(pipeline_config["validation"])
        cleaner = DataCleaner(pipeline_config["cleaning"])
        transformer = DataTransformer(
            pipeline_config["transformation"],
            pipeline_config["validation_rules"]
        )

        # Create and configure processor
        processor = DataProcessor(pipeline_config)

        # Cache configuration if enabled
        if use_cache:
            PIPELINE_CONFIG_CACHE[cache_key] = processor

        logger.info(
            "Pipeline created successfully",
            extra={
                "validation_rules": len(final_validation_rules),
                "cleaning_rules": len(final_cleaning_rules),
                "transformation_rules": len(final_transformation_rules),
                "cached": use_cache
            }
        )

        return processor

    except Exception as e:
        logger.error(
            "Failed to create pipeline",
            extra={
                "error": str(e),
                "validation_rules": validation_rules,
                "cleaning_rules": cleaning_rules,
                "transformation_rules": transformation_rules
            }
        )
        raise

# Export public components
__all__ = [
    'DataValidator',
    'DataCleaner',
    'DataTransformer',
    'DataProcessor',
    'create_pipeline',
    'DEFAULT_VALIDATION_RULES',
    'DEFAULT_CLEANING_RULES',
    'DEFAULT_TRANSFORMATION_RULES'
]