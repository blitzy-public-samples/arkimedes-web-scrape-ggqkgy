"""
Scraper configuration module implementing comprehensive settings management for the web scraping engine.
Provides secure, validated, and optimized configuration for browser settings, performance tuning,
and security controls.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from functools import cache, lru_cache
from typing import Dict, List, Optional, Any

# Third-party imports with versions
from pydantic_settings import BaseSettings  # v2.0.0
from pydantic import Field  # v2.0.0

# Internal imports
from ...api.core.config import settings
from ...utils.validation import validate_url
from ...utils.encryption import EncryptedField

# Default configuration constants
DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
DEFAULT_VIEWPORT = {'width': 1920, 'height': 1080}
DEFAULT_TIMEOUT_MS = 30000
MAX_RETRIES = 3
RETRY_DELAY_MS = 1000
RESOURCE_EXCLUSIONS = ['image', 'stylesheet', 'font', 'media']
DEFAULT_MEMORY_LIMIT = 4096
PROXY_ROTATION_INTERVAL = 300

class ScraperSettings(BaseSettings):
    """
    Comprehensive scraper settings with validation, security controls, and performance optimizations.
    Implements secure defaults and extensive configuration validation.
    """
    
    # Browser Configuration
    user_agent: str = Field(
        default=DEFAULT_USER_AGENT,
        description="Browser user agent string"
    )
    viewport: Dict[str, int] = Field(
        default=DEFAULT_VIEWPORT,
        description="Browser viewport dimensions"
    )
    timeout_ms: int = Field(
        default=DEFAULT_TIMEOUT_MS,
        description="Request timeout in milliseconds",
        ge=1000,
        le=60000
    )
    max_retries: int = Field(
        default=MAX_RETRIES,
        description="Maximum retry attempts for failed requests",
        ge=0,
        le=10
    )
    retry_delay_ms: int = Field(
        default=RETRY_DELAY_MS,
        description="Delay between retry attempts in milliseconds",
        ge=100,
        le=10000
    )
    
    # Resource Management
    max_concurrent_browsers: int = Field(
        default=settings.MAX_CONCURRENT_TASKS,
        description="Maximum concurrent browser instances",
        ge=1,
        le=1000
    )
    max_pages_per_browser: int = Field(
        default=10,
        description="Maximum pages per browser instance",
        ge=1,
        le=50
    )
    javascript_enabled: bool = Field(
        default=True,
        description="Enable JavaScript execution"
    )
    
    # Proxy Configuration
    proxy_list: List[str] = Field(
        default=[],
        description="List of proxy servers"
    )
    request_headers: Dict[str, str] = Field(
        default={},
        description="Additional HTTP headers"
    )
    resource_exclusions: List[str] = Field(
        default=RESOURCE_EXCLUSIONS,
        description="Resources to block"
    )
    
    # Performance Settings
    memory_limit_mb: int = Field(
        default=DEFAULT_MEMORY_LIMIT,
        description="Browser memory limit in MB",
        ge=512,
        le=8192
    )
    proxy_rotation_interval: int = Field(
        default=PROXY_ROTATION_INTERVAL,
        description="Proxy rotation interval in seconds",
        ge=60,
        le=3600
    )
    
    # Advanced Configuration
    performance_settings: Dict[str, Any] = Field(
        default={
            "network_idle_timeout": 1000,
            "cpu_throttling_rate": 4,
            "offline": False,
            "download_throughput": -1
        },
        description="Performance tuning parameters"
    )
    
    security_settings: Dict[str, Any] = Field(
        default={
            "block_third_party_cookies": True,
            "disable_web_security": False,
            "ignore_https_errors": False,
            "bypass_csp": False
        },
        description="Security control parameters"
    )
    
    monitoring_settings: Dict[str, Any] = Field(
        default={
            "enable_metrics": True,
            "log_network_activity": True,
            "capture_console": True,
            "record_har": False
        },
        description="Monitoring configuration"
    )

    class Config:
        """Pydantic model configuration"""
        env_prefix = "SCRAPER_"
        validate_assignment = True
        extra = "forbid"
        
    def __init__(self, custom_settings: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize scraper settings with comprehensive validation and security checks.
        
        Args:
            custom_settings: Optional custom configuration overrides
        """
        settings_dict = custom_settings or {}
        super().__init__(**settings_dict)
        
        # Validate proxy configuration
        self._validate_proxy_list()
        
        # Validate security settings
        self._validate_security_settings()
        
        # Initialize performance monitoring
        self._setup_monitoring()

    def _validate_proxy_list(self) -> None:
        """Validates proxy server configurations"""
        for proxy in self.proxy_list:
            is_valid, error = validate_url(proxy)
            if not is_valid:
                raise ValueError(f"Invalid proxy URL: {error.message}")

    def _validate_security_settings(self) -> None:
        """Validates security configuration"""
        if self.security_settings.get("disable_web_security"):
            raise ValueError("Disabling web security is not allowed in production")
            
        if self.security_settings.get("bypass_csp"):
            raise ValueError("Bypassing Content Security Policy is not allowed")

    def _setup_monitoring(self) -> None:
        """Initializes performance monitoring configuration"""
        if not self.monitoring_settings.get("enable_metrics", True):
            self.monitoring_settings["log_network_activity"] = False
            self.monitoring_settings["capture_console"] = False

    def get_browser_context_options(self) -> Dict[str, Any]:
        """
        Returns optimized browser context configuration with security and performance settings.
        
        Returns:
            Dict containing comprehensive browser context options
        """
        return {
            "userAgent": self.user_agent,
            "viewport": self.viewport,
            "ignoreHTTPSErrors": self.security_settings["ignore_https_errors"],
            "bypassCSP": False,  # Enforced false for security
            "javaScriptEnabled": self.javascript_enabled,
            "hasTouch": False,
            "locale": "en-US",
            "timezoneId": "UTC",
            "deviceScaleFactor": 1,
            "offline": self.performance_settings["offline"],
            "permissions": [],
            "extraHTTPHeaders": self.request_headers,
            "proxy": self.proxy_list[0] if self.proxy_list else None,
            "recordHar": self.monitoring_settings["record_har"],
            "recordVideo": None,  # Disabled for performance
        }

    def get_page_options(self) -> Dict[str, Any]:
        """
        Returns page-specific configuration with resource and security optimizations.
        
        Returns:
            Dict containing optimized page options
        """
        return {
            "timeout": self.timeout_ms,
            "waitUntil": "networkidle",
            "maxTimeout": self.timeout_ms * 2,
            "retryCount": self.max_retries,
            "retryDelay": self.retry_delay_ms,
            "blockResources": self.resource_exclusions,
            "memoryLimit": self.memory_limit_mb,
            "monitoring": {
                "networkActivity": self.monitoring_settings["log_network_activity"],
                "console": self.monitoring_settings["capture_console"]
            }
        }

    def validate_configuration(self) -> bool:
        """
        Validates entire configuration against security and performance requirements.
        
        Returns:
            bool indicating validation success
        """
        try:
            # Validate proxy configuration
            self._validate_proxy_list()
            
            # Validate security settings
            self._validate_security_settings()
            
            # Validate performance settings
            if self.memory_limit_mb > 8192:
                raise ValueError("Memory limit exceeds maximum allowed value")
                
            if self.max_concurrent_browsers > settings.MAX_CONCURRENT_TASKS:
                raise ValueError("Concurrent browser limit exceeds system maximum")
            
            return True
            
        except Exception:
            return False

@lru_cache(maxsize=1)
def get_scraper_settings() -> ScraperSettings:
    """
    Returns cached singleton instance of scraper settings with validation.
    
    Returns:
        ScraperSettings: Validated scraper settings instance
    """
    return ScraperSettings()

# Export scraper settings instance
scraper_settings = get_scraper_settings()

# Export public interface
__all__ = [
    "scraper_settings",
    "get_scraper_settings",
    "ScraperSettings"
]