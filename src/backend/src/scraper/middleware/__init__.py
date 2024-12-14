"""
Initializes the scraper middleware package and exports core middleware components for proxy management,
authentication, and rate limiting functionality. Provides a centralized point for middleware 
configuration and integration with the scraping engine.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from typing import Dict, Any

# Internal imports - middleware components
from .proxy import ProxyMiddleware
from .auth import AuthenticationMiddleware
from .rate_limit import RateLimitMiddleware

# Version information
__version__ = "1.0.0"

# Export core middleware components
__all__ = [
    "ProxyMiddleware",
    "AuthenticationMiddleware", 
    "RateLimitMiddleware"
]

# Middleware configuration defaults
DEFAULT_MIDDLEWARE_CONFIG = {
    "proxy": {
        "retry_attempts": 3,
        "retry_delay": 1.0,
        "max_delay": 5.0,
        "cache_ttl": 300,
        "health_check_interval": 60,
        "circuit_breaker_threshold": 5,
        "circuit_breaker_timeout": 30
    },
    "auth": {
        "token_ttl": 1800,  # 30 minutes
        "retry_attempts": 3,
        "circuit_breaker_threshold": 5,
        "recovery_timeout": 30
    },
    "rate_limit": {
        "default_rate": 1000,  # requests per minute
        "window_seconds": 60,
        "burst_multiplier": 0.05,
        "max_backoff": 300
    }
}

def configure_middleware(config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Configure middleware components with custom settings.
    
    Args:
        config: Optional custom middleware configuration
        
    Returns:
        Dict containing merged configuration settings
    """
    if not config:
        return DEFAULT_MIDDLEWARE_CONFIG.copy()
        
    merged_config = DEFAULT_MIDDLEWARE_CONFIG.copy()
    
    # Merge custom proxy settings
    if "proxy" in config:
        merged_config["proxy"].update(config["proxy"])
        
    # Merge custom auth settings    
    if "auth" in config:
        merged_config["auth"].update(config["auth"])
        
    # Merge custom rate limit settings
    if "rate_limit" in config:
        merged_config["rate_limit"].update(config["rate_limit"])
        
    return merged_config

def get_middleware_version() -> str:
    """
    Get the current middleware package version.
    
    Returns:
        str: Version string
    """
    return __version__

# Initialize default configuration
middleware_config = configure_middleware()