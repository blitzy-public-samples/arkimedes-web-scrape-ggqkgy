"""
Core exceptions module for the web scraping platform API.
Provides standardized error handling, logging, and recovery guidance.

Version: 1.0.0
"""

from fastapi import HTTPException, status  # fastapi v0.100.0+

# Error code constants
ERROR_CODES = {
    'AUTH_ERROR': 'authentication_failed',
    'FORBIDDEN': 'access_forbidden',
    'RATE_LIMIT_EXCEEDED': 'rate_limit_exceeded',
    'VALIDATION_ERROR': 'validation_failed',
    'TASK_ERROR': 'task_execution_failed'
}

# Standard error messages
ERROR_MESSAGES = {
    'AUTH_ERROR': 'Authentication failed. Please verify your credentials.',
    'FORBIDDEN': 'Access forbidden. Insufficient permissions.',
    'RATE_LIMIT_EXCEEDED': 'Rate limit exceeded. Please try again later.',
    'VALIDATION_ERROR': 'Invalid input data provided.',
    'TASK_ERROR': 'Task execution failed. Please check the details.'
}

class APIException(HTTPException):
    """
    Base exception class for API errors with standardized error handling and logging support.
    Extends FastAPI's HTTPException with additional context and recovery guidance.
    """
    
    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: dict = None,
        recovery_hint: str = None
    ):
        """
        Initialize base API exception with enhanced error details.
        
        Args:
            message (str): Human-readable error message
            error_code (str): Machine-readable error code
            status_code (int): HTTP status code
            details (dict, optional): Additional error context
            recovery_hint (str, optional): Guidance for error recovery
        """
        if not isinstance(status_code, int) or status_code < 400:
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            
        super().__init__(
            status_code=status_code,
            detail={
                'error_code': error_code,
                'message': message,
                'details': details or {},
                'recovery_hint': recovery_hint
            }
        )
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        self.recovery_hint = recovery_hint

class AuthenticationError(APIException):
    """Exception for authentication failures with secure error messaging."""
    
    def __init__(
        self,
        message: str = ERROR_MESSAGES['AUTH_ERROR'],
        details: dict = None,
        recovery_hint: str = "Please check your credentials and try again."
    ):
        """
        Initialize authentication error with security considerations.
        
        Args:
            message (str): Authentication error message
            details (dict, optional): Additional authentication context
            recovery_hint (str, optional): Authentication recovery guidance
        """
        # Sanitize details to prevent information disclosure
        safe_details = {'timestamp': details.get('timestamp')} if details else {}
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES['AUTH_ERROR'],
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=safe_details,
            recovery_hint=recovery_hint
        )

class AuthorizationError(APIException):
    """Exception for authorization failures with role-based details."""
    
    def __init__(
        self,
        message: str = ERROR_MESSAGES['FORBIDDEN'],
        details: dict = None,
        recovery_hint: str = "Please contact your administrator for required permissions."
    ):
        """
        Initialize authorization error with role information.
        
        Args:
            message (str): Authorization error message
            details (dict, optional): Role and permission context
            recovery_hint (str, optional): Authorization recovery guidance
        """
        super().__init__(
            message=message,
            error_code=ERROR_CODES['FORBIDDEN'],
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
            recovery_hint=recovery_hint
        )

class RateLimitExceeded(APIException):
    """Exception for rate limit exceeded scenarios with retry guidance."""
    
    def __init__(
        self,
        message: str = ERROR_MESSAGES['RATE_LIMIT_EXCEEDED'],
        retry_after: int = 60,
        quota_details: dict = None
    ):
        """
        Initialize rate limit error with quota details.
        
        Args:
            message (str): Rate limit error message
            retry_after (int): Seconds until next retry allowed
            quota_details (dict, optional): Rate limit quota information
        """
        self.retry_after = retry_after
        self.limit = quota_details.get('limit', 0) if quota_details else 0
        self.remaining = quota_details.get('remaining', 0) if quota_details else 0
        
        details = {
            'limit': self.limit,
            'remaining': self.remaining,
            'retry_after': retry_after
        }
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES['RATE_LIMIT_EXCEEDED'],
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details,
            recovery_hint=f"Please retry after {retry_after} seconds."
        )

class ValidationError(APIException):
    """Exception for data validation failures with field-level details."""
    
    def __init__(
        self,
        message: str = ERROR_MESSAGES['VALIDATION_ERROR'],
        errors: list = None,
        recovery_hint: str = "Please review the validation errors and update your request."
    ):
        """
        Initialize validation error with detailed field errors.
        
        Args:
            message (str): Validation error message
            errors (list, optional): List of field-level validation errors
            recovery_hint (str, optional): Validation recovery guidance
        """
        self.validation_errors = errors or []
        
        details = {
            'validation_errors': [
                {
                    'field': error.get('field', 'unknown'),
                    'message': error.get('message', 'Invalid value'),
                    'code': error.get('code', 'invalid')
                }
                for error in self.validation_errors
            ]
        }
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES['VALIDATION_ERROR'],
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
            recovery_hint=recovery_hint
        )

class TaskError(APIException):
    """Exception for scraping task failures with detailed diagnostics."""
    
    def __init__(
        self,
        message: str = ERROR_MESSAGES['TASK_ERROR'],
        task_context: dict = None,
        failure_reason: str = None
    ):
        """
        Initialize task error with execution context.
        
        Args:
            message (str): Task error message
            task_context (dict, optional): Task execution context
            failure_reason (str, optional): Specific reason for task failure
        """
        self.task_details = task_context or {}
        self.failure_reason = failure_reason
        
        details = {
            'task_id': self.task_details.get('task_id'),
            'failure_reason': failure_reason,
            'execution_context': {
                k: v for k, v in self.task_details.items()
                if k not in ['credentials', 'sensitive_data']
            }
        }
        
        recovery_hint = (
            "Please check the task configuration and retry. "
            "If the issue persists, contact support."
        )
        
        super().__init__(
            message=message,
            error_code=ERROR_CODES['TASK_ERROR'],
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
            recovery_hint=recovery_hint
        )