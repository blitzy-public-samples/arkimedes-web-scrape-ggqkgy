# Standard library imports - Python 3.11+ compatible
import asyncio
import functools
import time
import random
from typing import Callable, TypeVar, Optional, Tuple, Any, Union

# Internal imports
from .logging import get_logger

# Type variables for generic function signatures
T = TypeVar('T')
F = TypeVar('F', bound=Callable[..., Any])

# Default retry configuration constants
DEFAULT_MAX_RETRIES = 3
DEFAULT_INITIAL_DELAY = 1.0
DEFAULT_MAX_DELAY = 60.0
DEFAULT_BACKOFF_FACTOR = 2.0
DEFAULT_JITTER_FACTOR = 0.1

def calculate_delay(
    attempt: int,
    initial_delay: float,
    max_delay: float,
    backoff_factor: float,
    jitter_factor: float
) -> float:
    """
    Calculate the next retry delay using exponential backoff with jitter.
    
    Args:
        attempt: Current retry attempt number
        initial_delay: Base delay in seconds
        max_delay: Maximum delay cap in seconds
        backoff_factor: Exponential multiplier for backoff
        jitter_factor: Random jitter factor (0-1) to prevent thundering herd
        
    Returns:
        float: Calculated delay in seconds with jitter
        
    Raises:
        ValueError: If input parameters are invalid
    """
    if attempt < 0 or initial_delay <= 0 or max_delay <= 0 or backoff_factor <= 1:
        raise ValueError("Invalid retry parameters")
        
    # Calculate base delay with exponential backoff
    delay = min(initial_delay * (backoff_factor ** attempt), max_delay)
    
    # Apply random jitter to prevent thundering herd
    jitter = random.uniform(-jitter_factor, jitter_factor)
    final_delay = delay * (1 + jitter)
    
    # Ensure we don't exceed max_delay even with jitter
    return min(final_delay, max_delay)

def retry(
    max_retries: int = DEFAULT_MAX_RETRIES,
    initial_delay: float = DEFAULT_INITIAL_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
    backoff_factor: float = DEFAULT_BACKOFF_FACTOR,
    exceptions: Tuple[Exception, ...] = (Exception,)
) -> Callable[[F], F]:
    """
    Decorator implementing synchronous retry logic with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay between retries in seconds
        max_delay: Maximum delay cap in seconds
        backoff_factor: Exponential multiplier for backoff
        exceptions: Tuple of exceptions to catch and retry
        
    Returns:
        Callable: Decorated function with retry logic
        
    Example:
        @retry(max_retries=3, exceptions=(ConnectionError, TimeoutError))
        def fetch_data():
            # Function implementation
            pass
    """
    def decorator(func: F) -> F:
        logger = get_logger(
            f"{func.__module__}.{func.__name__}",
            {"operation": "retry", "function": func.__name__}
        )
        
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exception = None
            start_time = time.time()
            
            for attempt in range(max_retries + 1):
                try:
                    if attempt > 0:
                        logger.info(
                            f"Retry attempt {attempt}/{max_retries}",
                            extra={
                                "attempt": attempt,
                                "max_retries": max_retries,
                                "function": func.__name__
                            }
                        )
                    
                    result = func(*args, **kwargs)
                    
                    if attempt > 0:
                        logger.info(
                            f"Successful after {attempt} retries",
                            extra={
                                "total_attempts": attempt + 1,
                                "total_time": time.time() - start_time
                            }
                        )
                    
                    return result
                    
                except exceptions as e:
                    last_exception = e
                    if attempt == max_retries:
                        logger.error(
                            f"Max retries ({max_retries}) exceeded",
                            extra={
                                "exception": str(e),
                                "total_time": time.time() - start_time
                            },
                            exc_info=True
                        )
                        raise
                    
                    delay = calculate_delay(
                        attempt,
                        initial_delay,
                        max_delay,
                        backoff_factor,
                        DEFAULT_JITTER_FACTOR
                    )
                    
                    logger.warning(
                        f"Operation failed, retrying in {delay:.2f}s",
                        extra={
                            "exception": str(e),
                            "delay": delay,
                            "attempt": attempt
                        }
                    )
                    
                    time.sleep(delay)
            
            # This should never be reached due to the raise in the loop
            raise last_exception  # type: ignore
            
        return wrapper  # type: ignore
    
    return decorator

class AsyncRetry:
    """
    Class implementing asynchronous retry logic with exponential backoff.
    
    Example:
        @AsyncRetry(max_retries=3)
        async def fetch_data():
            # Async function implementation
            pass
    """
    
    def __init__(
        self,
        max_retries: int = DEFAULT_MAX_RETRIES,
        initial_delay: float = DEFAULT_INITIAL_DELAY,
        max_delay: float = DEFAULT_MAX_DELAY,
        backoff_factor: float = DEFAULT_BACKOFF_FACTOR,
        exceptions: Tuple[Exception, ...] = (Exception,)
    ) -> None:
        """Initialize AsyncRetry with retry configuration."""
        self._max_retries = max_retries
        self._initial_delay = initial_delay
        self._max_delay = max_delay
        self._backoff_factor = backoff_factor
        self._exceptions = exceptions
        self._logger = get_logger("AsyncRetry")
        
    def __call__(self, func: Callable[..., Any]) -> Callable[..., Any]:
        """Implement callable interface for decorator pattern."""
        
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exception = None
            start_time = time.time()
            
            for attempt in range(self._max_retries + 1):
                try:
                    if attempt > 0:
                        self._logger.info(
                            f"Async retry attempt {attempt}/{self._max_retries}",
                            extra={
                                "attempt": attempt,
                                "max_retries": self._max_retries,
                                "function": func.__name__
                            }
                        )
                    
                    result = await func(*args, **kwargs)
                    
                    if attempt > 0:
                        self._logger.info(
                            f"Async operation successful after {attempt} retries",
                            extra={
                                "total_attempts": attempt + 1,
                                "total_time": time.time() - start_time
                            }
                        )
                    
                    return result
                    
                except self._exceptions as e:
                    last_exception = e
                    if attempt == self._max_retries:
                        self._logger.error(
                            f"Async max retries ({self._max_retries}) exceeded",
                            extra={
                                "exception": str(e),
                                "total_time": time.time() - start_time
                            },
                            exc_info=True
                        )
                        raise
                    
                    delay = calculate_delay(
                        attempt,
                        self._initial_delay,
                        self._max_delay,
                        self._backoff_factor,
                        DEFAULT_JITTER_FACTOR
                    )
                    
                    self._logger.warning(
                        f"Async operation failed, retrying in {delay:.2f}s",
                        extra={
                            "exception": str(e),
                            "delay": delay,
                            "attempt": attempt
                        }
                    )
                    
                    await asyncio.sleep(delay)
            
            # This should never be reached due to the raise in the loop
            raise last_exception  # type: ignore
            
        return wrapper

# Export public interface
__all__ = ['retry', 'AsyncRetry', 'calculate_delay']