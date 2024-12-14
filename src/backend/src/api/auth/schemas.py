"""
Authentication and authorization schema definitions for the Web Scraping Platform.
Implements secure validation for authentication flows with MFA support.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from datetime import datetime
from typing import List, Optional, Dict
from uuid import UUID

# Third-party imports with versions
from pydantic import BaseModel, Field, EmailStr, UUID4, constr, validator  # v2.0.0

# Internal imports
from ..core.config import settings

# Constants for validation
ROLES = ['admin', 'operator', 'analyst', 'service_account']
PASSWORD_REGEX = r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{12,}$'
TOKEN_TYPES = ['bearer', 'refresh']
MFA_METHODS = ['totp', 'sms', 'email', 'backup_codes']

class Token(BaseModel):
    """Enhanced schema for authentication token response with rate limiting."""
    access_token: str = Field(
        ...,
        description="JWT access token",
        min_length=32
    )
    token_type: str = Field(
        ...,
        description="Token type (bearer/refresh)",
        regex='^bearer$|^refresh$'
    )
    expires_in: int = Field(
        default=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        description="Token expiration time in seconds"
    )
    token_family: str = Field(
        ...,
        description="Token family ID for refresh token rotation",
        min_length=16
    )
    rate_limit: Dict[str, int] = Field(
        default_factory=lambda: {
            "remaining": settings.RATE_LIMIT_PER_MINUTE,
            "reset_at": int(datetime.utcnow().timestamp()) + 60
        },
        description="API rate limit information"
    )
    schema_version: str = Field(
        default="1.0.0",
        description="Schema version for compatibility"
    )

    class Config:
        json_schema_extra = {
            "examples": [{
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
                "token_type": "bearer",
                "expires_in": 1800,
                "token_family": "fam_1234567890abcdef",
                "rate_limit": {
                    "remaining": 1000,
                    "reset_at": 1640995200
                },
                "schema_version": "1.0.0"
            }]
        }

class TokenPayload(BaseModel):
    """Enhanced schema for JWT token payload with additional security metadata."""
    sub: UUID4 = Field(..., description="Subject (user ID)")
    role: str = Field(..., description="User role")
    exp: int = Field(..., description="Expiration timestamp")
    jti: str = Field(..., description="JWT ID for token tracking")
    device_id: str = Field(..., description="Device identifier for session tracking")
    security_context: Dict[str, str] = Field(
        default_factory=dict,
        description="Additional security context"
    )

    @validator('role')
    def validate_role(cls, v):
        if v not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
        return v

class UserCreate(BaseModel):
    """Enhanced schema for user creation with strict validation."""
    email: EmailStr = Field(..., description="User email address")
    password: constr(regex=PASSWORD_REGEX) = Field(
        ...,
        description="User password meeting security requirements"
    )
    password_confirm: str = Field(..., description="Password confirmation")
    role: str = Field(default='analyst', description="User role")
    email_verified: bool = Field(default=False, description="Email verification status")
    password_history: List[str] = Field(
        default_factory=list,
        description="Password history for preventing reuse",
        max_items=10
    )
    security_preferences: Dict[str, bool] = Field(
        default_factory=lambda: {
            "mfa_enabled": False,
            "password_rotation": True,
            "session_timeout": True
        },
        description="User security preferences"
    )

    @validator('password_confirm')
    def passwords_match(cls, v, values):
        if 'password' in values and v != values['password']:
            raise ValueError('Passwords do not match')
        return v

    @validator('role')
    def validate_role(cls, v):
        if v not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
        return v

    @validator('email')
    def validate_email_domain(cls, v):
        domain = v.split('@')[1]
        if domain in settings.SECURITY_CONFIG.get('blocked_domains', []):
            raise ValueError('Email domain not allowed')
        return v

class MFASetup(BaseModel):
    """Enhanced schema for MFA setup with multiple methods."""
    secret: str = Field(
        ...,
        description="MFA secret key",
        min_length=32,
        max_length=64
    )
    qr_code: str = Field(
        ...,
        description="QR code for TOTP setup",
        regex='^data:image/png;base64,'
    )
    backup_codes: List[str] = Field(
        ...,
        description="Backup codes for account recovery",
        min_items=8,
        max_items=8
    )
    mfa_method: str = Field(
        ...,
        description="Selected MFA method"
    )
    device_info: Dict[str, str] = Field(
        ...,
        description="Device information for MFA setup"
    )
    setup_timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="MFA setup timestamp"
    )

    @validator('mfa_method')
    def validate_mfa_method(cls, v):
        if v not in MFA_METHODS:
            raise ValueError(f"Invalid MFA method. Must be one of: {', '.join(MFA_METHODS)}")
        return v

    @validator('backup_codes')
    def validate_backup_codes(cls, v):
        if len(set(v)) != len(v):
            raise ValueError("Backup codes must be unique")
        if not all(len(code) == 8 for code in v):
            raise ValueError("All backup codes must be 8 characters long")
        return v

class LoginRequest(BaseModel):
    """Enhanced schema for login requests with MFA support."""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")
    mfa_code: Optional[str] = Field(None, description="MFA code if enabled")
    device_info: Dict[str, str] = Field(
        ...,
        description="Device information for security tracking"
    )

    @validator('device_info')
    def validate_device_info(cls, v):
        required_fields = {'user_agent', 'ip_address', 'device_id'}
        if not all(field in v for field in required_fields):
            raise ValueError(f"Missing required device info fields: {required_fields}")
        return v