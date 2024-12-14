"""
Core validation utilities for data validation, schema verification, and input sanitization.
Provides comprehensive validation capabilities with enhanced security features.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import re
import json
import html
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any
from functools import wraps

# Third-party imports with versions
from validators import URLValidator  # v0.20.0
from cachetools import TTLCache, cached  # v5.3.0

# Global constants for validation rules
URL_PATTERN = re.compile(
    r'^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$'
)
MAX_URL_LENGTH = 2048
MAX_FIELD_LENGTH = 1024
ALLOWED_HTML_TAGS = ["p", "br", "b", "i", "u", "span", "div", "a", "ul", "li", "ol"]
ALLOWED_HTML_ATTRIBUTES = {
    "a": ["href", "title"],
    "span": ["class"],
    "div": ["class"]
}

# Cache configuration
VALIDATION_CACHE_SIZE = 1000
VALIDATION_CACHE_TTL = 3600  # 1 hour
validation_cache = TTLCache(maxsize=VALIDATION_CACHE_SIZE, ttl=VALIDATION_CACHE_TTL)

class ValidationError(Exception):
    """
    Enhanced custom exception class for validation errors with detailed error categorization.
    Provides comprehensive error context and formatting capabilities.
    """
    
    def __init__(self, message: str, error_type: str, error_code: str, context: Dict[str, Any]) -> None:
        """
        Initialize validation error with enhanced context.
        
        Args:
            message: Detailed error message
            error_type: Category of the error
            error_code: Unique error identifier
            context: Additional error context
        """
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.error_code = error_code
        self.context = context
        self.timestamp = datetime.utcnow().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert error to dictionary format for API responses and logging.
        
        Returns:
            Dict containing formatted error details
        """
        return {
            "error": {
                "message": self.message,
                "type": self.error_type,
                "code": self.error_code,
                "context": self.context,
                "timestamp": self.timestamp
            }
        }

