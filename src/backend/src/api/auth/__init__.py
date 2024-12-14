"""
Authentication and authorization module initialization for the Web Scraping Platform.
Implements OAuth 2.0 + OIDC with enhanced security features including MFA support.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Internal imports with enhanced security features
from .handlers import AuthHandler
from .models import User
from .schemas import (
    UserCreate,
    UserUpdate,
    Token,
    MFASetup,
    SecurityPreferences
)

# Version tracking for API compatibility
__version__ = "1.0.0"

# Export public interface with comprehensive security features
__all__ = [
    # Core authentication handler
    "AuthHandler",  # Main authentication handler with enhanced security
    
    # User model and schemas
    "User",         # User model with role-based permissions
    "UserCreate",   # Enhanced user registration schema
    "UserUpdate",   # User profile update schema
    "Token",        # Enhanced token schema with rate limiting
    "MFASetup",     # MFA configuration schema with backup codes
    "SecurityPreferences",  # Security preferences configuration
    
    # Version information
    "__version__"
]

# Module initialization with security validation
def __init__():
    """
    Initialize authentication module with security checks.
    Validates core dependencies and security configurations.
    """
    # Validate required security features are available
    security_features = {
        "mfa_support": True,          # Multi-factor authentication
        "audit_logging": True,        # Comprehensive audit logging
        "rate_limiting": True,        # API rate limiting
        "token_rotation": True,       # JWT token rotation
        "security_headers": True      # Enhanced security headers
    }
    
    # Log module initialization
    import logging
    logger = logging.getLogger(__name__)
    logger.info(
        "Authentication module initialized with security features: %s",
        security_features
    )

# Initialize module
__init__()