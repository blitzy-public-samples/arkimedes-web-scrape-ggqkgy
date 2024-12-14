"""
Main entry point for the services package that provides a unified interface for accessing
core service components including caching, proxy management, storage, metrics collection,
and task management.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

from typing import Dict, Any

# Import core service components
from .cache import CacheService
from .proxy import ProxyService, get_proxy_metrics
from .storage import StorageService
from .metrics import MetricsCollector, collect_system_metrics, collect_task_metrics
from .task import TaskService

# Version tracking
__version__ = '1.0.0'

# Export public interface
__all__ = [
    'CacheService',
    'ProxyService',
    'StorageService',
    'MetricsCollector',
    'TaskService',
    'get_proxy_metrics',
    'collect_system_metrics',
    'collect_task_metrics'
]

# Service layer initialization and configuration
def initialize_services(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Initialize core service components with configuration and dependency injection.
    
    Args:
        config: Service configuration dictionary
        
    Returns:
        Dict containing initialized service instances
        
    Raises:
        RuntimeError: If service initialization fails
    """
    try:
        # Initialize cache service
        cache_service = CacheService(
            host=config['redis']['host'],
            port=config['redis']['port'],
            password=config['redis']['password'],
            use_ssl=config['redis'].get('use_ssl', True)
        )
        
        # Initialize proxy service
        proxy_service = ProxyService(
            api_key=config['proxy']['api_key'],
            pool_size=config['proxy'].get('pool_size', 100),
            security_config=config['proxy'].get('security', {}),
            performance_config=config['proxy'].get('performance', {})
        )
        
        # Initialize storage service
        storage_service = StorageService(
            config=config['storage'],
            pool_size=config['storage'].get('pool_size', 20),
            max_overflow=config['storage'].get('max_overflow', 10)
        )
        
        # Initialize metrics collector
        metrics_collector = MetricsCollector(cache_service)
        
        # Initialize task service with dependencies
        task_service = TaskService(
            db_session=config['database']['session'],
            scheduler=config['scheduler']
        )
        
        return {
            'cache': cache_service,
            'proxy': proxy_service,
            'storage': storage_service,
            'metrics': metrics_collector,
            'task': task_service
        }
        
    except Exception as e:
        raise RuntimeError(f"Failed to initialize services: {str(e)}")

def cleanup_services(services: Dict[str, Any]) -> None:
    """
    Perform graceful cleanup of service resources.
    
    Args:
        services: Dictionary of service instances to cleanup
        
    Raises:
        RuntimeError: If cleanup fails
    """
    try:
        # Cleanup services in reverse dependency order
        if 'task' in services:
            await services['task'].cleanup()
            
        if 'metrics' in services:
            await services['metrics'].cleanup()
            
        if 'storage' in services:
            await services['storage'].cleanup()
            
        if 'proxy' in services:
            await services['proxy'].cleanup()
            
        if 'cache' in services:
            await services['cache'].cleanup()
            
    except Exception as e:
        raise RuntimeError(f"Failed to cleanup services: {str(e)}")