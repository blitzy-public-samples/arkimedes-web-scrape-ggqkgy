"""
JSON data extractor implementation for handling JSON data from web APIs and responses.
Provides robust error handling, schema validation, and field mapping capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import json
from json.decoder import JSONDecodeError
import asyncio
from typing import Dict, Any, Optional, List, Union, TypeVar, Generic
import logging

# Internal imports
from scraper.extractors.base import BaseExtractor
from utils.validation import validate_json_schema

# Constants for JSON handling
DEFAULT_ENCODING = 'utf-8'
MAX_JSON_SIZE = 10 * 1024 * 1024  # 10MB limit
CONTENT_TYPE = 'application/json'
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 3
SCHEMA_VERSION = '1.0'

# Configure logging
logger = logging.getLogger(__name__)

T = TypeVar('T')

class JSONExtractor(BaseExtractor, Generic[T]):
    """
    Enhanced JSON data extractor with support for schema validation,
    field mapping, and performance monitoring.
    """

    def __init__(
        self,
        config: Dict[str, Any],
        schema: Optional[Dict[str, Any]] = None,
        mappings: Optional[Dict[str, str]] = None
    ) -> None:
        """
        Initialize JSON extractor with enhanced configuration.

        Args:
            config: Configuration dictionary
            schema: Optional JSON schema for validation
            mappings: Optional field name mappings

        Raises:
            ValidationError: If configuration is invalid
        """
        super().__init__(config)

        # Initialize JSON-specific configuration
        self._json_schema = schema or config.get('json_schema', {})
        self._field_mappings = mappings or config.get('field_mappings', {})
        self._timeout = config.get('timeout', DEFAULT_TIMEOUT)
        self._retries = config.get('retries', MAX_RETRIES)

        # Configure JSON-specific headers
        self._headers.update({
            'Accept': CONTENT_TYPE,
            'Content-Type': CONTENT_TYPE
        })

        logger.info(
            "Initialized JSONExtractor with schema version %s",
            SCHEMA_VERSION
        )

    async def extract(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Extract JSON data from URL with enhanced error handling and validation.

        Args:
            url: Target URL for JSON extraction
            params: Optional query parameters
            headers: Optional request headers

        Returns:
            Dict containing validated and transformed JSON data

        Raises:
            ValidationError: If JSON data is invalid
            JSONDecodeError: If JSON parsing fails
            ValueError: If content size exceeds limit
        """
        try:
            # Merge headers
            request_headers = {**self._headers, **(headers or {})}

            # Fetch content with retry support
            content = await self.fetch(
                url,
                params=params,
                retry_options={
                    'timeout': self._timeout,
                    'max_attempts': self._retries
                }
            )

            # Verify content type
            if isinstance(content, bytes):
                content = content.decode(DEFAULT_ENCODING)

            # Parse and validate JSON
            json_data = await self.parse_json(content)

            # Transform data using field mappings
            transformed_data = await self.transform_data(json_data)

            # Validate against schema
            is_valid, error = validate_json_schema(
                transformed_data,
                self._json_schema,
                SCHEMA_VERSION
            )

            if not is_valid:
                logger.error(
                    "JSON schema validation failed: %s",
                    error
                )
                raise error

            return transformed_data

        except JSONDecodeError as e:
            logger.error(
                "JSON parsing error for URL %s: %s",
                url,
                str(e),
                exc_info=True
            )
            raise

        except Exception as e:
            logger.error(
                "Error extracting JSON from %s: %s",
                url,
                str(e),
                exc_info=True
            )
            raise

    async def parse_json(self, content: str) -> Dict[str, Any]:
        """
        Parse JSON content with size validation and error handling.

        Args:
            content: Raw JSON string

        Returns:
            Dict containing parsed JSON data

        Raises:
            ValueError: If content size exceeds limit
            JSONDecodeError: If JSON parsing fails
        """
        # Validate content size
        if len(content) > MAX_JSON_SIZE:
            raise ValueError(
                f"JSON content size ({len(content)} bytes) exceeds limit "
                f"({MAX_JSON_SIZE} bytes)"
            )

        try:
            # Parse JSON with error context
            json_data = json.loads(content)

            # Validate basic structure
            if not isinstance(json_data, (dict, list)):
                raise ValueError("JSON root must be object or array")

            return json_data

        except JSONDecodeError as e:
            logger.error(
                "JSON parsing failed: %s",
                str(e),
                exc_info=True
            )
            raise

    async def transform_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform JSON data using field mappings with type conversion.

        Args:
            data: Raw JSON data dictionary

        Returns:
            Dict containing transformed data

        Raises:
            KeyError: If required field is missing
            ValueError: If type conversion fails
        """
        try:
            transformed = {}

            for source_field, target_field in self._field_mappings.items():
                # Handle nested fields using dot notation
                field_parts = source_field.split('.')
                value = data

                for part in field_parts:
                    if isinstance(value, dict):
                        value = value.get(part)
                    else:
                        value = None
                        break

                if value is not None:
                    transformed[target_field] = value

            # Include unmapped fields
            for key, value in data.items():
                if key not in self._field_mappings:
                    transformed[key] = value

            return transformed

        except Exception as e:
            logger.error(
                "Data transformation failed: %s",
                str(e),
                exc_info=True
            )
            raise