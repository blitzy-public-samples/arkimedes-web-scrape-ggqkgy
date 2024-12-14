"""
Enterprise-grade data validation module for web scraping pipeline.
Implements comprehensive validation rules, error tracking, and performance monitoring.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

# Third-party imports with versions
from pydantic import ValidationError  # v2.0.0
from cachetools import TTLCache  # v5.3.0
from prometheus_client import Counter, Histogram  # v0.17.0

# Internal imports
from ...api.schemas.data import ScrapedData
from ...api.schemas.tasks import TaskBase
from ...utils.validation import ValidationError as CustomValidationError

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
VALIDATION_TIMEOUT = 60  # seconds
VALIDATION_CACHE_SIZE = 1000
SCHEMA_VERSION = "1.0.0"

# Prometheus metrics
validation_metrics = Counter(
    "scraper_validation_total",
    "Total validation attempts",
    ["status", "error_type"]
)
validation_duration = Histogram(
    "scraper_validation_duration_seconds",
    "Time spent on validation",
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)

class DataValidator:
    """
    Enterprise-grade validator for scraped data with comprehensive validation capabilities,
    caching, and metrics collection.
    """
    
    def __init__(self, task_config: TaskBase, cache_ttl: Optional[int] = 3600):
        """
        Initialize validator with task configuration and caching.
        
        Args:
            task_config: Task configuration containing validation rules
            cache_ttl: Cache TTL in seconds (default: 1 hour)
        """
        self._validation_rules = task_config.configuration.get("validation_rules", {})
        self._custom_validators: Dict[str, callable] = {}
        self._validation_cache = TTLCache(
            maxsize=VALIDATION_CACHE_SIZE,
            ttl=cache_ttl
        )
        self._schema_version = SCHEMA_VERSION
        
        # Initialize validation statistics
        self._stats = {
            "total_validations": 0,
            "successful_validations": 0,
            "failed_validations": 0,
            "cache_hits": 0
        }
        
        logger.info(
            "Initialized DataValidator",
            extra={
                "task_id": task_config.id,
                "schema_version": self._schema_version,
                "rules_count": len(self._validation_rules)
            }
        )

    async def validate(self, data: ScrapedData, timeout: Optional[float] = VALIDATION_TIMEOUT) -> Tuple[bool, List[str], Dict[str, Any]]:
        """
        Asynchronously validate scraped data with timeout and caching.
        
        Args:
            data: ScrapedData instance to validate
            timeout: Validation timeout in seconds
            
        Returns:
            Tuple containing:
            - bool: Validation success status
            - List[str]: List of validation errors
            - Dict[str, Any]: Validation metadata
        """
        start_time = datetime.utcnow()
        errors: List[str] = []
        metadata: Dict[str, Any] = {
            "start_time": start_time.isoformat(),
            "schema_version": self._schema_version
        }

        try:
            # Check cache first
            cache_key = hash(f"{str(data.raw_data)}:{self._schema_version}")
            if cache_key in self._validation_cache:
                self._stats["cache_hits"] += 1
                cached_result = self._validation_cache[cache_key]
                logger.debug("Validation cache hit", extra={"cache_key": cache_key})
                return cached_result

            # Verify schema version compatibility
            if data.version != self._schema_version:
                error_msg = f"Schema version mismatch: expected {self._schema_version}, got {data.version}"
                errors.append(error_msg)
                validation_metrics.labels(status="failed", error_type="schema_mismatch").inc()
                return False, errors, metadata

            # Execute validation with timeout
            async with validation_duration.time():
                validation_tasks = [
                    self._validate_base_schema(data),
                    self._validate_custom_rules(data),
                    self._validate_business_rules(data)
                ]
                
                results = await asyncio.gather(*validation_tasks, return_exceptions=True)

            # Process validation results
            for result in results:
                if isinstance(result, Exception):
                    errors.append(f"Validation error: {str(result)}")
                elif isinstance(result, list):
                    errors.extend(result)

            # Update statistics and metrics
            self._stats["total_validations"] += 1
            is_valid = len(errors) == 0
            
            if is_valid:
                self._stats["successful_validations"] += 1
                validation_metrics.labels(status="success", error_type="none").inc()
            else:
                self._stats["failed_validations"] += 1
                validation_metrics.labels(status="failed", error_type="validation_error").inc()

            # Cache validation result
            validation_result = (is_valid, errors, metadata)
            self._validation_cache[cache_key] = validation_result

            # Update metadata
            metadata.update({
                "end_time": datetime.utcnow().isoformat(),
                "duration_ms": (datetime.utcnow() - start_time).total_seconds() * 1000,
                "cache_hit": False,
                "validation_stats": self._stats
            })

            return validation_result

        except asyncio.TimeoutError:
            error_msg = f"Validation timeout after {timeout} seconds"
            errors.append(error_msg)
            validation_metrics.labels(status="failed", error_type="timeout").inc()
            logger.error(error_msg, extra={"data_id": data.id})
            return False, errors, metadata

        except Exception as e:
            error_msg = f"Unexpected validation error: {str(e)}"
            errors.append(error_msg)
            validation_metrics.labels(status="failed", error_type="system_error").inc()
            logger.exception(error_msg, extra={"data_id": data.id})
            return False, errors, metadata

    async def _validate_base_schema(self, data: ScrapedData) -> List[str]:
        """
        Validate base schema requirements.
        
        Args:
            data: ScrapedData instance
            
        Returns:
            List of validation errors
        """
        errors: List[str] = []
        
        try:
            # Validate required fields
            required_fields = {"url", "timestamp", "content"}
            missing_fields = required_fields - set(data.raw_data.keys())
            if missing_fields:
                errors.append(f"Missing required fields: {', '.join(missing_fields)}")

            # Validate field types and constraints
            if "url" in data.raw_data:
                if not isinstance(data.raw_data["url"], str):
                    errors.append("URL must be a string")
                elif len(data.raw_data["url"]) > 2048:
                    errors.append("URL exceeds maximum length of 2048 characters")

            if "timestamp" in data.raw_data:
                try:
                    datetime.fromisoformat(data.raw_data["timestamp"])
                except ValueError:
                    errors.append("Invalid timestamp format")

        except Exception as e:
            errors.append(f"Schema validation error: {str(e)}")
            logger.error("Schema validation failed", exc_info=True)

        return errors

    async def _validate_custom_rules(self, data: ScrapedData) -> List[str]:
        """
        Apply custom validation rules.
        
        Args:
            data: ScrapedData instance
            
        Returns:
            List of validation errors
        """
        errors: List[str] = []
        
        for field, validator in self._custom_validators.items():
            if field in data.raw_data:
                try:
                    is_valid = await validator(data.raw_data[field])
                    if not is_valid:
                        errors.append(f"Custom validation failed for field: {field}")
                except Exception as e:
                    errors.append(f"Custom validator error for {field}: {str(e)}")
                    logger.error(f"Custom validation failed for {field}", exc_info=True)

        return errors

    async def _validate_business_rules(self, data: ScrapedData) -> List[str]:
        """
        Apply business-specific validation rules.
        
        Args:
            data: ScrapedData instance
            
        Returns:
            List of validation errors
        """
        errors: List[str] = []
        
        for rule_name, rule_config in self._validation_rules.items():
            try:
                field = rule_config.get("field")
                rule_type = rule_config.get("type")
                parameters = rule_config.get("parameters", {})

                if field not in data.raw_data:
                    continue

                value = data.raw_data[field]

                if rule_type == "range":
                    min_val = parameters.get("min")
                    max_val = parameters.get("max")
                    if min_val is not None and value < min_val:
                        errors.append(f"{field} below minimum value: {min_val}")
                    if max_val is not None and value > max_val:
                        errors.append(f"{field} exceeds maximum value: {max_val}")

                elif rule_type == "regex":
                    import re
                    pattern = parameters.get("pattern")
                    if pattern and not re.match(pattern, str(value)):
                        errors.append(f"{field} does not match required pattern")

                elif rule_type == "enum":
                    allowed_values = parameters.get("values", [])
                    if value not in allowed_values:
                        errors.append(f"Invalid {field} value. Must be one of: {', '.join(map(str, allowed_values))}")

            except Exception as e:
                errors.append(f"Business rule validation error for {rule_name}: {str(e)}")
                logger.error(f"Business rule validation failed for {rule_name}", exc_info=True)

        return errors

    def add_custom_validator(self, field_name: str, validator_func: callable, metadata: Dict[str, Any]) -> None:
        """
        Register custom validation function with metadata.
        
        Args:
            field_name: Field to validate
            validator_func: Async validation function
            metadata: Validator metadata
        """
        if not asyncio.iscoroutinefunction(validator_func):
            raise ValueError("Validator function must be async")

        if field_name in self._custom_validators:
            logger.warning(f"Overwriting existing validator for {field_name}")

        self._custom_validators[field_name] = validator_func
        logger.info(
            f"Registered custom validator for {field_name}",
            extra={"metadata": metadata}
        )