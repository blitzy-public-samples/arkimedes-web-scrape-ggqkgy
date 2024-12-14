"""
API-specific logging configuration module with enhanced security features and performance monitoring.
Extends core logging utilities with FastAPI context, request tracing, and security capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
import logging
import time
import uuid
from typing import Dict, Any, Callable
from contextvars import ContextVar
from functools import wraps

# Third-party imports
from fastapi import FastAPI  # v0.100.0
from starlette.requests import Request  # v0.27.0
from starlette.responses import Response  # v0.27.0

# Internal imports
from ../../utils.logging import setup_logging, JSONFormatter
from .config import settings

# Constants
API_LOGGER_NAME = 'api'
REQUEST_ID_HEADER = 'X-Request-ID'
CORRELATION_ID_HEADER = 'X-Correlation-ID'

# Context storage
request_context: ContextVar[Dict[str, Any]] = ContextVar('request_context', default={})

class RequestContextMiddleware:
    """
    Enhanced ASGI middleware for request context tracking with security features.
    Adds request ID, correlation ID, and performance metrics to each request.
    """
    
    def __init__(self, app: FastAPI, context_defaults: Dict[str, Any] = None) -> None:
        """
        Initialize middleware with application and default context.
        
        Args:
            app: FastAPI application instance
            context_defaults: Default context values
        """
        self.app = app
        self._context_defaults = context_defaults or {}
        
    async def __call__(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and enhance context with security and performance data.
        
        Args:
            request: Incoming request
            call_next: Next middleware in chain
            
        Returns:
            Response with added context headers
        """
        # Generate or extract request ID
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        correlation_id = request.headers.get(CORRELATION_ID_HEADER) or str(uuid.uuid4())
        
        # Initialize request context
        context = {
            'request_id': request_id,
            'correlation_id': correlation_id,
            'method': request.method,
            'path': request.url.path,
            'client_ip': request.client.host,
            'user_agent': request.headers.get('user-agent', ''),
            'environment': settings.ENVIRONMENT,
            **self._context_defaults
        }
        
        # Set context token
        token = request_context.set(context)
        start_time = time.time()
        
        try:
            # Process request
            response = await call_next(request)
            
            # Add performance metrics
            duration = time.time() - start_time
            context['duration'] = duration
            context['status_code'] = response.status_code
            
            # Add context headers
            response.headers[REQUEST_ID_HEADER] = request_id
            response.headers[CORRELATION_ID_HEADER] = correlation_id
            
            return response
            
        except Exception as e:
            # Log error with context
            context['error'] = str(e)
            context['error_type'] = type(e).__name__
            raise
            
        finally:
            # Clean up context
            request_context.reset(token)

class APILogger(logging.Logger):
    """
    Enhanced logger class with API-specific context and security features.
    Provides structured logging with request tracking and performance monitoring.
    """
    
    def __init__(self, name: str, initial_context: Dict[str, Any] = None) -> None:
        """
        Initialize API logger with enhanced context.
        
        Args:
            name: Logger name
            initial_context: Initial context values
        """
        super().__init__(name)
        self.context = initial_context or {}
        self.security_context = {}
        
    def with_context(self, context: Dict[str, Any], inherit: bool = True) -> 'APILogger':
        """
        Create new logger instance with additional context.
        
        Args:
            context: Additional context to add
            inherit: Whether to inherit existing context
            
        Returns:
            New logger instance with updated context
        """
        new_context = self.context.copy() if inherit else {}
        new_context.update(context)
        
        logger = APILogger(self.name, new_context)
        logger.handlers = self.handlers
        logger.level = self.level
        
        return logger
        
    def log_with_metrics(self, level: int, msg: str, extra: Dict[str, Any] = None) -> None:
        """
        Log message with performance metrics and security context.
        
        Args:
            level: Log level
            msg: Log message
            extra: Additional log data
        """
        extra = extra or {}
        
        # Add request context
        try:
            ctx = request_context.get()
            extra.update(ctx)
        except LookupError:
            pass
            
        # Add security context
        extra.update(self.security_context)
        
        # Add logger context
        extra.update(self.context)
        
        super().log(level, msg, extra=extra)

def setup_api_logging(app: FastAPI, config: Dict[str, Any] = None) -> None:
    """
    Configure API logging with security features and request tracking.
    
    Args:
        app: FastAPI application instance
        config: Additional configuration options
    """
    config = config or {}
    
    # Set up base logging
    logger = setup_logging(
        log_level=settings.LOG_LEVEL,
        additional_context={'environment': settings.ENVIRONMENT}
    )
    
    # Configure API logger
    api_logger = APILogger(API_LOGGER_NAME)
    api_logger.setLevel(settings.LOG_LEVEL if not settings.DEBUG else logging.DEBUG)
    
    # Add JSON formatter
    formatter = JSONFormatter(
        default_fields={'app': 'web_scraping_platform_api'},
        sensitive_fields={'password', 'token', 'auth', 'api_key'}
    )
    
    for handler in logger.handlers:
        handler.setFormatter(formatter)
        api_logger.addHandler(handler)
    
    # Add middleware
    app.middleware('http')(RequestContextMiddleware(app, config.get('context_defaults')))
    
    # Store logger in app state
    app.state.logger = api_logger

def get_api_logger(module_name: str, initial_context: Dict[str, Any] = None) -> APILogger:
    """
    Get API logger instance with module context.
    
    Args:
        module_name: Module requesting logger
        initial_context: Initial context values
        
    Returns:
        Configured API logger instance
    """
    logger = APILogger(f"{API_LOGGER_NAME}.{module_name}", initial_context)
    logger.setLevel(settings.LOG_LEVEL if not settings.DEBUG else logging.DEBUG)
    
    # Add handlers from root logger
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        logger.addHandler(handler)
    
    return logger

# Export public interface
__all__ = [
    'setup_api_logging',
    'get_api_logger',
    'RequestContextMiddleware',
    'APILogger'
]