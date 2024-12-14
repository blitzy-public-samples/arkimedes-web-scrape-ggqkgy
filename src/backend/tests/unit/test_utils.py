# Standard library imports
import asyncio
import json
import logging
import time
from datetime import datetime
from unittest.mock import Mock, patch

# Third-party imports
import pytest  # v7.4.0
import pytest_asyncio  # v0.21.0
from freezegun import freeze_time  # v1.2.2
from pytest_mock import MockerFixture  # v3.11.1

# Internal imports
from src.utils.logging import setup_logging, JSONFormatter, get_logger
from src.utils.validation import validate_url, validate_json_schema, sanitize_html, DataValidator
from src.utils.encryption import generate_key, encrypt, decrypt, EncryptionError
from src.utils.retry import retry, AsyncRetry, calculate_delay
from src.utils.concurrency import ResourcePool, TaskPool

# Test configuration
@pytest.fixture(scope="session", autouse=True)
def configure_test_logging():
    """Configure logging for test execution."""
    logger = setup_logging(
        log_level=logging.DEBUG,
        additional_context={"environment": "test"}
    )
    return logger

class TestLogging:
    """Test suite for logging functionality."""

    @pytest.fixture
    def json_formatter(self):
        """Fixture for JSONFormatter instance."""
        return JSONFormatter()

    def test_setup_logging_configuration(self):
        """Test logging setup with various configurations."""
        logger = setup_logging(log_level=logging.INFO)
        
        assert logger.level == logging.INFO
        assert len(logger.handlers) > 0
        assert any(isinstance(h, logging.StreamHandler) for h in logger.handlers)

    def test_json_formatter_output(self, json_formatter):
        """Test JSON formatter output structure and content."""
        test_record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname="test_file.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None
        )
        
        formatted = json_formatter.format(test_record)
        parsed = json.loads(formatted)
        
        assert "timestamp" in parsed
        assert parsed["level"] == "INFO"
        assert parsed["message"] == "Test message"
        assert "module" in parsed

    def test_sensitive_data_masking(self, json_formatter):
        """Test masking of sensitive information in logs."""
        test_record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname="test_file.py",
            lineno=1,
            msg={"password": "secret123", "api_key": "abc123"},
            args=(),
            exc_info=None
        )
        
        formatted = json_formatter.format(test_record)
        parsed = json.loads(formatted)
        
        assert "***REDACTED***" in str(parsed)
        assert "secret123" not in str(parsed)
        assert "abc123" not in str(parsed)

class TestValidation:
    """Test suite for validation utilities."""

    @pytest.mark.parametrize("url,expected", [
        ("https://example.com", True),
        ("http://sub.example.com/path", True),
        ("not_a_url", False),
        ("ftp://invalid.com", False),
        ("https://" + "a" * 2050, False)  # Test URL length limit
    ])
    def test_url_validation(self, url, expected):
        """Test URL validation with various inputs."""
        is_valid, error = validate_url(url)
        assert is_valid == expected
        if not expected:
            assert error is not None

    def test_json_schema_validation(self):
        """Test JSON schema validation."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string", "required": True},
                "age": {"type": "integer"}
            }
        }
        
        valid_data = {"name": "Test", "age": 25}
        invalid_data = {"age": "invalid"}
        
        is_valid, _ = validate_json_schema(valid_data, schema, "1.0")
        assert is_valid
        
        is_valid, error = validate_json_schema(invalid_data, schema, "1.0")
        assert not is_valid
        assert error is not None

    def test_html_sanitization(self):
        """Test HTML content sanitization."""
        unsafe_html = '<script>alert("xss")</script><p onclick="evil()">Safe text</p>'
        safe_html = sanitize_html(unsafe_html)
        
        assert "<script>" not in safe_html
        assert "onclick" not in safe_html
        assert "Safe text" in safe_html

class TestEncryption:
    """Test suite for encryption utilities."""

    @pytest.fixture
    def encryption_key(self):
        """Fixture for encryption key."""
        return generate_key()

    def test_key_generation(self):
        """Test encryption key generation."""
        key = generate_key()
        assert len(key) == 32  # AES-256 key length
        assert isinstance(key, bytes)

    def test_encryption_decryption_cycle(self, encryption_key):
        """Test complete encryption/decryption cycle."""
        test_data = b"Sensitive information"
        
        # Encrypt data
        encrypted = encrypt(encryption_key, test_data)
        assert isinstance(encrypted, str)
        assert encrypted != test_data
        
        # Decrypt data
        decrypted = decrypt(encryption_key, encrypted)
        assert decrypted == test_data

    def test_encryption_error_handling(self, encryption_key):
        """Test encryption error scenarios."""
        with pytest.raises(EncryptionError):
            encrypt(b"short_key", b"data")
            
        with pytest.raises(EncryptionError):
            decrypt(encryption_key, "invalid_data")

class TestRetry:
    """Test suite for retry mechanisms."""

    def test_calculate_delay(self):
        """Test retry delay calculation."""
        delay = calculate_delay(
            attempt=1,
            initial_delay=1.0,
            max_delay=60.0,
            backoff_factor=2.0,
            jitter_factor=0.1
        )
        assert 0.9 <= delay <= 2.2  # Account for jitter

    @pytest.mark.asyncio
    async def test_async_retry_mechanism(self):
        """Test async retry decorator."""
        mock_func = Mock(side_effect=[Exception("Temp error"), "success"])
        
        @AsyncRetry(max_retries=2, initial_delay=0.1)
        async def test_func():
            return mock_func()
            
        result = await test_func()
        assert result == "success"
        assert mock_func.call_count == 2

    def test_sync_retry_mechanism(self):
        """Test synchronous retry decorator."""
        mock_func = Mock(side_effect=[ValueError, ConnectionError, "success"])
        
        @retry(max_retries=3, initial_delay=0.1)
        def test_func():
            return mock_func()
            
        result = test_func()
        assert result == "success"
        assert mock_func.call_count == 3

class TestConcurrency:
    """Test suite for concurrency utilities."""

    @pytest.mark.asyncio
    async def test_resource_pool(self):
        """Test resource pool management."""
        pool = ResourcePool(max_size=2)
        
        # Test resource acquisition
        resource1 = await pool.acquire(resource_id="test1")
        assert resource1 is not None
        
        # Test resource release
        success = await pool.release(resource1, "test1")
        assert success

    @pytest.mark.asyncio
    async def test_task_pool(self):
        """Test task pool management."""
        pool = TaskPool(max_concurrent_tasks=2)
        
        # Test task acquisition
        success = await pool.acquire("task1", timeout=1.0)
        assert success
        
        # Test task release
        success = await pool.release("task1")
        assert success

    @pytest.mark.asyncio
    async def test_pool_timeout(self):
        """Test pool timeout behavior."""
        pool = ResourcePool(max_size=1)
        
        # Acquire first resource
        resource1 = await pool.acquire(resource_id="test1")
        assert resource1 is not None
        
        # Attempt to acquire second resource should timeout
        with pytest.raises(TimeoutError):
            await pool.acquire(resource_id="test2", timeout=0.1)

@pytest.mark.benchmark
def test_performance_benchmarks(benchmark):
    """Performance benchmarks for core utilities."""
    
    def benchmark_encryption():
        key = generate_key()
        data = b"Performance test data" * 100
        encrypted = encrypt(key, data)
        decrypt(key, encrypted)
    
    result = benchmark(benchmark_encryption)
    assert result.stats.mean < 0.1  # Maximum 100ms average

if __name__ == "__main__":
    pytest.main(["-v", "--benchmark-only"])