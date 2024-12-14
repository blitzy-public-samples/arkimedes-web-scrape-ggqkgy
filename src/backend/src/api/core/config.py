"""
Core configuration module for the Web Scraping Platform API.
Handles environment variables, security settings, and database configurations.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from functools import lru_cache
from typing import List, Optional
import ssl
from urllib.parse import quote_plus

# Third-party imports with versions
from pydantic_settings import BaseSettings  # v2.0.0
from pydantic import Field  # v2.0.0
from python_dotenv import load_dotenv  # v1.0.0

# Internal imports
from ....utils.validation import validate_url

# Load environment variables
load_dotenv()

class Settings(BaseSettings):
    """
    Application settings with environment variable loading and validation.
    Implements comprehensive configuration management with secure defaults.
    """
    
    # Core Application Settings
    PROJECT_NAME: str = Field(
        default="Web Scraping Platform",
        description="Project name used in API documentation and logs"
    )
    API_V1_PREFIX: str = Field(
        default="/api/v1",
        description="API version prefix for all endpoints"
    )
    DEBUG: bool = Field(
        default=False,
        description="Debug mode flag, should be False in production"
    )
    
    # Security Settings
    SECRET_KEY: str = Field(
        ...,  # Required field
        description="Secret key for JWT token generation and encryption",
        min_length=32
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=30,
        description="JWT token expiration time in minutes",
        ge=15,
        le=60
    )
    
    # PostgreSQL Configuration
    POSTGRES_SERVER: str = Field(
        ...,
        description="PostgreSQL server hostname"
    )
    POSTGRES_PORT: int = Field(
        default=5432,
        description="PostgreSQL server port",
        ge=1,
        le=65535
    )
    POSTGRES_USER: str = Field(
        ...,
        description="PostgreSQL username"
    )
    POSTGRES_PASSWORD: str = Field(
        ...,
        description="PostgreSQL password",
        min_length=8
    )
    POSTGRES_DB: str = Field(
        ...,
        description="PostgreSQL database name"
    )
    
    # MongoDB Configuration
    MONGODB_URI: str = Field(
        ...,
        description="MongoDB connection URI"
    )
    MONGODB_DB: str = Field(
        ...,
        description="MongoDB database name"
    )
    
    # Redis Configuration
    REDIS_HOST: str = Field(
        ...,
        description="Redis server hostname"
    )
    REDIS_PORT: int = Field(
        default=6379,
        description="Redis server port",
        ge=1,
        le=65535
    )
    REDIS_PASSWORD: str = Field(
        ...,
        description="Redis password",
        min_length=8
    )
    
    # Rate Limiting and Performance
    RATE_LIMIT_PER_MINUTE: int = Field(
        default=1000,
        description="API rate limit per minute per client",
        ge=1,
        le=10000
    )
    MAX_CONCURRENT_TASKS: int = Field(
        default=100,
        description="Maximum number of concurrent scraping tasks",
        ge=1,
        le=1000
    )
    REQUEST_TIMEOUT_SECONDS: int = Field(
        default=30,
        description="HTTP request timeout in seconds",
        ge=1,
        le=300
    )
    
    # CORS Configuration
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000"],
        description="List of allowed CORS origins"
    )
    
    class Config:
        """Pydantic model configuration"""
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = "utf-8"
        validate_assignment = True
        
    def __init__(self, **kwargs):
        """Initialize settings with validation and secure defaults"""
        super().__init__(**kwargs)
        
        # Validate URLs
        self._validate_urls()
        
        # Validate database configurations
        self._validate_database_configs()
        
    def _validate_urls(self):
        """Validate all URL configurations"""
        # Validate MongoDB URI
        is_valid, error = validate_url(self.MONGODB_URI)
        if not is_valid:
            raise ValueError(f"Invalid MongoDB URI: {error.message}")
            
        # Validate CORS origins
        for origin in self.CORS_ORIGINS:
            is_valid, error = validate_url(origin)
            if not is_valid:
                raise ValueError(f"Invalid CORS origin {origin}: {error.message}")
                
    def _validate_database_configs(self):
        """Validate database configurations"""
        # Validate PostgreSQL config
        if not all([self.POSTGRES_SERVER, self.POSTGRES_USER, 
                   self.POSTGRES_PASSWORD, self.POSTGRES_DB]):
            raise ValueError("Missing required PostgreSQL configuration")
            
        # Validate Redis config
        if not all([self.REDIS_HOST, self.REDIS_PASSWORD]):
            raise ValueError("Missing required Redis configuration")
    
    def get_postgres_uri(self) -> str:
        """
        Constructs PostgreSQL connection URI with security parameters.
        
        Returns:
            str: Secure PostgreSQL connection URI
        """
        # URL encode credentials
        user = quote_plus(self.POSTGRES_USER)
        password = quote_plus(self.POSTGRES_PASSWORD)
        
        # Construct base URI
        uri = f"postgresql://{user}:{password}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        
        # Add connection parameters
        params = {
            "sslmode": "verify-full",
            "sslcert": "/etc/ssl/certs/postgres.crt",
            "application_name": self.PROJECT_NAME,
            "connect_timeout": "10",
            "pool_size": "20",
            "max_overflow": "10"
        }
        
        # Append parameters to URI
        param_str = "&".join(f"{k}={quote_plus(str(v))}" for k, v in params.items())
        return f"{uri}?{param_str}"
    
    def get_redis_uri(self) -> str:
        """
        Constructs Redis connection URI with security parameters.
        
        Returns:
            str: Secure Redis connection URI
        """
        # URL encode password
        password = quote_plus(self.REDIS_PASSWORD)
        
        # Construct base URI
        uri = f"redis://:{password}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"
        
        # Add connection parameters
        params = {
            "ssl": "true",
            "ssl_cert_reqs": ssl.CERT_REQUIRED,
            "ssl_ca_certs": "/etc/ssl/certs/redis.crt",
            "health_check_interval": "30",
            "max_connections": "100"
        }
        
        # Append parameters to URI
        param_str = "&".join(f"{k}={quote_plus(str(v))}" for k, v in params.items())
        return f"{uri}?{param_str}"

@lru_cache()
def get_settings() -> Settings:
    """
    Returns cached singleton instance of application settings.
    
    Returns:
        Settings: Application settings instance
    """
    return Settings()

# Export settings instance
settings = get_settings()

# Export specific functions
__all__ = [
    "settings",
    "get_settings"
]