class DataValidator:
    """
    Enhanced class for validating scraped data structure and content with caching.
    Implements comprehensive validation rules with version control.
    """
    
    def __init__(self, schema: Dict[str, Any], schema_version: str) -> None:
        """
        Initialize validator with schema and caching.
        
        Args:
            schema: Validation schema definition
            schema_version: Schema version identifier
        """
        self._schema = schema
        self._schema_version = schema_version
        self._errors: List[ValidationError] = []
        self._cache = TTLCache(maxsize=VALIDATION_CACHE_SIZE, ttl=VALIDATION_CACHE_TTL)
        
    def validate(self, data: Dict[str, Any]) -> bool:
        """
        Validates data against stored schema with caching.
        
        Args:
            data: Data dictionary to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        cache_key = hash(f"{json.dumps(data, sort_keys=True)}:{self._schema_version}")
        
        if cache_key in self._cache:
            return self._cache[cache_key]
            
        self._errors.clear()
        
        try:
            # Validate schema version
            if data.get("_schema_version") != self._schema_version:
                self._errors.append(ValidationError(
                    message="Schema version mismatch",
                    error_type="VERSION_ERROR",
                    error_code="VAL001",
                    context={
                        "expected": self._schema_version,
                        "received": data.get("_schema_version")
                    }
                ))
                return False
                
            # Validate data structure
            for field, constraints in self._schema.items():
                if constraints.get("required", False) and field not in data:
                    self._errors.append(ValidationError(
                        message=f"Missing required field: {field}",
                        error_type="FIELD_ERROR",
                        error_code="VAL002",
                        context={"field": field}
                    ))
                    continue
                    
                if field in data:
                    field_value = data[field]
                    field_type = constraints.get("type")
                    
                    # Type validation
                    if not isinstance(field_value, eval(field_type)):
                        self._errors.append(ValidationError(
                            message=f"Invalid type for field: {field}",
                            error_type="TYPE_ERROR",
                            error_code="VAL003",
                            context={
                                "field": field,
                                "expected": field_type,
                                "received": type(field_value).__name__
                            }
                        ))
                        
                    # Length validation
                    if "max_length" in constraints:
                        if len(str(field_value)) > constraints["max_length"]:
                            self._errors.append(ValidationError(
                                message=f"Field exceeds maximum length: {field}",
                                error_type="LENGTH_ERROR",
                                error_code="VAL004",
                                context={
                                    "field": field,
                                    "max_length": constraints["max_length"],
                                    "actual_length": len(str(field_value))
                                }
                            ))
            
            is_valid = len(self._errors) == 0
            self._cache[cache_key] = is_valid
            return is_valid
            
        except Exception as e:
            self._errors.append(ValidationError(
                message="Validation process error",
                error_type="SYSTEM_ERROR",
                error_code="VAL999",
                context={"original_error": str(e)}
            ))
            return False
    
    def get_errors(self) -> List[ValidationError]:
        """
        Returns detailed list of validation errors.
        
        Returns:
            List of ValidationError objects
        """
        return self._errors

@cached(cache=validation_cache)
def validate_url(url: str) -> Tuple[bool, Optional[ValidationError]]:
    """
    Enhanced URL validation with security checks.
    
    Args:
        url: URL string to validate
        
    Returns:
        Tuple of (is_valid, error_details)
    """
    try:
        # Length check
        if len(url) > MAX_URL_LENGTH:
            return False, ValidationError(
                message="URL exceeds maximum length",
                error_type="URL_ERROR",
                error_code="URL001",
                context={"max_length": MAX_URL_LENGTH, "actual_length": len(url)}
            )
        
        # Format validation
        if not URL_PATTERN.match(url):
            return False, ValidationError(
                message="Invalid URL format",
                error_type="URL_ERROR",
                error_code="URL002",
                context={"url": url}
            )
        
        # Additional security checks
        url_validator = URLValidator()
        if not url_validator(url):
            return False, ValidationError(
                message="URL validation failed",
                error_type="URL_ERROR",
                error_code="URL003",
                context={"url": url}
            )
        
        return True, None
        
    except Exception as e:
        return False, ValidationError(
            message="URL validation error",
            error_type="SYSTEM_ERROR",
            error_code="URL999",
            context={"original_error": str(e)}
        )

@cached(cache=validation_cache)
def validate_json_schema(data: Dict[str, Any], schema: Dict[str, Any], 
                        schema_version: str) -> Tuple[bool, Optional[ValidationError]]:
    """
    Enhanced JSON schema validation with version control.
    
    Args:
        data: JSON data to validate
        schema: Schema definition
        schema_version: Expected schema version
        
    Returns:
        Tuple of (is_valid, error_details)
    """
    validator = DataValidator(schema, schema_version)
    is_valid = validator.validate(data)
    return is_valid, validator.get_errors()[0] if not is_valid else None

@cached(cache=validation_cache)
def sanitize_html(content: str) -> str:
    """
    Advanced HTML content sanitization with tag and attribute whitelisting.
    
    Args:
        content: HTML content to sanitize
        
    Returns:
        Sanitized HTML content
    """
    try:
        # Escape special characters
        escaped_content = html.escape(content)
        
        # Remove disallowed tags
        for tag in re.findall(r'<[^>]+>', escaped_content):
            tag_name = tag[1:].split()[0].rstrip('>').lower()
            if tag_name not in ALLOWED_HTML_TAGS:
                escaped_content = escaped_content.replace(tag, '')
        
        # Clean attributes
        for tag, allowed_attrs in ALLOWED_HTML_ATTRIBUTES.items():
            pattern = f'<{tag}[^>]*>'
            for tag_match in re.finditer(pattern, escaped_content):
                tag_html = tag_match.group(0)
                clean_attrs = []
                
                for attr in re.finditer(r'(\w+)=["\'](.*?)["\']', tag_html):
                    attr_name, attr_value = attr.groups()
                    if attr_name in allowed_attrs:
                        clean_attrs.append(f'{attr_name}="{html.escape(attr_value)}"')
                
                new_tag = f'<{tag} {" ".join(clean_attrs)}>' if clean_attrs else f'<{tag}>'
                escaped_content = escaped_content.replace(tag_html, new_tag)
        
        return escaped_content
        
    except Exception as e:
        # Return fully escaped content on error
        return html.escape(content)

# Export all public components
__all__ = [
    'ValidationError',
    'DataValidator',
    'validate_url',
    'validate_json_schema',
    'sanitize_html'
]