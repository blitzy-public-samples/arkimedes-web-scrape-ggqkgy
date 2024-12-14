"""
Package initializer for the extractors module providing a unified interface to different data extraction implementations.
Implements thread-safe factory pattern with caching and validation for HTML, JSON, and XML extractors.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from typing import Dict, Any, Optional, Type, Callable
from threading import Lock
from functools import wraps
import logging

# Third-party imports with versions
from cachetools import LRUCache  # ^5.3.0

# Internal imports
from scraper.extractors.base import BaseExtractor
from scraper.extractors.html import HTMLExtractor
from scraper.extractors.json import JSONExtractor
from scraper.extractors.xml import XMLExtractor

# Configure logging
logger = logging.getLogger(__name__)

# Content type to extractor class mapping
CONTENT_TYPE_MAPPING = {
    'text/html': HTMLExtractor,
    'application/json': JSONExtractor,
    'application/ld+json': JSONExtractor,
    'application/xml': XMLExtractor,
    'text/xml': XMLExtractor
}

# Default extractor for unknown content types
DEFAULT_EXTRACTOR = HTMLExtractor

# Thread synchronization for content type mapping access
_mapping_lock = Lock()

# LRU cache for extractor instances
_extractor_cache = LRUCache(maxsize=100)

def validate_config(config: Dict[str, Any], extractor_type: str) -> bool:
    """
    Validates extractor configuration against schema.

    Args:
        config: Configuration dictionary to validate
        extractor_type: Type of extractor for schema selection

    Returns:
        bool: True if valid, raises ValidationError otherwise

    Raises:
        ValidationError: If configuration is invalid
    """
    try:
        # Basic configuration validation
        if not isinstance(config, dict):
            raise ValueError("Configuration must be a dictionary")

        # Required fields validation
        required_fields = {'selectors', 'schema_version'}
        missing_fields = required_fields - set(config.keys())
        if missing_fields:
            raise ValueError(f"Missing required configuration fields: {missing_fields}")

        # Validate schema version
        if not isinstance(config.get('schema_version'), str):
            raise ValueError("Schema version must be a string")

        # Validate selectors based on extractor type
        selectors = config.get('selectors', {})
        if extractor_type == 'HTMLExtractor':
            if not all(isinstance(s, dict) and 'type' in s and 'value' in s 
                      for s in selectors.values()):
                raise ValueError("Invalid HTML selector configuration")
        elif extractor_type == 'JSONExtractor':
            if not all(isinstance(s, str) for s in selectors.values()):
                raise ValueError("Invalid JSON selector configuration")
        elif extractor_type == 'XMLExtractor':
            if not all(isinstance(s, dict) and 'xpath' in s for s in selectors.values()):
                raise ValueError("Invalid XML selector configuration")

        logger.debug(
            "Configuration validation passed for %s",
            extractor_type
        )
        return True

    except Exception as e:
        logger.error(
            "Configuration validation failed: %s",
            str(e),
            exc_info=True
        )
        raise

def get_extractor(
    content_type: str,
    config: Dict[str, Any],
    validator: Optional[Callable[[Dict[str, Any]], bool]] = None
) -> BaseExtractor:
    """
    Thread-safe factory function that returns appropriate extractor instance
    based on content type with caching and validation.

    Args:
        content_type: Content type string
        config: Configuration dictionary
        validator: Optional custom validator function

    Returns:
        BaseExtractor: Configured and validated extractor instance

    Raises:
        ValueError: If configuration is invalid
        RuntimeError: If extractor instantiation fails
    """
    try:
        # Normalize content type
        content_type = content_type.lower().strip()

        # Check cache first
        cache_key = f"{content_type}:{hash(str(config))}"
        if cache_key in _extractor_cache:
            logger.debug("Cache hit for extractor: %s", content_type)
            return _extractor_cache[cache_key]

        # Thread-safe access to content type mapping
        with _mapping_lock:
            extractor_class = CONTENT_TYPE_MAPPING.get(content_type, DEFAULT_EXTRACTOR)

        # Validate configuration
        if validator:
            if not validator(config):
                raise ValueError("Custom validation failed for configuration")
        else:
            validate_config(config, extractor_class.__name__)

        # Instantiate extractor
        extractor = extractor_class(config)

        # Cache the instance
        _extractor_cache[cache_key] = extractor

        logger.info(
            "Created new extractor instance for content type: %s",
            content_type
        )
        return extractor

    except Exception as e:
        logger.error(
            "Failed to get extractor for content type %s: %s",
            content_type,
            str(e),
            exc_info=True
        )
        raise

# Export public components
__all__ = [
    'BaseExtractor',
    'HTMLExtractor',
    'JSONExtractor', 
    'XMLExtractor',
    'get_extractor',
    'validate_config'
]