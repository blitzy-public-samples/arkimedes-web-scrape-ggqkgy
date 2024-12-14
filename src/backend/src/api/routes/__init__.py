"""
FastAPI routes initialization module that aggregates and exports all API route handlers
with comprehensive error handling, versioning, and OpenAPI documentation support.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from typing import Dict, Any

# Third-party imports
from fastapi import APIRouter, HTTPException, Request, status  # v0.100.0
from fastapi.responses import JSONResponse

# Internal route imports
from .health import router as health_router
from .metrics import router as metrics_router
from .tasks import router as tasks_router
from .data import router as data_router

# Initialize main API router with versioning and documentation
api_router = APIRouter(
    prefix="/api/v1",
    tags=["api"],
    responses={
        404: {"description": "Not found"},
        500: {"description": "Internal server error"}
    }
)

# OpenAPI documentation metadata
API_TAGS_METADATA = [
    {
        "name": "health",
        "description": "System health check and monitoring endpoints"
    },
    {
        "name": "metrics",
        "description": "Performance metrics and system statistics endpoints"
    },
    {
        "name": "tasks",
        "description": "Web scraping task management and execution endpoints"
    },
    {
        "name": "data",
        "description": "Scraped data access and export endpoints"
    }
]

def setup_error_handlers(router: APIRouter) -> None:
    """
    Configure comprehensive error handlers for the API router.
    
    Args:
        router: FastAPI router instance to configure
    """
    
    @router.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        """Handle HTTP exceptions with detailed error responses."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.status_code,
                    "message": exc.detail,
                    "type": "http_error",
                    "path": str(request.url)
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        )

    @router.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Handle unexpected exceptions with secure error responses."""
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "message": "Internal server error",
                    "type": "server_error",
                    "path": str(request.url)
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        )

    @router.exception_handler(ValidationError)
    async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
        """Handle request validation errors with detailed feedback."""
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "message": "Validation error",
                    "type": "validation_error",
                    "details": exc.errors(),
                    "path": str(request.url)
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        )

# Configure error handlers
setup_error_handlers(api_router)

# Include sub-routers with proper prefixes
api_router.include_router(
    health_router,
    prefix="/health",
    tags=["health"]
)

api_router.include_router(
    metrics_router,
    prefix="/metrics",
    tags=["metrics"]
)

api_router.include_router(
    tasks_router,
    prefix="/tasks",
    tags=["tasks"]
)

api_router.include_router(
    data_router,
    prefix="/data",
    tags=["data"]
)

# Export public interface
__all__ = [
    "api_router",
    "API_TAGS_METADATA"
]