"""
Core security module implementing OAuth 2.0 + OIDC with JWT token handling,
secure password management, and comprehensive security utilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from datetime import datetime, timedelta
from typing import Dict, Optional, Union
import logging

# Third-party imports with versions
from jose import JWTError, jwt  # python-jose v3.3.0
from passlib.context import CryptContext  # passlib v1.7.4

# Internal imports
from .config import settings
from ...utils.encryption import encrypt, decrypt

# Configure logging
logger = logging.getLogger(__name__)

# Constants
ALGORITHM = "HS256"

# Password hashing configuration with bcrypt
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Industry standard for security/performance balance
)

# Token blacklist for revoked tokens
TOKEN_BLACKLIST = set()

class SecurityError(Exception):
    """Custom exception for security-related errors with detailed tracking."""
    
    def __init__(self, message: str, error_code: str, details: Optional[Dict] = None):
        """
        Initialize security error with comprehensive details.
        
        Args:
            message: Error description
            error_code: Unique error identifier
            details: Additional context
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        self.timestamp = datetime.utcnow().isoformat()
        
        # Log security error
        logger.error(f"Security Error: {self.to_dict()}")
        
    def to_dict(self) -> Dict:
        """Convert error to dictionary format for API responses."""
        return {
            "error": {
                "code": self.error_code,
                "message": self.message,
                "details": self.details,
                "timestamp": self.timestamp
            }
        }

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Securely verify a plain password against a hashed password.
    
    Args:
        plain_password: Password to verify
        hashed_password: Stored hash to verify against
        
    Returns:
        bool: True if password matches, False otherwise
    """
    try:
        # Validate inputs
        if not plain_password or not hashed_password:
            logger.warning("Empty password or hash provided for verification")
            return False
            
        # Verify password
        is_valid = pwd_context.verify(plain_password, hashed_password)
        
        # Log verification attempt (success/failure)
        logger.info(
            "Password verification %s",
            "successful" if is_valid else "failed",
            extra={"success": is_valid}
        )
        
        return is_valid
        
    except Exception as e:
        logger.error(f"Password verification error: {str(e)}")
        return False

def get_password_hash(password: str) -> str:
    """
    Generate secure password hash using bcrypt.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: Securely hashed password
        
    Raises:
        SecurityError: If password doesn't meet requirements
    """
    try:
        # Validate password complexity
        if not password or len(password) < 8:
            raise SecurityError(
                message="Password does not meet minimum requirements",
                error_code="SEC_001",
                details={"min_length": 8}
            )
            
        # Generate hash
        hashed = pwd_context.hash(password)
        
        # Verify hash was generated correctly
        if not pwd_context.identify(hashed):
            raise SecurityError(
                message="Generated hash verification failed",
                error_code="SEC_002"
            )
            
        logger.info("Password hash generated successfully")
        return hashed
        
    except SecurityError:
        raise
    except Exception as e:
        raise SecurityError(
            message="Password hashing failed",
            error_code="SEC_003",
            details={"error": str(e)}
        )

def create_access_token(
    data: Dict,
    expires_delta: Optional[timedelta] = None,
    scope: Optional[str] = None
) -> str:
    """
    Create secure JWT access token with comprehensive claims.
    
    Args:
        data: Token payload data
        expires_delta: Optional custom expiration time
        scope: Optional token scope
        
    Returns:
        str: Encoded JWT token
        
    Raises:
        SecurityError: If token creation fails
    """
    try:
        # Copy data to prevent mutation
        to_encode = data.copy()
        
        # Calculate expiration
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(
                minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
            )
            
        # Add required claims
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "nbf": datetime.utcnow(),
            "jti": encrypt(settings.SECRET_KEY.encode(), str(datetime.utcnow()).encode()).decode(),
            "iss": "web_scraping_platform",
            "aud": "web_scraping_api"
        })
        
        # Add scope if provided
        if scope:
            to_encode["scope"] = scope
            
        # Encrypt sensitive payload data
        for key in ["sub", "email"]:
            if key in to_encode:
                to_encode[key] = encrypt(
                    settings.SECRET_KEY.encode(),
                    to_encode[key].encode()
                ).decode()
                
        # Create token
        encoded_jwt = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=ALGORITHM
        )
        
        # Validate generated token
        try:
            jwt.decode(
                encoded_jwt,
                settings.SECRET_KEY,
                algorithms=[ALGORITHM]
            )
        except JWTError as e:
            raise SecurityError(
                message="Generated token validation failed",
                error_code="SEC_004",
                details={"error": str(e)}
            )
            
        logger.info("Access token created successfully")
        return encoded_jwt
        
    except SecurityError:
        raise
    except Exception as e:
        raise SecurityError(
            message="Token creation failed",
            error_code="SEC_005",
            details={"error": str(e)}
        )

def decode_access_token(token: str) -> Dict:
    """
    Decode and validate JWT access token.
    
    Args:
        token: JWT token to decode
        
    Returns:
        dict: Validated token claims
        
    Raises:
        SecurityError: If token is invalid or validation fails
    """
    try:
        # Check token blacklist
        if token in TOKEN_BLACKLIST:
            raise SecurityError(
                message="Token has been revoked",
                error_code="SEC_006"
            )
            
        # Decode token
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        
        # Validate required claims
        required_claims = {"exp", "iat", "nbf", "jti", "iss", "aud"}
        missing_claims = required_claims - set(payload.keys())
        if missing_claims:
            raise SecurityError(
                message="Token missing required claims",
                error_code="SEC_007",
                details={"missing_claims": list(missing_claims)}
            )
            
        # Decrypt sensitive payload data
        for key in ["sub", "email"]:
            if key in payload:
                payload[key] = decrypt(
                    settings.SECRET_KEY.encode(),
                    payload[key]
                ).decode()
                
        logger.info("Access token decoded successfully")
        return payload
        
    except JWTError as e:
        raise SecurityError(
            message="Invalid token",
            error_code="SEC_008",
            details={"error": str(e)}
        )
    except SecurityError:
        raise
    except Exception as e:
        raise SecurityError(
            message="Token decoding failed",
            error_code="SEC_009",
            details={"error": str(e)}
        )

# Export public interface
__all__ = [
    "SecurityError",
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "decode_access_token"
]