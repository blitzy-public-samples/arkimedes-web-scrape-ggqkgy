"""
XML data extractor implementation for parsing and extracting structured data from XML sources.
Provides enhanced validation, performance optimization, and security controls.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from xml.etree import ElementTree
from typing import Dict, Any, Optional, List, Union
import asyncio
from functools import lru_cache

# Internal imports
from scraper.extractors.base import BaseExtractor
from utils.validation import validate_extraction_rules

# XML namespace definitions for common formats
XML_NAMESPACES = {
    'atom': 'http://www.w3.org/2005/Atom',
    'rss': 'http://purl.org/rss/1.0/',
    'dc': 'http://purl.org/dc/elements/1.1/',
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'media': 'http://search.yahoo.com/mrss/'
}

# Configuration constants
DEFAULT_ENCODING = 'utf-8'
MAX_XML_SIZE = 10_000_000  # 10MB limit for XML content
XPATH_CACHE_SIZE = 1000    # LRU cache size for XPath queries

class XMLExtractor(BaseExtractor):
    """
    Enhanced XML data extractor with performance optimization, security controls,
    and improved validation capabilities.
    """

    def __init__(self, config: Dict[str, Any]) -> None:
        """
        Initialize XML extractor with enhanced configuration.

        Args:
            config: Configuration dictionary containing XML-specific settings

        Raises:
            ValidationError: If configuration is invalid
        """
        super().__init__(config)
        
        # Initialize XML-specific configurations
        self._namespaces = {**XML_NAMESPACES, **config.get('namespaces', {})}
        self._encoding = config.get('encoding', DEFAULT_ENCODING)
        self._max_size = config.get('max_xml_size', MAX_XML_SIZE)
        self._timeout = config.get('parse_timeout', 30.0)
        self._root = None
        self._cache = {}

        # Validate extraction rules
        if not validate_extraction_rules(config.get('extraction_rules', {})):
            raise ValueError("Invalid extraction rules configuration")

    async def extract(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Extract data from XML source with enhanced validation and performance monitoring.

        Args:
            url: Target URL for XML content
            params: Optional parameters for the request

        Returns:
            Dict containing extracted and validated data

        Raises:
            ValidationError: On validation failures
            XMLParseError: On XML parsing errors
            TimeoutError: On operation timeout
        """
        try:
            # Fetch XML content with timeout control
            content = await self.fetch(url, params)
            
            # Validate content size
            if len(content) > self._max_size:
                raise ValueError(f"XML content exceeds size limit of {self._max_size} bytes")

            # Parse XML with security controls
            self._root = await self.parse_xml(content)

            # Extract data using configured rules
            result = {}
            for field, rule in self._config.get('extraction_rules', {}).items():
                xpath = rule.get('xpath')
                if xpath:
                    # Apply cached XPath query
                    elements = await self.apply_xpath(
                        self._root,
                        xpath,
                        {'namespaces': self._namespaces}
                    )
                    
                    # Transform results based on rule type
                    if rule.get('type') == 'single':
                        result[field] = elements[0] if elements else None
                    elif rule.get('type') == 'list':
                        result[field] = elements
                    else:
                        result[field] = elements

            # Validate extracted data
            is_valid, errors = await self.validate(result)
            if not is_valid:
                raise ValueError(f"Validation failed: {errors}")

            return {
                'data': result,
                'metadata': {
                    'source_url': url,
                    'timestamp': self._get_timestamp(),
                    'encoding': self._encoding
                }
            }

        except Exception as e:
            self._logger.error(
                "XML extraction failed for URL %s: %s",
                url,
                str(e),
                exc_info=True
            )
            raise

    async def parse_xml(
        self,
        content: str,
        options: Optional[Dict[str, Any]] = None
    ) -> ElementTree.Element:
        """
        Parse XML content with security controls and validation.

        Args:
            content: XML content string
            options: Optional parsing options

        Returns:
            ElementTree.Element: Parsed XML root element

        Raises:
            XMLParseError: On parsing failures
            ValidationError: On content validation failures
        """
        try:
            # Configure parser with security settings
            parser = ElementTree.XMLParser(
                encoding=self._encoding,
                forbid_dtd=True,  # Prevent XXE attacks
                forbid_entities=True,  # Prevent entity expansion attacks
                forbid_external=True  # Prevent external entity references
            )

            # Parse with timeout control
            async with asyncio.timeout(self._timeout):
                root = ElementTree.fromstring(content, parser=parser)

            # Register namespaces
            for prefix, uri in self._namespaces.items():
                ElementTree.register_namespace(prefix, uri)

            return root

        except asyncio.TimeoutError:
            raise TimeoutError("XML parsing timeout exceeded")
        except ElementTree.ParseError as e:
            raise ValueError(f"XML parsing failed: {str(e)}")
        except Exception as e:
            raise ValueError(f"XML processing error: {str(e)}")

    @lru_cache(maxsize=XPATH_CACHE_SIZE)
    async def apply_xpath(
        self,
        element: ElementTree.Element,
        xpath: str,
        options: Optional[Dict[str, Any]] = None
    ) -> List[Any]:
        """
        Apply XPath query with caching and validation.

        Args:
            element: XML element to query
            xpath: XPath expression
            options: Optional query options

        Returns:
            List of query results

        Raises:
            ValueError: On invalid XPath expression
        """
        try:
            # Validate XPath expression
            if not xpath or not isinstance(xpath, str):
                raise ValueError("Invalid XPath expression")

            # Apply namespaces if provided in options
            namespaces = options.get('namespaces', {}) if options else {}
            
            # Execute XPath query
            results = element.findall(xpath, namespaces=namespaces)
            
            # Transform results to basic types
            transformed = []
            for result in results:
                if isinstance(result, ElementTree.Element):
                    # Extract text content or attributes based on element type
                    if len(result) == 0:
                        transformed.append(result.text)
                    else:
                        transformed.append({
                            child.tag: child.text
                            for child in result
                            if child.text
                        })
                else:
                    transformed.append(result)

            return transformed

        except Exception as e:
            self._logger.error(
                "XPath query failed: %s for expression: %s",
                str(e),
                xpath,
                exc_info=True
            )
            raise ValueError(f"XPath query failed: {str(e)}")

    def _get_timestamp(self) -> str:
        """Get current timestamp in ISO format."""
        from datetime import datetime
        return datetime.utcnow().isoformat()