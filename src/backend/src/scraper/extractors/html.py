"""
HTML data extractor implementation providing specialized functionality for extracting structured data
from HTML content using CSS selectors and XPath expressions.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
from typing import Dict, Any, Optional, List, Union, Tuple
from functools import lru_cache
import logging

# Third-party imports with versions
from bs4 import BeautifulSoup  # ^4.12.0
from lxml import html, etree  # ^4.9.0
import chardet  # ^5.0.0

# Internal imports
from scraper.extractors.base import BaseExtractor
from utils.validation import sanitize_html, DataValidator, ValidationError

# Global constants
DEFAULT_PARSER = 'lxml'
DEFAULT_ENCODING = 'utf-8'
SUPPORTED_SELECTORS = ['css', 'xpath']
MAX_RETRIES = 3
CACHE_SIZE = 100
PAGINATION_LIMIT = 1000

# Configure logging
logger = logging.getLogger(__name__)

class HTMLExtractor(BaseExtractor):
    """
    Specialized extractor for HTML content implementing advanced HTML parsing and data extraction
    capabilities with enhanced error handling and performance optimization.
    """
    
    def __init__(self, config: Dict[str, Any]) -> None:
        """
        Initialize HTML extractor with configuration and setup caching.
        
        Args:
            config: Configuration dictionary containing extraction rules and settings
            
        Raises:
            ValidationError: If configuration is invalid
        """
        super().__init__(config)
        
        # Initialize properties
        self._soup: Optional[BeautifulSoup] = None
        self._selectors: Dict[str, Any] = config.get('selectors', {})
        self._parser = config.get('parser', DEFAULT_PARSER)
        self._encoding = config.get('encoding', DEFAULT_ENCODING)
        self._cache = lru_cache(maxsize=CACHE_SIZE)(lambda x: x)
        self._validator = DataValidator(
            schema=config.get('schema', {}),
            schema_version=config.get('schema_version', '1.0')
        )
        
        # Validate selector configuration
        self._validate_selectors()
        
        logger.info(
            "Initialized HTMLExtractor with parser: %s, encoding: %s",
            self._parser,
            self._encoding
        )

    def _validate_selectors(self) -> None:
        """
        Validate selector configurations for correctness.
        
        Raises:
            ValidationError: If selectors are invalid
        """
        for field, selector in self._selectors.items():
            if not isinstance(selector, dict):
                raise ValidationError(
                    message=f"Invalid selector configuration for field: {field}",
                    error_type="CONFIG_ERROR",
                    error_code="HTML001",
                    context={"field": field, "selector": selector}
                )
            
            selector_type = selector.get('type')
            if selector_type not in SUPPORTED_SELECTORS:
                raise ValidationError(
                    message=f"Unsupported selector type: {selector_type}",
                    error_type="CONFIG_ERROR",
                    error_code="HTML002",
                    context={"field": field, "type": selector_type}
                )

    @lru_cache(maxsize=CACHE_SIZE)
    async def parse_html(self, content: str) -> BeautifulSoup:
        """
        Parse HTML content into BeautifulSoup object with encoding detection.
        
        Args:
            content: Raw HTML content
            
        Returns:
            BeautifulSoup: Parsed HTML document
            
        Raises:
            ValidationError: If parsing fails
        """
        try:
            # Detect encoding if not specified
            if self._encoding == 'auto':
                detected = chardet.detect(content.encode())
                encoding = detected['encoding'] or DEFAULT_ENCODING
            else:
                encoding = self._encoding
            
            # Parse HTML content
            soup = BeautifulSoup(
                content,
                self._parser,
                from_encoding=encoding
            )
            
            # Basic validation of parsed document
            if not soup.find():
                raise ValidationError(
                    message="Empty or invalid HTML document",
                    error_type="PARSE_ERROR",
                    error_code="HTML003",
                    context={"encoding": encoding}
                )
            
            return soup
            
        except Exception as e:
            logger.error(
                "HTML parsing error: %s",
                str(e),
                exc_info=True
            )
            raise ValidationError(
                message="Failed to parse HTML content",
                error_type="PARSE_ERROR",
                error_code="HTML004",
                context={"original_error": str(e)}
            )

    async def apply_selectors(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """
        Apply configured selectors to extract data with enhanced validation.
        
        Args:
            soup: Parsed BeautifulSoup document
            
        Returns:
            Dict containing extracted data
            
        Raises:
            ValidationError: If selector application fails
        """
        result = {}
        
        try:
            for field, selector in self._selectors.items():
                selector_type = selector['type']
                selector_value = selector['value']
                
                # Select elements based on selector type
                if selector_type == 'css':
                    elements = soup.select(selector_value)
                else:  # xpath
                    # Convert to lxml etree for xpath
                    tree = html.fromstring(str(soup))
                    elements = tree.xpath(selector_value)
                
                # Extract data based on configuration
                if selector.get('multiple', False):
                    result[field] = [
                        self._extract_element_data(el, selector)
                        for el in elements
                    ]
                else:
                    result[field] = (
                        self._extract_element_data(elements[0], selector)
                        if elements else None
                    )
                
                # Apply transformations if configured
                if 'transform' in selector:
                    result[field] = self._apply_transformation(
                        result[field],
                        selector['transform']
                    )
            
            return result
            
        except Exception as e:
            logger.error(
                "Selector application error: %s",
                str(e),
                exc_info=True
            )
            raise ValidationError(
                message="Failed to apply selectors",
                error_type="SELECTOR_ERROR",
                error_code="HTML005",
                context={"original_error": str(e)}
            )

    def _extract_element_data(
        self,
        element: Union[BeautifulSoup, etree._Element],
        selector: Dict[str, Any]
    ) -> Any:
        """
        Extract data from a single element based on selector configuration.
        
        Args:
            element: HTML element to extract from
            selector: Selector configuration
            
        Returns:
            Extracted data
        """
        extract_type = selector.get('extract', 'text')
        
        if isinstance(element, etree._Element):
            if extract_type == 'text':
                return element.text_content().strip()
            elif extract_type == 'html':
                return sanitize_html(html.tostring(element).decode())
            else:  # attribute
                return element.get(extract_type)
        else:
            if extract_type == 'text':
                return element.get_text(strip=True)
            elif extract_type == 'html':
                return sanitize_html(str(element))
            else:  # attribute
                return element.get(extract_type)

    def _apply_transformation(
        self,
        value: Any,
        transform: Union[str, Dict[str, Any]]
    ) -> Any:
        """
        Apply configured transformation to extracted data.
        
        Args:
            value: Value to transform
            transform: Transformation configuration
            
        Returns:
            Transformed value
        """
        if isinstance(transform, str):
            if transform == 'strip':
                return value.strip() if value else value
            elif transform == 'lower':
                return value.lower() if value else value
            elif transform == 'upper':
                return value.upper() if value else value
        elif isinstance(transform, dict):
            if transform.get('type') == 'replace':
                return value.replace(
                    transform['old'],
                    transform['new']
                ) if value else value
            elif transform.get('type') == 'split':
                return value.split(transform['separator']) if value else value
        
        return value

    async def handle_pagination(
        self,
        url: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle paginated content extraction with rate limiting.
        
        Args:
            url: Base URL
            data: Current extracted data
            
        Returns:
            Combined data from all pages
        """
        if not self._config.get('pagination'):
            return data
            
        try:
            combined_data = {**data}
            page_count = 1
            
            while page_count < PAGINATION_LIMIT:
                # Extract next page URL
                next_page = await self._get_next_page_url(url, page_count)
                if not next_page:
                    break
                
                # Apply rate limiting
                await asyncio.sleep(
                    self._config.get('pagination_delay', 1.0)
                )
                
                # Fetch and process next page
                content = await self.fetch(next_page)
                soup = await self.parse_html(content)
                page_data = await self.apply_selectors(soup)
                
                # Combine data based on configuration
                self._combine_pagination_data(combined_data, page_data)
                
                page_count += 1
            
            return combined_data
            
        except Exception as e:
            logger.error(
                "Pagination handling error: %s",
                str(e),
                exc_info=True
            )
            raise ValidationError(
                message="Failed to handle pagination",
                error_type="PAGINATION_ERROR",
                error_code="HTML006",
                context={"original_error": str(e)}
            )

    async def _get_next_page_url(
        self,
        base_url: str,
        current_page: int
    ) -> Optional[str]:
        """
        Extract next page URL based on pagination configuration.
        
        Args:
            base_url: Current page URL
            current_page: Current page number
            
        Returns:
            Next page URL or None if no more pages
        """
        pagination_config = self._config['pagination']
        pattern = pagination_config.get('pattern')
        
        if pattern:
            return pattern.format(
                url=base_url,
                page=current_page + 1
            )
        
        return None

    def _combine_pagination_data(
        self,
        combined_data: Dict[str, Any],
        page_data: Dict[str, Any]
    ) -> None:
        """
        Combine data from multiple pages based on configuration.
        
        Args:
            combined_data: Existing combined data
            page_data: New page data
        """
        for field, value in page_data.items():
            if isinstance(value, list):
                combined_data.setdefault(field, []).extend(value)
            else:
                combined_data.setdefault(field, []).append(value)

    async def extract(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Extract data from HTML content using configured selectors with enhanced error handling.
        
        Args:
            url: Target URL for extraction
            params: Optional parameters for the extraction
            
        Returns:
            Dict containing extracted and validated data
            
        Raises:
            ValidationError: If extraction or validation fails
        """
        try:
            # Fetch content
            content = await self.fetch(url, params)
            
            # Parse HTML
            self._soup = await self.parse_html(content)
            
            # Extract data using selectors
            data = await self.apply_selectors(self._soup)
            
            # Handle pagination if configured
            if self._config.get('pagination'):
                data = await self.handle_pagination(url, data)
            
            # Validate extracted data
            is_valid, errors = await self.validate(data)
            if not is_valid:
                raise ValidationError(
                    message="Extracted data validation failed",
                    error_type="VALIDATION_ERROR",
                    error_code="HTML007",
                    context={"errors": errors}
                )
            
            return data
            
        except Exception as e:
            logger.error(
                "Data extraction error: %s",
                str(e),
                exc_info=True
            )
            raise ValidationError(
                message="Failed to extract data",
                error_type="EXTRACTION_ERROR",
                error_code="HTML008",
                context={"original_error": str(e)}
            )

# Export HTMLExtractor class
__all__ = ['HTMLExtractor']