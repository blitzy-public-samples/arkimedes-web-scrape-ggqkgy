"""
Browser automation module for web scraping operations.
Provides high-performance browser instance management and automation interfaces.

Version: 1.38.0 (Playwright)
"""

from typing import Dict, Any

# Internal imports with version tracking
from .playwright import PlaywrightBrowser  # Playwright v1.38.0
from .manager import BrowserManager  # Internal component

# Module version
__version__ = '1.0.0'

# Public interface
__all__ = ['PlaywrightBrowser', 'BrowserManager']

# Default browser configuration
DEFAULT_BROWSER_CONFIG: Dict[str, Any] = {
    'browser_type': 'chromium',
    'headless': True,
    'proxy': None,
    'args': [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions'
    ],
    'viewport': {
        'width': 1920,
        'height': 1080
    },
    'timeout': 30000,  # 30 seconds
    'navigation_timeout': 30000,
    'ignore_https_errors': True,
    'js_enabled': True,
    'block_resources': [
        'image',
        'media',
        'font',
        'other'
    ],
    'user_agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )
}

# Pool configuration
DEFAULT_POOL_CONFIG: Dict[str, Any] = {
    'pool_size': 10,  # Support for 100+ concurrent tasks through efficient pooling
    'acquire_timeout': 30.0,
    'cleanup_interval': 300,  # 5 minutes
    'enable_metrics': True
}

def create_browser_manager(
    browser_config: Dict[str, Any] = None,
    pool_config: Dict[str, Any] = None
) -> BrowserManager:
    """
    Factory function to create a configured BrowserManager instance.

    Args:
        browser_config: Custom browser configuration options
        pool_config: Custom pool configuration options

    Returns:
        Configured BrowserManager instance

    Example:
        >>> manager = create_browser_manager(
        ...     browser_config={'headless': False},
        ...     pool_config={'pool_size': 20}
        ... )
    """
    # Merge configurations with defaults
    final_browser_config = {**DEFAULT_BROWSER_CONFIG, **(browser_config or {})}
    final_pool_config = {**DEFAULT_POOL_CONFIG, **(pool_config or {})}

    # Combine configurations for manager
    manager_config = {
        **final_browser_config,
        **final_pool_config
    }

    return BrowserManager(manager_config)

# Module initialization
def initialize_module() -> None:
    """
    Perform module initialization tasks.
    Sets up logging and validates configurations.
    """
    from ...utils.logging import get_logger

    logger = get_logger(
        __name__,
        {
            'component': 'browser_module',
            'version': __version__
        }
    )

    logger.info(
        "Browser module initialized",
        extra={
            'browser_config': DEFAULT_BROWSER_CONFIG,
            'pool_config': DEFAULT_POOL_CONFIG
        }
    )

# Initialize module when imported
initialize_module()