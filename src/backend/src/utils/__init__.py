"""
Core utilities package for the Web Scraping Platform providing centralized access to logging, 
validation, encryption, retry, and concurrency utilities.

Version: 1.0.0
Author: Web Scraping Platform Team
Python Requires: >=3.11
Type Checked: True
"""

# Standard library imports
from typing import Dict, Any

# Internal imports with explicit members
from .logging import (  # v1.0.0
    setup_logging,
    get_logger,
    JSONFormatter,
    set_correlation_id,
    get_correlation_id
)

from .validation import (  # v1.0.0
    ValidationError,
    DataValidator,
    validate_url,
    validate_json_schema,
    sanitize_html
)

from .encryption import (  # v1.0.0
    generate_key,
    encrypt,
    decrypt,
    EncryptionError
)

from .retry import (  # v1.0.0
    retry,
    AsyncRetry,
    calculate_delay
)

from .concurrency import (  # v1.0.0
    ResourcePool,
    TaskPool
)

# Package metadata
__version__ = '1.0.0'
__author__ = 'Web Scraping Platform Team'

# Define public interface
__all__ = [
    # Logging utilities
    'setup_logging',
    'get_logger',
    'JSONFormatter',
    'set_correlation_id',
    'get_correlation_id',
    
    # Validation utilities
    'ValidationError',
    'DataValidator',
    'validate_url',
    'validate_json_schema',
    'sanitize_html',
    
    # Encryption utilities
    'generate_key',
    'encrypt',
    'decrypt',
    'EncryptionError',
    
    # Retry utilities
    'retry',
    'AsyncRetry',
    'calculate_delay',
    
    # Concurrency utilities
    'ResourcePool',
    'TaskPool'
]

# Initialize package-level logger
logger = get_logger(__name__)

def get_package_info() -> Dict[str, Any]:
    """
    Returns package metadata and version information.
    
    Returns:
        Dict containing package metadata
    """
    return {
        'name': 'utils',
        'version': __version__,
        'author': __author__,
        'python_requires': '>=3.11',
        'type_checked': True
    }

# Log package initialization
logger.info(
    "Utils package initialized",
    extra={
        'version': __version__,
        'python_requires': '>=3.11'
    }
)