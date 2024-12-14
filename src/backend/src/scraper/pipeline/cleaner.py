"""
Enhanced data cleaning module for web scraping pipeline.
Implements comprehensive data sanitization, validation, and quality assurance.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import re
import html
import asyncio
import logging
from typing import Dict, Any, List, Optional
from functools import wraps
from datetime import datetime

# Third-party imports with versions
import pandas as pd  # ^2.1.0
from bs4 import BeautifulSoup  # ^4.12.0
from cachetools import LRUCache  # ^5.3.0

# Internal imports
from ...api.schemas.data import ScrapedData
from ...utils.validation import sanitize_html

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
HTML_TAGS_PATTERN = re.compile('<.*?>')
CLEANING_TIMEOUT = 60  # seconds
BATCH_SIZE = 1000  # records per batch
CLEANING_PATTERNS_CACHE = LRUCache(maxsize=1000)

def performance_tracker(func):
    """Decorator for tracking function performance metrics."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = datetime.utcnow()
        try:
            result = await func(*args, **kwargs)
            execution_time = (datetime.utcnow() - start_time).total_seconds()
            logger.info(f"Cleaning operation completed in {execution_time:.2f} seconds")
            return result
        except Exception as e:
            execution_time = (datetime.utcnow() - start_time).total_seconds()
            logger.error(f"Cleaning operation failed after {execution_time:.2f} seconds: {str(e)}")
            raise
    return wrapper

