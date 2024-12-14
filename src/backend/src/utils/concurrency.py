# Version Information:
# asyncio==3.11
# typing==3.11
# logging==3.11
# time==3.11

import asyncio
import logging
import time
from typing import Any, Dict, Optional, Set

# Configure module logger
logger = logging.getLogger(__name__)

# Global constants
DEFAULT_TIMEOUT = 30.0  # Default timeout in seconds
DEFAULT_MAX_SIZE = 100  # Default pool size
CLEANUP_INTERVAL = 300  # Cleanup interval in seconds

class ResourcePool:
    """
    Generic resource pool for managing concurrent access to limited resources with enhanced monitoring
    and error recovery capabilities.
    
    Features:
    - Thread-safe resource management
    - Timeout handling
    - Resource health validation
    - Usage metrics tracking
    - Automatic cleanup of stale resources
    """
    
    def __init__(self, max_size: int = DEFAULT_MAX_SIZE, enable_metrics: bool = True):
        """
        Initialize the resource pool with specified capacity and monitoring.
        
        Args:
            max_size: Maximum number of resources in the pool
            enable_metrics: Flag to enable resource usage metrics collection
        """
        self._semaphore = asyncio.Semaphore(max_size)
        self._resources: Set[Any] = set()
        self._in_use: Dict[str, Dict[str, Any]] = {}
        self._max_size = max_size
        self._resource_metrics: Dict[str, Dict[str, Any]] = {} if enable_metrics else None
        
        logger.info(f"Initialized ResourcePool with max_size={max_size}, metrics_enabled={enable_metrics}")
        
        if enable_metrics:
            asyncio.create_task(self._periodic_cleanup())

    async def acquire(self, timeout: float = DEFAULT_TIMEOUT, resource_id: str = None) -> Optional[Any]:
        """
        Acquires a resource from the pool with timeout and metrics tracking.
        
        Args:
            timeout: Maximum time to wait for resource acquisition
            resource_id: Unique identifier for resource tracking
            
        Returns:
            Acquired resource with metadata or None if timeout occurs
            
        Raises:
            TimeoutError: If resource cannot be acquired within timeout period
        """
        try:
            logger.debug(f"Attempting to acquire resource (id={resource_id}, timeout={timeout}s)")
            
            # Wait for semaphore with timeout
            acquire_task = asyncio.create_task(self._semaphore.acquire())
            try:
                await asyncio.wait_for(acquire_task, timeout)
            except asyncio.TimeoutError:
                logger.warning(f"Resource acquisition timeout (id={resource_id})")
                raise TimeoutError("Resource acquisition timeout")
                
            # Get or create resource
            resource = self._resources.pop() if self._resources else self._create_resource()
            
            # Update metrics if enabled
            if self._resource_metrics is not None:
                self._update_acquisition_metrics(resource_id)
                
            # Mark resource as in-use
            self._in_use[resource_id] = {
                'resource': resource,
                'acquired_at': time.time(),
                'last_activity': time.time()
            }
            
            logger.debug(f"Successfully acquired resource (id={resource_id})")
            return resource
            
        except Exception as e:
            logger.error(f"Error during resource acquisition: {str(e)}")
            self._semaphore.release()
            raise

    async def release(self, resource: Any, resource_id: str) -> bool:
        """
        Returns a resource to the pool with validation and metrics update.
        
        Args:
            resource: The resource to be released
            resource_id: Unique identifier of the resource
            
        Returns:
            bool: True if release was successful, False otherwise
        """
        try:
            if resource_id not in self._in_use:
                logger.warning(f"Attempt to release unacquired resource (id={resource_id})")
                return False
                
            # Update metrics if enabled
            if self._resource_metrics is not None:
                self._update_release_metrics(resource_id)
                
            # Remove from in-use set
            resource_data = self._in_use.pop(resource_id)
            
            # Validate resource health
            if self._validate_resource(resource):
                self._resources.add(resource)
            else:
                logger.warning(f"Resource failed health check, disposing (id={resource_id})")
                
            self._semaphore.release()
            logger.debug(f"Successfully released resource (id={resource_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error during resource release: {str(e)}")
            return False

    def _create_resource(self) -> Any:
        """Creates a new resource instance."""
        return object()  # Placeholder - should be overridden by specific implementations

    def _validate_resource(self, resource: Any) -> bool:
        """Validates resource health and usability."""
        return True  # Placeholder - should be overridden by specific implementations

    def _update_acquisition_metrics(self, resource_id: str) -> None:
        """Updates metrics for resource acquisition."""
        if self._resource_metrics is not None:
            self._resource_metrics[resource_id] = {
                'acquire_time': time.time(),
                'acquisitions': self._resource_metrics.get(resource_id, {}).get('acquisitions', 0) + 1
            }

    def _update_release_metrics(self, resource_id: str) -> None:
        """Updates metrics for resource release."""
        if self._resource_metrics is not None and resource_id in self._resource_metrics:
            metrics = self._resource_metrics[resource_id]
            metrics['last_release'] = time.time()
            metrics['total_usage_time'] = metrics.get('total_usage_time', 0) + (
                metrics['last_release'] - metrics['acquire_time']
            )

    async def _periodic_cleanup(self) -> None:
        """Performs periodic cleanup of stale resources."""
        while True:
            try:
                await asyncio.sleep(CLEANUP_INTERVAL)
                current_time = time.time()
                
                # Cleanup stale in-use resources
                stale_resources = [
                    rid for rid, data in self._in_use.items()
                    if current_time - data['last_activity'] > DEFAULT_TIMEOUT
                ]
                
                for rid in stale_resources:
                    logger.warning(f"Cleaning up stale resource (id={rid})")
                    await self.release(self._in_use[rid]['resource'], rid)
                    
            except Exception as e:
                logger.error(f"Error during periodic cleanup: {str(e)}")

