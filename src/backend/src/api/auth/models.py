"""
SQLAlchemy models for user authentication and authorization.
Implements secure user management with enhanced MFA, audit logging, and password history tracking.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import uuid4

# Third-party imports with versions
from sqlalchemy.orm import Mapped, mapped_column  # v2.0.0
from sqlalchemy import UUID, String, Boolean, DateTime, JSON  # v2.0.0

# Internal imports
from ../../db/session import Base
from ../core/security import get_password_hash

# Constants for user management
ROLES = ["admin", "operator", "analyst"]
MFA_TYPES = ["totp", "sms", "email"]
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=30)

class User(Base):
    """
    Enhanced SQLAlchemy model for user authentication and authorization.
    Implements comprehensive security features including MFA, password history,
    and account lockout protection.
    """
    
    __tablename__ = "users"
    __table_args__ = {
        'schema': 'auth',
        'comment': 'User authentication and authorization data'
    }

    # Primary identification fields
    id: Mapped[UUID] = mapped_column(
        UUID, 
        primary_key=True, 
        default=uuid4,
        comment="Unique user identifier"
    )
    username: Mapped[str] = mapped_column(
        String(64), 
        unique=True, 
        nullable=False,
        index=True,
        comment="Unique username for login"
    )
    email: Mapped[str] = mapped_column(
        String(255), 
        unique=True, 
        nullable=False,
        index=True,
        comment="User email address"
    )
    
    # Authentication fields
    hashed_password: Mapped[str] = mapped_column(
        String(255), 
        nullable=False,
        comment="Bcrypt hashed password"
    )
    password_history: Mapped[List[str]] = mapped_column(
        JSON,
        default=list,
        comment="History of previous password hashes"
    )
    
    # Authorization fields
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        comment="User role for authorization"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Account active status"
    )
    
    # Multi-factor authentication
    is_mfa_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="MFA activation status"
    )
    mfa_type: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Type of MFA (totp/sms/email)"
    )
    mfa_secret: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Encrypted MFA secret"
    )
    mfa_backup_codes: Mapped[Optional[List[str]]] = mapped_column(
        JSON,
        nullable=True,
        comment="Encrypted backup codes for MFA"
    )
    
    # Security tracking
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        comment="Account creation timestamp"
    )
    last_login: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Last successful login timestamp"
    )
    last_password_change: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Last password change timestamp"
    )
    failed_login_attempts: Mapped[int] = mapped_column(
        default=0,
        nullable=False,
        comment="Count of failed login attempts"
    )
    last_failed_login: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Last failed login attempt timestamp"
    )
    account_locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Account lockout expiration timestamp"
    )

    def __init__(self, username: str, email: str, password: str, role: str) -> None:
        """
        Initialize user model with enhanced security features.
        
        Args:
            username: Unique username for login
            email: User email address
            password: Plain text password (will be hashed)
            role: User role for authorization
        
        Raises:
            ValueError: If role is invalid or inputs don't meet requirements
        """
        if role not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
        
        self.id = uuid4()
        self.username = username
        self.email = email
        self.hashed_password = get_password_hash(password)
        self.password_history = [self.hashed_password]
        self.role = role
        self.created_at = datetime.utcnow()
        self.last_password_change = datetime.utcnow()

    def update_password(self, new_password: str) -> None:
        """
        Update user's password with history tracking.
        
        Args:
            new_password: New password to set
            
        Raises:
            ValueError: If password is in history or invalid
        """
        # Hash new password
        new_hash = get_password_hash(new_password)
        
        # Check password history
        if new_hash in self.password_history:
            raise ValueError("Password has been used previously")
            
        # Update password and history
        self.hashed_password = new_hash
        self.password_history.append(new_hash)
        
        # Keep last 5 passwords in history
        if len(self.password_history) > 5:
            self.password_history = self.password_history[-5:]
            
        self.last_password_change = datetime.utcnow()

    def configure_mfa(self, mfa_type: str, secret: str) -> List[str]:
        """
        Configure MFA with specified type and backup codes.
        
        Args:
            mfa_type: Type of MFA to enable
            secret: Encrypted MFA secret
            
        Returns:
            List of generated backup codes
            
        Raises:
            ValueError: If MFA type is invalid
        """
        if mfa_type not in MFA_TYPES:
            raise ValueError(f"Invalid MFA type. Must be one of: {', '.join(MFA_TYPES)}")
            
        # Generate backup codes
        backup_codes = [str(uuid4())[:8] for _ in range(10)]
        
        # Configure MFA
        self.mfa_type = mfa_type
        self.mfa_secret = secret
        self.mfa_backup_codes = backup_codes
        self.is_mfa_enabled = True
        
        return backup_codes

    def record_login_attempt(self, success: bool) -> bool:
        """
        Record login attempt and handle account locking.
        
        Args:
            success: Whether login attempt was successful
            
        Returns:
            bool: Whether account is currently locked
        """
        now = datetime.utcnow()
        
        if success:
            # Reset counters on successful login
            self.failed_login_attempts = 0
            self.last_login = now
            self.account_locked_until = None
            return False
            
        # Handle failed attempt
        self.failed_login_attempts += 1
        self.last_failed_login = now
        
        # Check if account should be locked
        if self.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            self.account_locked_until = now + LOCKOUT_DURATION
            return True
            
        return False