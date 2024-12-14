# Standard library imports - v3.11+ compatible
import logging
import logging.handlers
import json
import os
import datetime
from typing import Dict, Any, Set
from pathlib import Path
import threading
from functools import lru_cache
import traceback

# Constants for logging configuration
DEFAULT_LOG_FORMAT = {
    "timestamp": "%(asctime)s",
    "level": "%(levelname)s",
    "module": "%(module)s",
    "function": "%(funcName)s",
    "line": "%(lineno)d",
    "message": "%(message)s",
    "correlation_id": "%(correlation_id)s",
    "environment": "%(environment)s"
}

DEFAULT_LOG_LEVEL = logging.INFO
MAX_LOG_SIZE = 10 * 1024 * 1024  # 10MB
BACKUP_COUNT = 5
LOG_PERMISSIONS = 0o600
SENSITIVE_FIELDS = {"password", "token", "api_key", "secret", "auth", "credential"}

# Thread-local storage for correlation IDs
_thread_local = threading.local()

class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter with enhanced security features and PII protection.
    Formats log records as JSON strings with configurable field masking and validation.
    """
    
    def __init__(self, default_fields: Dict[str, Any] = None, 
                 sensitive_fields: Set[str] = None) -> None:
        """
        Initialize the JSON formatter with security features.
        
        Args:
            default_fields: Default fields to include in every log entry
            sensitive_fields: Set of field names to mask for security
        """
        super().__init__()
        self.default_fields = default_fields or {}
        self.sensitive_fields = sensitive_fields or SENSITIVE_FIELDS
        self.field_formatters = {
            'asctime': lambda x: datetime.datetime.fromtimestamp(x.created).isoformat(),
            'exc_info': lambda x: self._format_exception(x.exc_info) if x.exc_info else None
        }

    def _format_exception(self, exc_info) -> str:
        """Format exception information securely."""
        if exc_info:
            return '\n'.join(traceback.format_exception(*exc_info))
        return None

    def _mask_sensitive_data(self, obj: Any) -> Any:
        """Recursively mask sensitive data in the log record."""
        if isinstance(obj, dict):
            return {
                k: '***REDACTED***' if k.lower() in self.sensitive_fields 
                else self._mask_sensitive_data(v)
                for k, v in obj.items()
            }
        elif isinstance(obj, (list, tuple)):
            return [self._mask_sensitive_data(item) for item in obj]
        return obj

    def format(self, record: logging.LogRecord) -> str:
        """
        Format the log record as a secure JSON string.
        
        Args:
            record: The log record to format
            
        Returns:
            Formatted JSON string with masked sensitive data
        """
        try:
            log_dict = {
                'timestamp': self.field_formatters['asctime'](record),
                'level': record.levelname,
                'module': record.module,
                'function': record.funcName,
                'line': record.lineno,
                'message': record.getMessage(),
                'correlation_id': getattr(record, 'correlation_id', ''),
                'environment': getattr(record, 'environment', ''),
            }

            # Add exception info if present
            if record.exc_info:
                log_dict['exception'] = self._format_exception(record.exc_info)

            # Add custom fields from record
            for key, value in record.__dict__.items():
                if key not in log_dict and not key.startswith('_'):
                    log_dict[key] = value

            # Add default fields
            log_dict.update(self.default_fields)

            # Mask sensitive data
            secured_dict = self._mask_sensitive_data(log_dict)

            return json.dumps(secured_dict, default=str)
        except Exception as e:
            return json.dumps({
                'timestamp': datetime.datetime.now().isoformat(),
                'level': 'ERROR',
                'message': f'Error formatting log record: {str(e)}',
                'error_type': 'LogFormattingError'
            })

def setup_logging(
    log_level: str = DEFAULT_LOG_LEVEL,
    log_file_path: str = None,
    additional_context: Dict[str, Any] = None,
    enable_async: bool = True
) -> logging.Logger:
    """
    Configure the root logger with secure handlers and formatters.
    
    Args:
        log_level: Desired logging level
        log_file_path: Path to log file
        additional_context: Additional context to include in logs
        enable_async: Enable asynchronous logging
        
    Returns:
        Configured logger instance
    """
    try:
        # Create root logger
        logger = logging.getLogger()
        logger.setLevel(log_level)

        # Remove existing handlers
        for handler in logger.handlers[:]:
            logger.removeHandler(handler)

        # Configure JSON formatter
        formatter = JSONFormatter(
            default_fields=additional_context or {},
            sensitive_fields=SENSITIVE_FIELDS
        )

        # Set up file handler if path provided
        if log_file_path:
            # Ensure log directory exists with secure permissions
            log_dir = os.path.dirname(log_file_path)
            Path(log_dir).mkdir(parents=True, exist_ok=True)
            os.chmod(log_dir, LOG_PERMISSIONS)

            # Configure rotating file handler
            file_handler = logging.handlers.RotatingFileHandler(
                filename=log_file_path,
                maxBytes=MAX_LOG_SIZE,
                backupCount=BACKUP_COUNT,
                encoding='utf-8'
            )
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)

            # Secure log file permissions
            os.chmod(log_file_path, LOG_PERMISSIONS)

        # Configure console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        return logger
    except Exception as e:
        # Fallback to basic logging if setup fails
        basic_logger = logging.getLogger()
        basic_logger.setLevel(logging.ERROR)
        basic_logger.error(f"Failed to setup logging: {str(e)}")
        return basic_logger

@lru_cache(maxsize=100)
def get_logger(module_name: str, context: Dict[str, Any] = None) -> logging.Logger:
    """
    Get or create a logger instance for a specific module with context.
    
    Args:
        module_name: Name of the module requesting the logger
        context: Additional context to include in logs
        
    Returns:
        Configured logger instance
    """
    try:
        logger = logging.getLogger(module_name)
        
        # Add context as extra fields
        if context:
            logger = logging.LoggerAdapter(logger, context)
            
        return logger
    except Exception as e:
        # Fallback to root logger
        root_logger = logging.getLogger()
        root_logger.error(f"Failed to get logger for {module_name}: {str(e)}")
        return root_logger

def set_correlation_id(correlation_id: str) -> None:
    """Set correlation ID for the current thread."""
    _thread_local.correlation_id = correlation_id

def get_correlation_id() -> str:
    """Get correlation ID for the current thread."""
    return getattr(_thread_local, 'correlation_id', '')

# Export public interface
__all__ = [
    'setup_logging',
    'get_logger',
    'JSONFormatter',
    'set_correlation_id',
    'get_correlation_id'
]