class TaskPool:
    """
    Specialized resource pool for managing concurrent task execution with enhanced monitoring.
    
    Features:
    - Task-specific resource management
    - Detailed task metrics
    - Health monitoring
    - Automatic task cleanup
    """
    
    def __init__(self, max_concurrent_tasks: int = DEFAULT_MAX_SIZE, enable_metrics: bool = True):
        """
        Initialize the task pool with specified capacity and monitoring.
        
        Args:
            max_concurrent_tasks: Maximum number of concurrent tasks
            enable_metrics: Flag to enable task metrics collection
        """
        self._resource_pool = ResourcePool(max_concurrent_tasks, enable_metrics)
        self._task_metadata: Dict[str, Dict[str, Any]] = {}
        self._task_metrics: Dict[str, Dict[str, Any]] = {} if enable_metrics else None
        
        logger.info(f"Initialized TaskPool with max_tasks={max_concurrent_tasks}, metrics_enabled={enable_metrics}")

    async def acquire(self, task_id: str, timeout: float = DEFAULT_TIMEOUT, task_context: Dict = None) -> bool:
        """
        Acquires a slot for task execution with enhanced monitoring.
        
        Args:
            task_id: Unique task identifier
            timeout: Maximum time to wait for slot acquisition
            task_context: Additional task context information
            
        Returns:
            bool: True if slot was acquired successfully
        """
        try:
            if not task_id:
                raise ValueError("Task ID is required")
                
            if task_id in self._task_metadata:
                logger.warning(f"Task already running (id={task_id})")
                return False
                
            # Acquire resource slot
            resource = await self._resource_pool.acquire(timeout, task_id)
            
            # Record task metadata
            self._task_metadata[task_id] = {
                'resource': resource,
                'started_at': time.time(),
                'context': task_context or {},
                'status': 'running'
            }
            
            # Update metrics if enabled
            if self._task_metrics is not None:
                self._update_task_metrics(task_id, 'start')
                
            logger.info(f"Task slot acquired successfully (id={task_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error during task slot acquisition: {str(e)}")
            return False

    async def release(self, task_id: str) -> bool:
        """
        Releases a task slot and updates metrics.
        
        Args:
            task_id: Unique task identifier
            
        Returns:
            bool: True if release was successful
        """
        try:
            if task_id not in self._task_metadata:
                logger.warning(f"Attempt to release unknown task (id={task_id})")
                return False
                
            task_data = self._task_metadata.pop(task_id)
            
            # Update metrics if enabled
            if self._task_metrics is not None:
                self._update_task_metrics(task_id, 'end')
                
            # Release resource slot
            success = await self._resource_pool.release(task_data['resource'], task_id)
            
            logger.info(f"Task slot released successfully (id={task_id})")
            return success
            
        except Exception as e:
            logger.error(f"Error during task slot release: {str(e)}")
            return False

    def _update_task_metrics(self, task_id: str, event: str) -> None:
        """Updates metrics for task execution."""
        if self._task_metrics is not None:
            current_time = time.time()
            if event == 'start':
                self._task_metrics[task_id] = {
                    'start_time': current_time,
                    'executions': self._task_metrics.get(task_id, {}).get('executions', 0) + 1
                }
            elif event == 'end' and task_id in self._task_metrics:
                metrics = self._task_metrics[task_id]
                metrics['end_time'] = current_time
                metrics['total_execution_time'] = metrics.get('total_execution_time', 0) + (
                    current_time - metrics['start_time']
                )

    def get_task_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Returns current task metrics."""
        return self._task_metrics.copy() if self._task_metrics is not None else {}