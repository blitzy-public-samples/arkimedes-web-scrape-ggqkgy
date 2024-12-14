"""
Enhanced data transformation module for the Web Scraping Platform.
Implements complex data transformations with validation, error handling, and monitoring.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional, Tuple
from functools import wraps
from datetime import datetime

# Third-party imports with versions
import pandas as pd  # ^2.1.0
import numpy as np  # ^1.24.0

# Internal imports
from ...api.schemas.data import ScrapedData

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
TRANSFORMATION_TIMEOUT = 60  # seconds
MAX_RETRIES = 3
BATCH_SIZE = 1000

def timeout(seconds):
    """Decorator to enforce timeout on transformation operations."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await asyncio.wait_for(func(*args, **kwargs), timeout=seconds)
            except asyncio.TimeoutError:
                logger.error(f"Transformation timeout after {seconds} seconds")
                raise TimeoutError(f"Transformation operation timed out after {seconds} seconds")
        return wrapper
    return decorator

class DataTransformer:
    """
    Enhanced data transformer handling complex transformations with validation,
    error tracking, and monitoring capabilities.
    """

    def __init__(self, transform_config: Dict[str, Any], 
                 validation_rules: Optional[Dict[str, Any]] = None):
        """
        Initialize transformer with enhanced configuration and monitoring.

        Args:
            transform_config: Configuration for transformation rules
            validation_rules: Optional validation rules for data
        """
        self._transformation_rules = {}
        self._field_mappings = {}
        self._data_frame = None
        self._transformation_history = []
        self._validation_results = {}
        self._error_counts = {}

        # Initialize configuration
        self._init_configuration(transform_config)
        self._validation_rules = validation_rules or {}

        logger.info("DataTransformer initialized with configuration", 
                   extra={"config_size": len(transform_config)})

    def _init_configuration(self, config: Dict[str, Any]) -> None:
        """Initialize transformation configuration and rules."""
        self._field_mappings = config.get("field_mappings", {})
        
        # Setup transformation rules
        for rule in config.get("transformation_rules", []):
            self._transformation_rules[rule["field"]] = {
                "type": rule.get("type", "string"),
                "operation": rule.get("operation"),
                "parameters": rule.get("parameters", {}),
                "fallback": rule.get("fallback")
            }

    @asyncio.coroutine
    @timeout(TRANSFORMATION_TIMEOUT)
    async def transform(self, data: ScrapedData) -> ScrapedData:
        """
        Transform scraped data with enhanced validation and error handling.

        Args:
            data: ScrapedData object containing raw data

        Returns:
            ScrapedData: Transformed data object with validation results
        """
        try:
            # Validate input schema
            is_valid, errors = self.validate_schema(data.raw_data, self._validation_rules)
            if not is_valid:
                logger.error("Schema validation failed", extra={"errors": errors})
                data.validation_results = {"schema_validation": errors}
                return data

            # Convert to DataFrame for efficient processing
            self._data_frame = pd.DataFrame([data.raw_data])
            
            # Apply field mappings
            self._apply_field_mappings()

            # Execute transformations
            transformed_data = {}
            for field, rule in self._transformation_rules.items():
                try:
                    transformed_value = await self._apply_transformation(field, rule)
                    if transformed_value is not None:
                        transformed_data[field] = transformed_value
                except Exception as e:
                    logger.error(f"Transformation error for field {field}", 
                               extra={"error": str(e)})
                    transformed_value = await self.handle_transformation_error(e, field)
                    if transformed_value is not None:
                        transformed_data[field] = transformed_value

            # Update transformation history
            self._update_transformation_history(data.raw_data, transformed_data)

            # Set transformed data and validation results
            data.transformed_data = transformed_data
            data.validation_results = self._validation_results

            logger.info("Data transformation completed successfully", 
                       extra={"fields_transformed": len(transformed_data)})
            return data

        except Exception as e:
            logger.error("Transformation process failed", extra={"error": str(e)})
            raise

    async def _apply_transformation(self, field: str, rule: Dict[str, Any]) -> Any:
        """Apply transformation rule to field."""
        operation = rule["operation"]
        params = rule["parameters"]
        
        if operation == "type_conversion":
            return self._data_frame[field].astype(rule["type"]).iloc[0]
        elif operation == "numeric_operation":
            return float(eval(f"self._data_frame['{field}'].iloc[0]{params['operator']}{params['value']}"))
        elif operation == "string_operation":
            value = str(self._data_frame[field].iloc[0])
            if params.get("case") == "upper":
                return value.upper()
            elif params.get("case") == "lower":
                return value.lower()
            return value
        elif operation == "datetime_operation":
            return pd.to_datetime(self._data_frame[field].iloc[0], 
                                format=params.get("format")).isoformat()
        else:
            return self._data_frame[field].iloc[0]

    def _apply_field_mappings(self) -> None:
        """Apply field mappings to DataFrame."""
        for new_field, original_field in self._field_mappings.items():
            if original_field in self._data_frame.columns:
                self._data_frame[new_field] = self._data_frame[original_field]

    def _update_transformation_history(self, raw_data: Dict[str, Any], 
                                    transformed_data: Dict[str, Any]) -> None:
        """Update transformation history with latest operation."""
        self._transformation_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "original_fields": list(raw_data.keys()),
            "transformed_fields": list(transformed_data.keys()),
            "error_counts": self._error_counts.copy()
        })

    def validate_schema(self, data: Dict[str, Any], 
                       schema: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate data against defined schema.

        Args:
            data: Data dictionary to validate
            schema: Validation schema

        Returns:
            Tuple containing validation result and list of errors
        """
        errors = []
        
        for field, rules in schema.items():
            if rules.get("required", False) and field not in data:
                errors.append(f"Required field missing: {field}")
                continue

            if field in data:
                value = data[field]
                
                # Type validation
                expected_type = rules.get("type")
                if expected_type and not isinstance(value, eval(expected_type)):
                    errors.append(f"Invalid type for {field}: expected {expected_type}")

                # Range validation
                if "range" in rules:
                    min_val, max_val = rules["range"]
                    if not min_val <= float(value) <= max_val:
                        errors.append(f"Value out of range for {field}")

                # Pattern validation
                if "pattern" in rules and not rules["pattern"].match(str(value)):
                    errors.append(f"Invalid format for {field}")

        return len(errors) == 0, errors

    async def handle_transformation_error(self, error: Exception, 
                                       field_name: str) -> Optional[Any]:
        """
        Handle transformation errors with retry logic.

        Args:
            error: Exception that occurred
            field_name: Name of the field being transformed

        Returns:
            Optional transformed value or None
        """
        self._error_counts[field_name] = self._error_counts.get(field_name, 0) + 1
        
        if self._error_counts[field_name] <= MAX_RETRIES:
            logger.warning(f"Retrying transformation for field {field_name}", 
                         extra={"attempt": self._error_counts[field_name]})
            
            # Get fallback value if available
            if field_name in self._transformation_rules:
                return self._transformation_rules[field_name].get("fallback")
            
        logger.error(f"Transformation failed for field {field_name}", 
                    extra={"error": str(error), "attempts": self._error_counts[field_name]})
        return None