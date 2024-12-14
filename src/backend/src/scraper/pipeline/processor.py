"""
Enterprise-grade data processing pipeline orchestrator for web scraping platform.
Implements comprehensive validation, cleaning, and transformation with extensive monitoring.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from functools import wraps

# Third-party imports with versions
from prometheus_client import Counter, Histogram  # v0.17.0
from cachetools import TTLCache  # v5.3.0

# Internal imports
from .validator import DataValidator
from .cleaner import DataCleaner
from .transformer import DataTransformer
from ...api.schemas.data import ScrapedData

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
PROCESSING_TIMEOUT = 120  # seconds
MAX_RETRIES = 3
BATCH_SIZE = 1000

# Prometheus metrics
processing_metrics = Counter(
    "scraper_processing_total",
    "Total data processing attempts",
    ["status", "stage"]
)
processing_duration = Histogram(
    "scraper_processing_duration_seconds",
    "Time spent on data processing",
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

def performance_monitor(stage_name: str):
    """Decorator for monitoring pipeline stage performance."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = datetime.utcnow()
            try:
                with processing_duration.time():
                    result = await func(*args, **kwargs)
                processing_metrics.labels(status="success", stage=stage_name).inc()
                return result
            except Exception as e:
                processing_metrics.labels(status="error", stage=stage_name).inc()
                logger.error(f"Pipeline stage {stage_name} failed: {str(e)}")
                raise
            finally:
                duration = (datetime.utcnow() - start_time).total_seconds()
                logger.info(f"Pipeline stage {stage_name} completed in {duration:.2f}s")
        return wrapper
    return decorator

