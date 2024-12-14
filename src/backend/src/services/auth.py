"""
Authentication service implementing OAuth 2.0 + OIDC based user management with MFA support.
Provides comprehensive security features including rate limiting and audit logging.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from uuid import UUID
import logging

# Third-party imports with versions
import pyotp  # v2.8.0
import qrcode  # v7.4.2
from sqlalchemy.exc import SQLAlchemyError  # v2.0.0
import redis  # v4.5.0

# Internal imports
from ..api.auth.models import User
from ..api.core.security import verify_password, create_access_token
from ..db.session import get_session

# Constants
MFA_ISSUER = "Web Scraping Platform"
MFA_DIGITS = 6
MFA_INTERVAL = 30
BACKUP_CODES_COUNT = 10
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=30)
RATE_LIMIT_ATTEMPTS = 5
RATE_LIMIT_WINDOW = 300  # 5 minutes

class AuthService:
    """Enhanced authentication service implementing OAuth 2.0 + OIDC with MFA support."""
    
    def __init__(self, redis_client: redis.Redis, logger: Optional[logging.Logger] = None):
        """
        Initialize authentication service with database session and Redis client.
        
        Args:
            redis_client: Redis client for rate limiting
            logger: Optional logger instance
        """
        self.db = get_session()
        self.redis = redis_client
        self.logger = logger or logging.getLogger(__name__)

    def _check_rate_limit(self, username: str) -> bool:
        """
        Check rate limiting for login attempts.
        
        Args:
            username: Username to check
            
        Returns:
            bool: True if within rate limit, False if exceeded
        """
        key = f"login_attempts:{username}"
        try:
            attempts = self.redis.get(key)
            if attempts is None:
                self.redis.setex(key, RATE_LIMIT_WINDOW, 1)
                return True
                
            attempts = int(attempts)
            if attempts >= RATE_LIMIT_ATTEMPTS:
                return False
                
            self.redis.incr(key)
            return True
            
        except redis.RedisError as e:
            self.logger.error(f"Rate limiting error: {str(e)}")
            return True  # Fail open for rate limiting

    def _generate_backup_codes(self) -> List[str]:
        """
        Generate secure backup codes for MFA.
        
        Returns:
            List[str]: List of backup codes
        """
        return [pyotp.random_base32()[:8] for _ in range(BACKUP_CODES_COUNT)]

    def authenticate_user(
        self, 
        username: str, 
        password: str, 
        mfa_code: Optional[str] = None
    ) -> Tuple[User, str]:
        """
        Authenticate user with enhanced security including MFA and rate limiting.
        
        Args:
            username: User's username
            password: User's password
            mfa_code: Optional MFA code
            
        Returns:
            Tuple[User, str]: Authenticated user and JWT access token
            
        Raises:
            ValueError: If authentication fails
            SQLAlchemyError: If database operation fails
        """
        try:
            # Check rate limiting
            if not self._check_rate_limit(username):
                self.logger.warning(f"Rate limit exceeded for user: {username}")
                raise ValueError("Too many login attempts. Please try again later.")

            # Query user
            user = self.db.query(User).filter(User.username == username).first()
            if not user:
                self.logger.warning(f"Login attempt for non-existent user: {username}")
                raise ValueError("Invalid username or password")

            # Check account lockout
            if user.account_locked_until and user.account_locked_until > datetime.utcnow():
                self.logger.warning(f"Login attempt for locked account: {username}")
                raise ValueError("Account is temporarily locked. Please try again later.")

            # Verify password
            if not verify_password(password, user.hashed_password):
                user.failed_login_attempts += 1
                user.last_failed_login = datetime.utcnow()
                
                # Check for account lockout
                if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
                    user.account_locked_until = datetime.utcnow() + LOCKOUT_DURATION
                    self.db.commit()
                    raise ValueError("Account locked due to too many failed attempts")
                    
                self.db.commit()
                raise ValueError("Invalid username or password")

            # Verify MFA if enabled
            if user.is_mfa_enabled:
                if not mfa_code:
                    raise ValueError("MFA code required")
                    
                if not self.verify_mfa(user, mfa_code):
                    raise ValueError("Invalid MFA code")

            # Reset failed attempts and update last login
            user.failed_login_attempts = 0
            user.last_login = datetime.utcnow()
            user.account_locked_until = None
            self.db.commit()

            # Generate access token
            token_data = {
                "sub": str(user.id),
                "username": user.username,
                "role": user.role
            }
            access_token = create_access_token(token_data)

            self.logger.info(f"Successful login for user: {username}")
            return user, access_token

        except ValueError:
            raise
        except SQLAlchemyError as e:
            self.logger.error(f"Database error during authentication: {str(e)}")
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error during authentication: {str(e)}")
            raise ValueError("Authentication failed")

    def setup_mfa(self, user_id: UUID) -> Dict:
        """
        Setup TOTP-based MFA for user account.
        
        Args:
            user_id: User's UUID
            
        Returns:
            Dict: MFA setup details including secret and QR code
            
        Raises:
            ValueError: If user not found or MFA already enabled
            SQLAlchemyError: If database operation fails
        """
        try:
            user = self.db.query(User).filter(User.id == user_id).first()
            if not user:
                raise ValueError("User not found")

            if user.is_mfa_enabled:
                raise ValueError("MFA is already enabled for this account")

            # Generate TOTP secret
            secret = pyotp.random_base32()
            totp = pyotp.TOTP(
                secret,
                digits=MFA_DIGITS,
                interval=MFA_INTERVAL
            )

            # Generate QR code
            provisioning_uri = totp.provisioning_uri(
                user.username,
                issuer_name=MFA_ISSUER
            )
            qr = qrcode.QRCode(version=1, box_size=10, border=5)
            qr.add_data(provisioning_uri)
            qr.make(fit=True)
            qr_image = qr.make_image(fill_color="black", back_color="white")

            # Generate backup codes
            backup_codes = self._generate_backup_codes()

            # Update user
            user.mfa_secret = secret
            user.mfa_type = "totp"
            user.mfa_backup_codes = backup_codes
            user.is_mfa_enabled = True
            self.db.commit()

            self.logger.info(f"MFA setup completed for user: {user.username}")
            return {
                "secret": secret,
                "qr_code": qr_image,
                "backup_codes": backup_codes
            }

        except ValueError:
            raise
        except SQLAlchemyError as e:
            self.logger.error(f"Database error during MFA setup: {str(e)}")
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error during MFA setup: {str(e)}")
            raise ValueError("MFA setup failed")

    def verify_mfa(self, user: User, mfa_code: str, is_backup_code: bool = False) -> bool:
        """
        Verify TOTP or backup MFA code.
        
        Args:
            user: User instance
            mfa_code: MFA code to verify
            is_backup_code: Whether code is a backup code
            
        Returns:
            bool: True if code is valid
            
        Raises:
            ValueError: If MFA is not enabled or verification fails
        """
        try:
            if not user.is_mfa_enabled:
                raise ValueError("MFA is not enabled for this account")

            if is_backup_code:
                # Verify backup code
                if mfa_code not in user.mfa_backup_codes:
                    return False
                    
                # Remove used backup code
                user.mfa_backup_codes.remove(mfa_code)
                self.db.commit()
                
                self.logger.info(f"Backup code used for user: {user.username}")
                return True

            # Verify TOTP code
            totp = pyotp.TOTP(
                user.mfa_secret,
                digits=MFA_DIGITS,
                interval=MFA_INTERVAL
            )
            is_valid = totp.verify(mfa_code)

            if is_valid:
                self.logger.info(f"Successful MFA verification for user: {user.username}")
            else:
                self.logger.warning(f"Failed MFA verification for user: {user.username}")

            return is_valid

        except Exception as e:
            self.logger.error(f"MFA verification error: {str(e)}")
            return False