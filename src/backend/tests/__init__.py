"""
Test Suite Initialization Module

Configures the test environment with enhanced logging capabilities, environment detection,
and thread-safety mechanisms for both unit and integration tests.
"""

# Standard library imports
import os
import logging
import threading
import uuid
from pathlib import Path

# Third-party imports
import pytest  # v7.4.0

# Internal imports
from src.utils.logging import setup_logging

# Global test configuration constants
TEST_LOG_LEVEL = logging.DEBUG
TEST_LOG_DIR = "tests/logs"
TEST_LOG_FORMAT = "%(asctime)s - %(correlation_id)s - %(environment)s - %(levelname)s - %(message)s"
TEST_LOG_MAX_SIZE = 10 * 1024 * 1024  # 10MB
TEST_LOG_BACKUP_COUNT = 5
TEST_ENV_MARKER = os.getenv('TEST_ENVIRONMENT', 'development')

class TestLogFilter(logging.Filter):
    """
    Custom log filter for test execution that adds correlation IDs and environment markers
    while sanitizing sensitive test data.
    """

    def __init__(self, correlation_id: str, environment: str):
        """
        Initialize the test log filter with correlation ID and environment marker.

        Args:
            correlation_id: Unique identifier for test session
            environment: Test environment marker
        """
        super().__init__()
        self._correlation_id = correlation_id
        self._environment = environment
        self._sensitive_patterns = {
            'password', 'token', 'api_key', 'secret',
            'auth', 'credential', 'test_data'
        }

    def filter(self, record: logging.LogRecord) -> bool:
        """
        Filter and enhance log records with correlation ID and environment marker.

        Args:
            record: Log record to be filtered and enhanced

        Returns:
            bool: True to include the record in log output
        """
        # Add correlation ID and environment to record
        record.correlation_id = self._correlation_id
        record.environment = self._environment

        # Sanitize sensitive data in log message
        if hasattr(record, 'msg'):
            for pattern in self._sensitive_patterns:
                if pattern in str(record.msg).lower():
                    record.msg = str(record.msg).replace(
                        str(getattr(record, 'msg')),
                        '***REDACTED***'
                    )

        return True

def validate_log_directory(log_dir: str) -> bool:
    """
    Validate and ensure proper setup of the test log directory with appropriate permissions.

    Args:
        log_dir: Path to the test log directory

    Returns:
        bool: True if directory is properly configured

    Raises:
        OSError: If directory cannot be created or lacks proper permissions
    """
    try:
        # Create log directory if it doesn't exist
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)

        # Set secure permissions
        log_path.chmod(0o755)

        # Validate write permissions
        test_file = log_path / '.test_write'
        test_file.touch()
        test_file.unlink()

        # Check available disk space (minimum 100MB)
        stats = os.statvfs(log_dir)
        available_space = stats.f_frsize * stats.f_bavail
        if available_space < 100 * 1024 * 1024:
            raise OSError("Insufficient disk space for test logs")

        return True

    except Exception as e:
        raise OSError(f"Failed to configure test log directory: {str(e)}")

def configure_root_logger() -> logging.Logger:
    """
    Configure the root logger for the entire test suite with enhanced capabilities
    including log rotation, correlation IDs, environment detection, and thread-safety.

    Returns:
        logging.Logger: Configured root logger instance for test suite
    """
    try:
        # Generate unique correlation ID for test session
        correlation_id = str(uuid.uuid4())

        # Validate test environment
        if TEST_ENV_MARKER not in {'development', 'staging', 'ci'}:
            raise ValueError(f"Invalid test environment: {TEST_ENV_MARKER}")

        # Validate and configure log directory
        validate_log_directory(TEST_LOG_DIR)

        # Configure log file path
        log_file = os.path.join(TEST_LOG_DIR, f"test_suite_{TEST_ENV_MARKER}.log")

        # Initialize root logger with enhanced configuration
        logger = setup_logging(
            log_level=TEST_LOG_LEVEL,
            log_file_path=log_file,
            additional_context={
                'test_session_id': correlation_id,
                'test_environment': TEST_ENV_MARKER
            },
            enable_async=True
        )

        # Add custom test log filter
        test_filter = TestLogFilter(correlation_id, TEST_ENV_MARKER)
        for handler in logger.handlers:
            handler.addFilter(test_filter)

        # Configure thread-local storage for correlation ID
        threading.local().correlation_id = correlation_id

        logger.debug(
            "Test suite logging configured",
            extra={
                'correlation_id': correlation_id,
                'environment': TEST_ENV_MARKER
            }
        )

        return logger

    except Exception as e:
        # Fallback to basic logging if enhanced configuration fails
        basic_logger = logging.getLogger()
        basic_logger.setLevel(logging.ERROR)
        basic_logger.error(f"Failed to configure test suite logging: {str(e)}")
        return basic_logger

# Initialize test suite logging on module import
root_logger = configure_root_logger()

# Export public interface
__all__ = [
    'configure_root_logger',
    'TestLogFilter',
    'root_logger'
]