class DataCleaner:
    """
    Enhanced data cleaning implementation with error tracking and performance optimization.
    Handles HTML stripping, text normalization, and data sanitization.
    """

    def __init__(self, cleaning_config: Dict[str, Any]):
        """
        Initialize cleaner with configuration and performance optimizations.

        Args:
            cleaning_config: Dictionary containing cleaning rules and configurations
        """
        self._cleaning_rules: Dict[str, callable] = {}
        self._field_encodings: Dict[str, str] = cleaning_config.get('field_encodings', {})
        self._error_counts: Dict[str, int] = {}
        self._pattern_cache = CLEANING_PATTERNS_CACHE

        # Initialize default cleaning rules
        self._cleaning_rules.update({
            'strip_html': self._strip_html,
            'normalize_whitespace': self._normalize_whitespace,
            'sanitize_text': self._sanitize_text,
            'clean_numbers': self._clean_numbers
        })

        logger.info("DataCleaner initialized with configuration")

    async def _strip_html(self, text: str) -> str:
        """Remove HTML tags while preserving essential formatting."""
        if not text:
            return text

        # Use cached pattern if available
        cache_key = f"html_{hash(text)}"
        if cache_key in self._pattern_cache:
            return self._pattern_cache[cache_key]

        try:
            # Use BeautifulSoup for robust HTML parsing
            soup = BeautifulSoup(text, 'html.parser')
            cleaned_text = soup.get_text(separator=' ')
            
            # Cache the result
            self._pattern_cache[cache_key] = cleaned_text
            return cleaned_text
        except Exception as e:
            logger.warning(f"HTML stripping failed, falling back to regex: {str(e)}")
            # Fallback to regex-based cleaning
            cleaned_text = HTML_TAGS_PATTERN.sub('', text)
            return cleaned_text.strip()

    async def _normalize_whitespace(self, text: str) -> str:
        """Normalize whitespace and remove control characters."""
        if not text:
            return text

        cache_key = f"whitespace_{hash(text)}"
        if cache_key in self._pattern_cache:
            return self._pattern_cache[cache_key]

        # Replace multiple whitespace with single space
        normalized = ' '.join(text.split())
        # Remove control characters
        normalized = ''.join(char for char in normalized if ord(char) >= 32 or char == '\n')
        
        self._pattern_cache[cache_key] = normalized
        return normalized

    async def _sanitize_text(self, text: str) -> str:
        """Sanitize text content with enhanced security measures."""
        if not text:
            return text

        # Use utility function for HTML sanitization
        sanitized = sanitize_html(text)
        # Additional text sanitization
        sanitized = html.unescape(sanitized)  # Handle HTML entities
        return sanitized.strip()

    async def _clean_numbers(self, text: str) -> str:
        """Clean and normalize numeric values."""
        if not text:
            return text

        try:
            # Remove currency symbols and normalize decimal separators
            cleaned = re.sub(r'[^\d.,\-]', '', text)
            # Normalize decimal separator
            cleaned = cleaned.replace(',', '.')
            return cleaned
        except Exception as e:
            logger.error(f"Number cleaning failed: {str(e)}")
            return text

    @performance_tracker
    async def clean(self, data: ScrapedData) -> ScrapedData:
        """
        Clean scraped data with comprehensive error handling and validation.

        Args:
            data: ScrapedData object containing raw scraped content

        Returns:
            ScrapedData: Cleaned data object with validation results
        """
        try:
            # Initialize error tracking
            self._error_counts.clear()
            start_time = datetime.utcnow()

            # Convert to DataFrame for efficient processing
            df = pd.DataFrame([data.raw_data])
            cleaned_data = {}

            # Process each field with appropriate cleaning rules
            for field, value in data.raw_data.items():
                try:
                    cleaned_value = value

                    # Apply text cleaning for string values
                    if isinstance(value, str):
                        # Strip HTML
                        cleaned_value = await self._strip_html(cleaned_value)
                        # Normalize whitespace
                        cleaned_value = await self._normalize_whitespace(cleaned_value)
                        # Sanitize text
                        cleaned_value = await self._sanitize_text(cleaned_value)

                        # Apply field-specific encoding if configured
                        if field in self._field_encodings:
                            cleaned_value = cleaned_value.encode(
                                self._field_encodings[field], 
                                errors='ignore'
                            ).decode(self._field_encodings[field])

                    # Apply numeric cleaning for numeric fields
                    elif isinstance(value, (int, float)) or (
                        isinstance(value, str) and re.match(r'^[\d.,\-]+$', value)
                    ):
                        cleaned_value = await self._clean_numbers(str(value))

                    cleaned_data[field] = cleaned_value

                except Exception as e:
                    logger.error(f"Field cleaning failed for {field}: {str(e)}")
                    self._error_counts[field] = self._error_counts.get(field, 0) + 1
                    cleaned_data[field] = value  # Preserve original value on error

            # Update ScrapedData object
            data.transformed_data = cleaned_data
            data.validation_results = {
                "cleaning_duration": (datetime.utcnow() - start_time).total_seconds(),
                "error_counts": self._error_counts,
                "fields_processed": len(cleaned_data),
                "success_rate": 1 - (sum(self._error_counts.values()) / len(cleaned_data))
            }

            # Update transformation history
            data.transformation_history.append({
                "timestamp": datetime.utcnow().isoformat(),
                "operation": "data_cleaning",
                "metrics": data.validation_results
            })

            logger.info(f"Data cleaning completed with {len(self._error_counts)} errors")
            return data

        except Exception as e:
            logger.error(f"Data cleaning failed: {str(e)}")
            # Update error context
            data.error_context = {
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
                "operation": "data_cleaning"
            }
            raise

    def add_cleaning_rule(self, field_name: str, cleaning_func: callable) -> bool:
        """
        Add custom cleaning rule for specific field.

        Args:
            field_name: Name of the field to apply rule to
            cleaning_func: Cleaning function to apply

        Returns:
            bool: Success status of rule addition
        """
        try:
            # Validate function signature
            if not callable(cleaning_func):
                raise ValueError("Cleaning rule must be callable")

            # Add rule to cleaning rules
            self._cleaning_rules[field_name] = cleaning_func
            logger.info(f"Added cleaning rule for field: {field_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to add cleaning rule for {field_name}: {str(e)}")
            return False

# Export DataCleaner class
__all__ = ['DataCleaner']