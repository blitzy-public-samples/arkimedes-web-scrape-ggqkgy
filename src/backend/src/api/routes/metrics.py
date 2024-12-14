"""
FastAPI route handlers for system metrics, task performance metrics, and scraping statistics.
Implements enhanced caching, security, and Prometheus export capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from datetime import datetime, timedelta
from typing import Dict, Optional

# Third-party imports
from fastapi import APIRouter, Depends, HTTPException, status, Response  # v0.100.0
from prometheus_client import (  # v0.17.0
    generate_latest,
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram
)

# Internal imports
from ..core.dependencies import get_current_user
from ...services.metrics import MetricsCollector

# Initialize router with prefix and tags
router = APIRouter(prefix="/metrics", tags=["Metrics"])

# Initialize metrics collector with 5-minute cache TTL
metrics_collector = MetricsCollector(cache_ttl=300)

# Prometheus metrics
SCRAPING_TASKS = Counter(
    "web_scraper_tasks_total",
    "Total number of scraping tasks executed",
    ["status"]
)

SYSTEM_RESOURCES = Gauge(
    "web_scraper_system_resources",
    "System resource utilization metrics",
    ["resource_type"]
)

TASK_DURATION = Histogram(
    "web_scraper_task_duration_seconds",
    "Task execution duration in seconds",
    buckets=(1, 5, 10, 30, 60, 120, 300, 600)
)

@router.get("/system")
async def get_system_metrics(
    current_user: Dict = Depends(get_current_user),
    skip_cache: bool = False
) -> Dict:
    """
    Get current system resource utilization metrics with caching and validation.
    
    Args:
        current_user: Authenticated user information
        skip_cache: Flag to bypass cache
        
    Returns:
        Dict containing validated system metrics
        
    Raises:
        HTTPException: If user lacks permissions or metrics collection fails
    """
    try:
        # Verify metrics access permission
        if "metrics:read" not in current_user.get("permissions", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to access metrics"
            )

        # Try to get metrics from cache
        if not skip_cache:
            cached_metrics = await metrics_collector.get_cached_metrics("system")
            if cached_metrics:
                return cached_metrics

        # Collect fresh system metrics
        metrics = await metrics_collector.collect_all_metrics()
        
        # Validate metrics
        validated_metrics = await metrics_collector.validate_metrics(metrics)
        
        # Update Prometheus metrics
        SYSTEM_RESOURCES.labels("cpu").set(validated_metrics["cpu_percent"])
        SYSTEM_RESOURCES.labels("memory").set(validated_metrics["memory_percent"])
        SYSTEM_RESOURCES.labels("disk").set(validated_metrics["disk_percent"])
        
        return {
            "metrics": validated_metrics,
            "timestamp": datetime.utcnow().isoformat(),
            "cached": False
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to collect system metrics: {str(e)}"
        )

@router.get("/tasks")
async def get_task_metrics(
    current_user: Dict = Depends(get_current_user),
    time_window: int = 3600,
    aggregation: str = "avg"
) -> Dict:
    """
    Get detailed task execution performance metrics with trend analysis.
    
    Args:
        current_user: Authenticated user information
        time_window: Time window in seconds (max 24 hours)
        aggregation: Aggregation method (avg, min, max, sum)
        
    Returns:
        Dict containing aggregated task metrics with trends
        
    Raises:
        HTTPException: If parameters are invalid or metrics collection fails
    """
    try:
        # Verify metrics access permission
        if "metrics:read" not in current_user.get("permissions", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to access metrics"
            )

        # Validate time window
        max_window = 24 * 3600  # 24 hours
        if time_window <= 0 or time_window > max_window:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Time window must be between 1 and {max_window} seconds"
            )

        # Calculate time range
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(seconds=time_window)

        # Get cached task metrics
        cache_key = f"task_metrics:{time_window}:{aggregation}"
        cached_metrics = await metrics_collector.get_cached_metrics(cache_key)
        if cached_metrics:
            return cached_metrics

        # Collect and aggregate task metrics
        metrics = await metrics_collector.collect_all_metrics()
        
        # Update Prometheus metrics
        SCRAPING_TASKS.labels("success").inc(metrics["successful_tasks"])
        SCRAPING_TASKS.labels("failed").inc(metrics["failed_tasks"])
        TASK_DURATION.observe(metrics["avg_duration"])

        return {
            "metrics": metrics,
            "trends": {
                "success_rate": metrics["success_rate"],
                "throughput": metrics["tasks_per_minute"],
                "avg_duration": metrics["avg_duration"]
            },
            "time_range": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            },
            "aggregation": aggregation
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to collect task metrics: {str(e)}"
        )

@router.get("/scraping")
async def get_scraping_metrics(
    current_user: Dict = Depends(get_current_user),
    time_window: int = 3600,
    include_errors: bool = True
) -> Dict:
    """
    Get comprehensive web scraping performance metrics with error analysis.
    
    Args:
        current_user: Authenticated user information
        time_window: Time window in seconds
        include_errors: Include error analysis in metrics
        
    Returns:
        Dict containing detailed scraping metrics
        
    Raises:
        HTTPException: If metrics collection fails
    """
    try:
        # Verify metrics access permission
        if "metrics:read" not in current_user.get("permissions", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to access metrics"
            )

        # Calculate time range
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(seconds=time_window)

        # Collect scraping metrics
        metrics = await metrics_collector.collect_all_metrics()
        
        # Analyze error patterns if requested
        error_analysis = None
        if include_errors and metrics.get("errors"):
            error_analysis = {
                "patterns": metrics["error_patterns"],
                "top_errors": metrics["top_errors"],
                "error_rate": metrics["error_rate"]
            }

        return {
            "metrics": {
                "pages_processed": metrics["pages_processed"],
                "success_rate": metrics["success_rate"],
                "avg_processing_time": metrics["avg_processing_time"],
                "throughput": metrics["pages_per_minute"]
            },
            "error_analysis": error_analysis,
            "recommendations": metrics.get("recommendations", []),
            "time_range": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to collect scraping metrics: {str(e)}"
        )

@router.get("/prometheus")
async def export_prometheus(
    current_user: Dict = Depends(get_current_user)
) -> Response:
    """
    Export all metrics in Prometheus format with proper type conversion.
    
    Args:
        current_user: Authenticated user information
        
    Returns:
        Response containing Prometheus formatted metrics
        
    Raises:
        HTTPException: If metrics export fails
    """
    try:
        # Verify metrics access permission
        if "metrics:read" not in current_user.get("permissions", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to access metrics"
            )

        # Generate Prometheus format metrics
        prometheus_metrics = generate_latest()
        
        return Response(
            content=prometheus_metrics,
            media_type=CONTENT_TYPE_LATEST
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export Prometheus metrics: {str(e)}"
        )