"""
Metrics collection and monitoring service for the web scraping platform.
Handles performance metrics, system health monitoring, and operational statistics
using Prometheus and Redis for storage.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import time
from typing import Dict, Any, Optional
import psutil  # v5.9.0
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry  # v0.17.0
import threading

# Internal imports
from ..api.core.config import get_redis_uri
from ..utils.logging import get_logger
from .cache import CacheService

# Constants for metrics configuration
METRICS_PREFIX = 'web_scraper'
METRICS_CACHE_TTL = 300  # 5 minutes
SYSTEM_METRICS_INTERVAL = 60  # 1 minute

class MetricsService:
    """
    Service for collecting and exposing system and application metrics with support
    for high-concurrency operations, efficient caching, and detailed resource monitoring.
    """

    def __init__(self, cache_service: CacheService):
        """
        Initialize metrics collectors, cache service, and start system metrics collection.

        Args:
            cache_service: Redis cache service instance for metrics storage
        """
        # Initialize thread-safe logger
        self._logger = get_logger(__name__)
        self._lock = threading.Lock()
        
        # Initialize Prometheus registry and metrics
        self._registry = CollectorRegistry()
        
        # Task metrics
        self.task_counter = Counter(
            f'{METRICS_PREFIX}_tasks_total',
            'Total number of tasks executed',
            ['status', 'type'],
            registry=self._registry
        )
        
        self.task_duration = Histogram(
            f'{METRICS_PREFIX}_task_duration_seconds',
            'Task execution duration in seconds',
            ['task_type'],
            buckets=(1, 5, 10, 30, 60, 120, 300, 600),
            registry=self._registry
        )
        
        self.active_tasks = Gauge(
            f'{METRICS_PREFIX}_active_tasks',
            'Number of currently active tasks',
            registry=self._registry
        )
        
        # System metrics
        self.system_cpu = Gauge(
            f'{METRICS_PREFIX}_system_cpu_percent',
            'System CPU utilization percentage',
            ['core'],
            registry=self._registry
        )
        
        self.system_memory = Gauge(
            f'{METRICS_PREFIX}_system_memory_bytes',
            'System memory usage in bytes',
            ['type'],
            registry=self._registry
        )
        
        self.system_storage = Gauge(
            f'{METRICS_PREFIX}_system_storage_bytes',
            'System storage usage in bytes',
            ['mount_point'],
            registry=self._registry
        )
        
        self.system_network_io = Gauge(
            f'{METRICS_PREFIX}_system_network_bytes',
            'System network I/O in bytes',
            ['direction'],
            registry=self._registry
        )
        
        self.system_disk_io = Gauge(
            f'{METRICS_PREFIX}_system_disk_io_bytes',
            'System disk I/O in bytes',
            ['operation'],
            registry=self._registry
        )
        
        # Initialize cache service
        self._cache = cache_service
        
        # Initialize metric aggregates
        self._metric_aggregates: Dict[str, Dict[str, float]] = {}
        
        # Start system metrics collection
        asyncio.create_task(self.collect_system_metrics())
        
        self._logger.info("MetricsService initialized successfully")

    async def record_task_execution(
        self,
        task_id: str,
        duration: float,
        pages_processed: int,
        errors: int,
        timing_breakdown: Dict[str, float]
    ) -> None:
        """
        Records detailed task execution metrics with timing breakdowns and error tracking.

        Args:
            task_id: Unique task identifier
            duration: Total execution time in seconds
            pages_processed: Number of pages processed
            errors: Number of errors encountered
            timing_breakdown: Detailed timing breakdown by operation
        """
        try:
            with self._lock:
                # Record task completion
                status = "success" if errors == 0 else "error"
                self.task_counter.labels(status=status, type="scraping").inc()
                
                # Record duration
                self.task_duration.labels(task_type="scraping").observe(duration)
                
                # Calculate and cache metrics
                metrics_data = {
                    "task_id": task_id,
                    "duration": duration,
                    "pages_processed": pages_processed,
                    "errors": errors,
                    "timing_breakdown": timing_breakdown,
                    "pages_per_second": pages_processed / duration if duration > 0 else 0,
                    "timestamp": time.time()
                }
                
                # Cache task metrics
                cache_key = f"task_metrics:{task_id}"
                await self._cache.set(cache_key, metrics_data, METRICS_CACHE_TTL)
                
                # Update aggregates
                self._update_aggregates(metrics_data)
                
                self._logger.info(
                    f"Task metrics recorded for {task_id}",
                    extra={"metrics": metrics_data}
                )
                
        except Exception as e:
            self._logger.error(
                f"Error recording task metrics: {str(e)}",
                exc_info=True
            )

    async def collect_system_metrics(self) -> None:
        """
        Collects comprehensive system resource utilization metrics asynchronously.
        Runs continuously with configured interval.
        """
        while True:
            try:
                # Collect CPU metrics
                cpu_percent = psutil.cpu_percent(interval=1, percpu=True)
                for core, percent in enumerate(cpu_percent):
                    self.system_cpu.labels(core=f"core_{core}").set(percent)
                
                # Collect memory metrics
                memory = psutil.virtual_memory()
                self.system_memory.labels(type="total").set(memory.total)
                self.system_memory.labels(type="available").set(memory.available)
                self.system_memory.labels(type="used").set(memory.used)
                
                # Collect storage metrics
                for partition in psutil.disk_partitions():
                    try:
                        usage = psutil.disk_usage(partition.mountpoint)
                        self.system_storage.labels(
                            mount_point=partition.mountpoint
                        ).set(usage.used)
                    except Exception:
                        continue
                
                # Collect network I/O metrics
                network = psutil.net_io_counters()
                self.system_network_io.labels(direction="bytes_sent").set(
                    network.bytes_sent
                )
                self.system_network_io.labels(direction="bytes_recv").set(
                    network.bytes_recv
                )
                
                # Collect disk I/O metrics
                disk = psutil.disk_io_counters()
                self.system_disk_io.labels(operation="read").set(disk.read_bytes)
                self.system_disk_io.labels(operation="write").set(disk.write_bytes)
                
                # Cache system metrics
                system_metrics = {
                    "cpu_percent": cpu_percent,
                    "memory_percent": memory.percent,
                    "disk_usage": {
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free
                    },
                    "timestamp": time.time()
                }
                
                await self._cache.set(
                    "system_metrics",
                    system_metrics,
                    METRICS_CACHE_TTL
                )
                
                self._logger.debug("System metrics collected successfully")
                
            except Exception as e:
                self._logger.error(
                    f"Error collecting system metrics: {str(e)}",
                    exc_info=True
                )
            
            await asyncio.sleep(SYSTEM_METRICS_INTERVAL)

    def get_system_metrics(self) -> Dict[str, Dict[str, float]]:
        """
        Retrieves current system metrics with aggregated statistics.

        Returns:
            Dict containing detailed system metrics and aggregates
        """
        try:
            with self._lock:
                return {
                    "current": self._metric_aggregates,
                    "aggregates": {
                        "cpu_average": sum(
                            psutil.cpu_percent(interval=None, percpu=True)
                        ) / psutil.cpu_count(),
                        "memory_used_percent": psutil.virtual_memory().percent,
                        "disk_used_percent": psutil.disk_usage('/').percent
                    }
                }
        except Exception as e:
            self._logger.error(
                f"Error retrieving system metrics: {str(e)}",
                exc_info=True
            )
            return {}

    def _update_aggregates(self, metrics_data: Dict[str, Any]) -> None:
        """
        Updates internal metrics aggregates with new data.

        Args:
            metrics_data: New metrics data to incorporate
        """
        try:
            self._metric_aggregates.update({
                "total_tasks": self._metric_aggregates.get("total_tasks", 0) + 1,
                "total_pages": self._metric_aggregates.get("total_pages", 0) + 
                              metrics_data["pages_processed"],
                "total_errors": self._metric_aggregates.get("total_errors", 0) + 
                               metrics_data["errors"],
                "avg_duration": (
                    self._metric_aggregates.get("avg_duration", 0) * 
                    self._metric_aggregates.get("total_tasks", 0) + 
                    metrics_data["duration"]
                ) / (self._metric_aggregates.get("total_tasks", 0) + 1)
            })
        except Exception as e:
            self._logger.error(
                f"Error updating metric aggregates: {str(e)}",
                exc_info=True
            )