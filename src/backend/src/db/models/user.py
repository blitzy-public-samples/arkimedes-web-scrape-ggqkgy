"""
SQLAlchemy User model implementing comprehensive security features including
role-based access control, MFA support, and secure password management.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from datetime import datetime, timedelta
from typing import Optional, List
import json
import re
from uuid import uuid4

# Third-party imports with versions
from sqlalchemy import String, Boolean, DateTime, Integer, UUID  # v2.0.0
from sqlalchemy.orm import Mapped, mapped_column, validates  # v2.0.0
from sqlalchemy.ext.declarative import DeclarativeBase  # v2.0.0
from sqlalchemy.ext.hybrid import hybrid_property  # v2.0.0

# Internal imports
from ..session import get_session
from ...api.core.security import get_password_hash

# Constants for validation and security
ROLES = ["admin", "operator", "analyst"]
PASSWORD_MIN_LENGTH = 12
PASSWORD_COMPLEXITY_REGEX = r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$"
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_DURATION = timedelta(minutes=30)
EMAIL_REGEX = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
MAX_PASSWORD_HISTORY = 5

class User(DeclarativeBase):
    """
    User model implementing comprehensive security features including:
    - Role-based access control
    - Multi-factor authentication support
    - Secure password management with history
    - Account lockout protection
    - Privacy consent tracking
    - Audit logging
    """
    
    __tablename__ = "users"
    
    # Primary key and identity
    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        index=True
    )
    
    # Core user attributes
    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )
    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    
    # Role and access control
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )
    
    # Security features
    is_mfa_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False
    )
    login_attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )
    lockout_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Password management
    last_password_change: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    password_history: Mapped[str] = mapped_column(
        String(2000),
        default="[]",
        nullable=False
    )
    
    # Audit and tracking
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False
    )
    last_login: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Privacy and consent
    consent_status: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True
    )
    consent_timestamp: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    def __init__(self, username: str, email: str, password: str, role: str) -> None:
        """
        Initialize user with secure defaults and validation.
        
        Args:
            username: Unique username
            email: Valid email address
            password: Strong password meeting complexity requirements
            role: Authorized role from ROLES constant
        
        Raises:
            ValueError: If any validation fails
        """
        # Validate email format
        if not re.match(EMAIL_REGEX, email):
            raise ValueError("Invalid email format")
            
        # Validate password complexity
        if not re.match(PASSWORD_COMPLEXITY_REGEX, password):
            raise ValueError(
                "Password must be at least 12 characters long and contain uppercase, "
                "lowercase, number and special character"
            )
            
        # Validate role
        if role not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
            
        # Set core attributes
        self.id = uuid4()
        self.username = username
        self.email = email
        self.hashed_password = get_password_hash(password)
        self.role = role
        
        # Set secure defaults
        self.is_active = True
        self.is_mfa_enabled = False
        self.login_attempts = 0
        self.created_at = datetime.utcnow()
        self.password_history = json.dumps([])
        
        # Initialize consent tracking
        self.consent_status = None
        self.consent_timestamp = None

    @validates('email')
    def validate_email(self, key: str, email: str) -> str:
        """Validate email format."""
        if not re.match(EMAIL_REGEX, email):
            raise ValueError("Invalid email format")
        return email

    @validates('role')
    def validate_role(self, key: str, role: str) -> str:
        """Validate role assignment."""
        if role not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
        return role

    def update_password(self, new_password: str) -> bool:
        """
        Securely update password with history tracking.
        
        Args:
            new_password: New password meeting complexity requirements
            
        Returns:
            bool: Success status of password update
            
        Raises:
            ValueError: If password validation fails
        """
        # Validate password complexity
        if not re.match(PASSWORD_COMPLEXITY_REGEX, new_password):
            raise ValueError("Password does not meet complexity requirements")
            
        # Check password history
        password_history = json.loads(self.password_history)
        if any(get_password_hash(new_password) == old_hash 
               for old_hash in password_history):
            raise ValueError("Password has been used recently")
            
        # Update password
        new_hash = get_password_hash(new_password)
        
        # Update password history
        password_history.append(self.hashed_password)
        if len(password_history) > MAX_PASSWORD_HISTORY:
            password_history = password_history[-MAX_PASSWORD_HISTORY:]
        
        self.password_history = json.dumps(password_history)
        self.hashed_password = new_hash
        self.last_password_change = datetime.utcnow()
        
        return True

    def record_login_attempt(self, success: bool) -> bool:
        """
        Track login attempts with rate limiting.
        
        Args:
            success: Whether login attempt was successful
            
        Returns:
            bool: Whether account is locked
        """
        now = datetime.utcnow()
        
        # Check if account is locked
        if self.lockout_until and now < self.lockout_until:
            return True
            
        if success:
            # Reset on successful login
            self.login_attempts = 0
            self.last_login = now
            self.lockout_until = None
        else:
            # Increment attempts and check for lockout
            self.login_attempts += 1
            if self.login_attempts >= MAX_LOGIN_ATTEMPTS:
                self.lockout_until = now + LOGIN_LOCKOUT_DURATION
                return True
                
        return False

    def update_consent(self, consent_type: str, granted: bool) -> None:
        """
        Update user's data processing consent.
        
        Args:
            consent_type: Type of consent being updated
            granted: Whether consent was granted
        """
        consent_status = {
            "type": consent_type,
            "granted": granted,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self.consent_status = json.dumps(consent_status)
        self.consent_timestamp = datetime.utcnow()

    @hybrid_property
    def is_locked(self) -> bool:
        """Check if account is currently locked."""
        if self.lockout_until and datetime.utcnow() < self.lockout_until:
            return True
        return False

    def __repr__(self) -> str:
        """String representation of User."""
        return f"<User {self.username} (role={self.role})>"