class DataProcessor:
    """
    Enterprise-grade data processing pipeline orchestrator with comprehensive
    monitoring, error handling, and performance optimization.
    """

    def __init__(self, pipeline_config: Dict[str, Any]):
        """
        Initialize processor with comprehensive pipeline configuration.

        Args:
            pipeline_config: Configuration dictionary for all pipeline stages
        """
        self._pipeline_config = pipeline_config
        self._metrics = {
            "total_processed": 0,
            "successful": 0,
            "failed": 0,
            "validation_errors": 0,
            "cleaning_errors": 0,
            "transformation_errors": 0
        }
        self._error_stats = {}
        self._results_cache = TTLCache(maxsize=1000, ttl=3600)

        # Initialize pipeline components
        self._validator = DataValidator(
            task_config=pipeline_config.get("validation", {}),
            cache_ttl=pipeline_config.get("cache_ttl", 3600)
        )
        self._cleaner = DataCleaner(
            cleaning_config=pipeline_config.get("cleaning", {})
        )
        self._transformer = DataTransformer(
            transform_config=pipeline_config.get("transformation", {}),
            validation_rules=pipeline_config.get("validation_rules", {})
        )

        logger.info(
            "DataProcessor initialized",
            extra={
                "config_size": len(pipeline_config),
                "components": ["validator", "cleaner", "transformer"]
            }
        )

    @performance_monitor("process")
    async def process(self, data: ScrapedData) -> ScrapedData:
        """
        Process scraped data through validation, cleaning, and transformation stages.

        Args:
            data: ScrapedData instance to process

        Returns:
            ScrapedData: Fully processed data with validation results
        """
        start_time = datetime.utcnow()
        self._metrics["total_processed"] += 1

        try:
            # Validate input data
            is_valid, validation_errors, validation_metadata = await self._validate_data(data)
            if not is_valid:
                self._handle_validation_failure(data, validation_errors)
                return data

            # Clean data
            cleaned_data = await self._clean_data(data)
            if cleaned_data.error_context:
                self._handle_cleaning_failure(cleaned_data)
                return cleaned_data

            # Transform data
            transformed_data = await self._transform_data(cleaned_data)
            if transformed_data.error_context:
                self._handle_transformation_failure(transformed_data)
                return transformed_data

            # Update success metrics
            self._metrics["successful"] += 1
            processing_time = (datetime.utcnow() - start_time).total_seconds()

            # Update processing metadata
            transformed_data.metadata.update({
                "processing_time": processing_time,
                "pipeline_version": "1.0.0",
                "stages_completed": ["validation", "cleaning", "transformation"],
                "quality_metrics": {
                    "accuracy": self._calculate_accuracy(),
                    "compliance": self._verify_schema_compliance(transformed_data),
                    "error_rate": self._calculate_error_rate()
                }
            })

            logger.info(
                "Data processing completed successfully",
                extra={
                    "data_id": str(transformed_data.id),
                    "processing_time": processing_time,
                    "quality_metrics": transformed_data.metadata["quality_metrics"]
                }
            )

            return transformed_data

        except Exception as e:
            self._metrics["failed"] += 1
            logger.error(
                "Data processing failed",
                extra={
                    "error": str(e),
                    "data_id": str(data.id),
                    "stage": "process"
                }
            )
            data.error_context = {
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
                "stage": "process"
            }
            raise

    @performance_monitor("validation")
    async def _validate_data(self, data: ScrapedData) -> tuple:
        """Execute validation stage with retries."""
        for attempt in range(MAX_RETRIES):
            try:
                return await self._validator.validate(data)
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    self._metrics["validation_errors"] += 1
                    raise
                logger.warning(f"Validation attempt {attempt + 1} failed: {str(e)}")
                await asyncio.sleep(1)

    @performance_monitor("cleaning")
    async def _clean_data(self, data: ScrapedData) -> ScrapedData:
        """Execute cleaning stage with retries."""
        for attempt in range(MAX_RETRIES):
            try:
                return await self._cleaner.clean(data)
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    self._metrics["cleaning_errors"] += 1
                    raise
                logger.warning(f"Cleaning attempt {attempt + 1} failed: {str(e)}")
                await asyncio.sleep(1)

    @performance_monitor("transformation")
    async def _transform_data(self, data: ScrapedData) -> ScrapedData:
        """Execute transformation stage with retries."""
        for attempt in range(MAX_RETRIES):
            try:
                return await self._transformer.transform(data)
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    self._metrics["transformation_errors"] += 1
                    raise
                logger.warning(f"Transformation attempt {attempt + 1} failed: {str(e)}")
                await asyncio.sleep(1)

    def _calculate_accuracy(self) -> float:
        """Calculate data accuracy percentage."""
        total = self._metrics["total_processed"]
        if total == 0:
            return 100.0
        return (self._metrics["successful"] / total) * 100

    def _verify_schema_compliance(self, data: ScrapedData) -> float:
        """Verify schema compliance percentage."""
        if not data.validation_results:
            return 0.0
        return data.validation_results.get("compliance_rate", 100.0)

    def _calculate_error_rate(self) -> float:
        """Calculate overall error rate percentage."""
        total = self._metrics["total_processed"]
        if total == 0:
            return 0.0
        total_errors = (
            self._metrics["validation_errors"] +
            self._metrics["cleaning_errors"] +
            self._metrics["transformation_errors"]
        )
        return (total_errors / total) * 100

    def _handle_validation_failure(self, data: ScrapedData, errors: List[str]) -> None:
        """Handle validation stage failure."""
        self._metrics["validation_errors"] += 1
        data.error_context = {
            "stage": "validation",
            "errors": errors,
            "timestamp": datetime.utcnow().isoformat()
        }

    def _handle_cleaning_failure(self, data: ScrapedData) -> None:
        """Handle cleaning stage failure."""
        self._metrics["cleaning_errors"] += 1
        if not data.error_context:
            data.error_context = {
                "stage": "cleaning",
                "timestamp": datetime.utcnow().isoformat()
            }

    def _handle_transformation_failure(self, data: ScrapedData) -> None:
        """Handle transformation stage failure."""
        self._metrics["transformation_errors"] += 1
        if not data.error_context:
            data.error_context = {
                "stage": "transformation",
                "timestamp": datetime.utcnow().isoformat()
            }

    def get_pipeline_stats(self) -> Dict[str, Any]:
        """
        Retrieve comprehensive pipeline statistics and metrics.

        Returns:
            Dict containing detailed pipeline statistics
        """
        return {
            "metrics": self._metrics,
            "error_stats": self._error_stats,
            "quality_metrics": {
                "accuracy": self._calculate_accuracy(),
                "error_rate": self._calculate_error_rate()
            },
            "performance": {
                "validation_time": processing_duration.labels(stage="validation").sum(),
                "cleaning_time": processing_duration.labels(stage="cleaning").sum(),
                "transformation_time": processing_duration.labels(stage="transformation").sum()
            }
        }

# Export DataProcessor class
__all__ = ["DataProcessor"]