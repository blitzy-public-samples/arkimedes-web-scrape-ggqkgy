"""
Health check route handler providing comprehensive system monitoring endpoints.
Implements real-time health status and detailed performance metrics collection.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from typing import Dict, Any, Optional
import time
from datetime import datetime

# Third-party imports with versions
from fastapi import APIRouter, HTTPException, status  # v0.100.0
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry  # v0.17.0

# Internal imports
from ..core.config import settings
from ...services.metrics import MetricsCollector

# Initialize router with prefix and tags
router = APIRouter(
    prefix=f"{settings.API_V1_PREFIX}/health",
    tags=["health"]
)

# Initialize metrics collector with 60s collection interval and 24h retention
metrics_collector = MetricsCollector(collection_interval=60, retention_period=86400)

# Define warning thresholds for system components
COMPONENT_THRESHOLDS = {
    "cpu_warning": 80,  # CPU usage warning threshold (%)
    "memory_warning": 85,  # Memory usage warning threshold (%)
    "storage_warning": 90,  # Storage usage warning threshold (%)
    "latency_warning": 200  # API latency warning threshold (ms)
}

# Initialize Prometheus metrics
REGISTRY = CollectorRegistry()
health_check_counter = Counter(
    "health_check_total",
    "Total number of health check requests",
    ["endpoint", "status"],
    registry=REGISTRY
)
health_check_latency = Histogram(
    "health_check_latency_seconds",
    "Health check request latency",
    ["endpoint"],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0),
    registry=REGISTRY
)

@router.get("/", status_code=status.HTTP_200_OK)
@metrics_collector.track_endpoint_usage
async def get_health() -> Dict[str, Any]:
    """
    Basic health check endpoint providing system status and version information.
    
    Returns:
        Dict containing basic health status and API information
    """
    try:
        start_time = time.time()
        
        response = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "version": settings.PROJECT_NAME,
            "api_version": settings.API_V1_PREFIX.strip("/"),
            "environment": settings.DEBUG and "development" or "production"
        }
        
        # Record metrics
        duration = time.time() - start_time
        health_check_counter.labels(endpoint="basic", status="success").inc()
        health_check_latency.labels(endpoint="basic").observe(duration)
        
        return response
        
    except Exception as e:
        health_check_counter.labels(endpoint="basic", status="error").inc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Health check failed: {str(e)}"
        )

@router.get("/detailed", status_code=status.HTTP_200_OK)
@metrics_collector.track_endpoint_usage
async def get_detailed_health(period: Optional[int] = 3600) -> Dict[str, Any]:
    """
    Comprehensive health check providing detailed system metrics and component status.
    
    Args:
        period: Time period in seconds for metrics aggregation (default: 1 hour)
        
    Returns:
        Dict containing detailed system health metrics and component status
    """
    try:
        start_time = time.time()
        
        # Collect system metrics
        system_metrics = await metrics_collector.collect_system_metrics()
        
        # Aggregate metrics over specified period
        aggregated_metrics = await metrics_collector.aggregate_metrics(period)
        
        # Check component status against thresholds
        component_status = {
            "cpu": {
                "status": "healthy" if system_metrics["cpu_percent"] < COMPONENT_THRESHOLDS["cpu_warning"] else "warning",
                "value": system_metrics["cpu_percent"],
                "threshold": COMPONENT_THRESHOLDS["cpu_warning"]
            },
            "memory": {
                "status": "healthy" if system_metrics["memory_percent"] < COMPONENT_THRESHOLDS["memory_warning"] else "warning",
                "value": system_metrics["memory_percent"],
                "threshold": COMPONENT_THRESHOLDS["memory_warning"]
            },
            "storage": {
                "status": "healthy" if system_metrics["disk_usage"]["percent"] < COMPONENT_THRESHOLDS["storage_warning"] else "warning",
                "value": system_metrics["disk_usage"]["percent"],
                "threshold": COMPONENT_THRESHOLDS["storage_warning"]
            }
        }
        
        response = {
            "status": all(c["status"] == "healthy" for c in component_status.values()) and "healthy" or "warning",
            "timestamp": datetime.utcnow().isoformat(),
            "components": component_status,
            "metrics": {
                "current": system_metrics,
                "aggregated": aggregated_metrics
            },
            "performance": {
                "api_latency": aggregated_metrics.get("api_latency_avg", 0),
                "task_success_rate": aggregated_metrics.get("task_success_rate", 100),
                "error_rate": aggregated_metrics.get("error_rate", 0)
            }
        }
        
        # Record metrics
        duration = time.time() - start_time
        health_check_counter.labels(endpoint="detailed", status="success").inc()
        health_check_latency.labels(endpoint="detailed").observe(duration)
        
        return response
        
    except Exception as e:
        health_check_counter.labels(endpoint="detailed", status="error").inc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Detailed health check failed: {str(e)}"
        )

@router.get("/{component_name}", status_code=status.HTTP_200_OK)
@metrics_collector.track_endpoint_usage
async def get_component_health(component_name: str, period: Optional[int] = 1800) -> Dict[str, Any]:
    """
    Detailed health status for a specific system component with historical data.
    
    Args:
        component_name: Name of the component to check
        period: Time period in seconds for metrics aggregation (default: 30 minutes)
        
    Returns:
        Dict containing component-specific health metrics and historical data
        
    Raises:
        HTTPException: If component is not found or metrics collection fails
    """
    try:
        start_time = time.time()
        
        # Validate component name
        valid_components = {"cpu", "memory", "storage", "network", "tasks", "database", "cache"}
        if component_name not in valid_components:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Component not found: {component_name}"
            )
        
        # Collect component-specific metrics
        component_metrics = await metrics_collector.collect_component_metrics(
            component_name,
            period
        )
        
        # Calculate component health status
        threshold = COMPONENT_THRESHOLDS.get(f"{component_name}_warning", 80)
        current_value = component_metrics["current"]["value"]
        health_status = "healthy" if current_value < threshold else "warning"
        
        response = {
            "component": component_name,
            "status": health_status,
            "timestamp": datetime.utcnow().isoformat(),
            "current": {
                "value": current_value,
                "threshold": threshold,
                "status": health_status
            },
            "historical": component_metrics["historical"],
            "trends": component_metrics["trends"],
            "recommendations": component_metrics.get("recommendations", [])
        }
        
        # Record metrics
        duration = time.time() - start_time
        health_check_counter.labels(endpoint="component", status="success").inc()
        health_check_latency.labels(endpoint="component").observe(duration)
        
        return response
        
    except HTTPException:
        health_check_counter.labels(endpoint="component", status="not_found").inc()
        raise
    except Exception as e:
        health_check_counter.labels(endpoint="component", status="error").inc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Component health check failed: {str(e)}"
        )