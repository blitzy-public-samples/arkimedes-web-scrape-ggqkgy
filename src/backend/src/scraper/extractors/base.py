"""
Base extractor module providing core functionality for web scraping operations.
Implements async support, sophisticated error handling, and performance monitoring.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from abc import ABC, abstractmethod
import asyncio
from typing import Dict, Any, Optional, List, Union, Callable
import logging

# Third-party imports with versions
import aiohttp  # ^3.8.0
from tenacity import (  # ^8.0.0
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential
)

# Internal imports
from utils.validation import DataValidator, ValidationError

# Global constants for configuration
DEFAULT_TIMEOUT = 30
DEFAULT_RETRIES = 3
DEFAULT_BACKOFF_FACTOR = 2.0
DEFAULT_HEADERS = {
    'User-Agent': 'WebScrapingPlatform/1.0',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive'
}

# Exceptions to retry on
RETRY_EXCEPTIONS = (aiohttp.ClientError, asyncio.TimeoutError, ConnectionError)

# Configure logging
logger = logging.getLogger(__name__)

class BaseExtractor(ABC):
    """
    Enhanced abstract base class for all data extractors providing common functionality,
    async support, and sophisticated error handling.
    """
    
    def __init__(
        self,
        config: Dict[str, Any],
        retry_config: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Initialize the base extractor with enhanced configuration and monitoring.

        Args:
            config: Configuration dictionary for the extractor
            retry_config: Optional retry configuration
            headers: Optional custom headers

        Raises:
            ValidationError: If configuration is invalid
        """
        self._config = config
        self._validator = DataValidator(
            schema=config.get('schema', {}),
            schema_version=config.get('schema_version', '1.0')
        )
        
        # Configure retry settings
        self._retry_config = {
            'max_attempts': retry_config.get('max_attempts', DEFAULT_RETRIES),
            'timeout': retry_config.get('timeout', DEFAULT_TIMEOUT),
            'backoff_factor': retry_config.get('backoff_factor', DEFAULT_BACKOFF_FACTOR)
        } if retry_config else {
            'max_attempts': DEFAULT_RETRIES,
            'timeout': DEFAULT_TIMEOUT,
            'backoff_factor': DEFAULT_BACKOFF_FACTOR
        }
        
        # Configure headers
        self._headers = {**DEFAULT_HEADERS, **(headers or {})}
        
        # Initialize session as None - will be created when needed
        self._session: Optional[aiohttp.ClientSession] = None
        
        logger.info(
            "Initialized BaseExtractor with config: %s",
            {k: v for k, v in config.items() if k != 'credentials'}
        )

    @abstractmethod
    async def extract(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Abstract method for extracting data with performance monitoring.
        Must be implemented by concrete extractor classes.

        Args:
            url: Target URL for extraction
            params: Optional parameters for the extraction
            context: Optional context information

        Returns:
            Dict containing extracted and validated data with metadata

        Raises:
            NotImplementedError: When not implemented by concrete class
        """
        raise NotImplementedError("Concrete extractors must implement extract method")

    @retry(
        retry=retry_if_exception_type(RETRY_EXCEPTIONS),
        stop=stop_after_attempt(DEFAULT_RETRIES),
        wait=wait_exponential(multiplier=DEFAULT_BACKOFF_FACTOR),
        before_sleep=lambda retry_state: logger.warning(
            "Retry attempt %d after error: %s",
            retry_state.attempt_number,
            retry_state.outcome.exception()
        )
    )
    async def fetch(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        retry_options: Optional[Dict[str, Any]] = None
    ) -> Union[str, bytes]:
        """
        Enhanced async content fetcher with sophisticated retry logic.

        Args:
            url: URL to fetch content from
            params: Optional request parameters
            retry_options: Optional custom retry configuration

        Returns:
            Raw content from URL

        Raises:
            aiohttp.ClientError: On network/HTTP errors
            ValidationError: On invalid URL or parameters
            TimeoutError: On request timeout
        """
        try:
            # Create session if not exists
            if self._session is None:
                timeout = aiohttp.ClientTimeout(
                    total=self._retry_config['timeout']
                )
                self._session = aiohttp.ClientSession(
                    headers=self._headers,
                    timeout=timeout
                )

            # Merge retry options
            current_retry_options = {
                **self._retry_config,
                **(retry_options or {})
            }

            async with self._session.get(
                url,
                params=params,
                timeout=current_retry_options['timeout']
            ) as response:
                response.raise_for_status()
                return await response.read()

        except Exception as e:
            logger.error(
                "Error fetching URL %s: %s",
                url,
                str(e),
                exc_info=True
            )
            raise

    async def validate(
        self,
        data: Dict[str, Any],
        schema_version: Optional[str] = None
    ) -> tuple[bool, List[str]]:
        """
        Enhanced data validation with detailed error reporting.

        Args:
            data: Data to validate
            schema_version: Optional schema version override

        Returns:
            Tuple of (is_valid, error_messages)
        """
        try:
            # Validate schema version if provided
            if schema_version and not self._validator.validate_schema_version(schema_version):
                return False, ["Schema version mismatch"]

            # Perform validation
            is_valid = self._validator.validate(data)
            errors = [str(error) for error in self._validator.get_errors()]
            
            if not is_valid:
                logger.warning(
                    "Validation failed for data: %s",
                    errors
                )
            
            return is_valid, errors

        except Exception as e:
            logger.error(
                "Validation error: %s",
                str(e),
                exc_info=True
            )
            return False, [f"Validation error: {str(e)}"]

    async def cleanup(self) -> None:
        """
        Enhanced resource cleanup with monitoring.
        Ensures proper release of system resources.
        """
        try:
            if self._session and not self._session.closed:
                await self._session.close()
                self._session = None
                logger.info("Successfully closed HTTP session")

        except Exception as e:
            logger.error(
                "Error during cleanup: %s",
                str(e),
                exc_info=True
            )
            raise

    async def __aenter__(self):
        """Support for async context manager."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Ensure cleanup on context exit."""
        await self.cleanup()