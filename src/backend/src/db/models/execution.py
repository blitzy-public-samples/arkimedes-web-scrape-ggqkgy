"""
SQLAlchemy model for web scraping task execution tracking with enhanced performance monitoring.
Implements comprehensive execution status, metrics tracking, and performance analytics.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from uuid import uuid4
from datetime import datetime
from typing import Dict, Any, Optional

# Third-party imports with versions
from sqlalchemy import Column, String, JSON, DateTime, Integer, Float, ForeignKey  # v2.0.0
from sqlalchemy.dialects.postgresql import UUID  # v2.0.0
from sqlalchemy.orm import relationship  # v2.0.0

# Internal imports
from ..session import Base
from .task import Task

# Global constants for execution management
EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled']
DEFAULT_TIMEOUT = 3600  # Default execution timeout in seconds

class Execution(Base):
    """
    SQLAlchemy model for tracking individual task execution instances with enhanced performance metrics.
    Implements comprehensive status tracking, performance monitoring, and error handling.
    """
    __tablename__ = 'executions'

    # Primary fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    start_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    status = Column(String(50), nullable=False, default='pending', index=True)
    
    # Performance metrics
    pages_processed = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)
    processing_rate = Column(Float, nullable=False, default=0.0)
    
    # Detailed metrics storage
    metrics = Column(JSON, nullable=False, default=lambda: {
        'requests': {'success': 0, 'failed': 0, 'retried': 0},
        'bandwidth': {'downloaded': 0, 'uploaded': 0},
        'timing': {'avg_response_time': 0, 'total_processing_time': 0},
        'resources': {'memory_usage': 0, 'cpu_usage': 0}
    })
    
    # Performance monitoring
    performance_metrics = Column(JSON, nullable=False, default=lambda: {
        'throughput': {'current': 0, 'peak': 0, 'average': 0},
        'latency': {'min': 0, 'max': 0, 'avg': 0},
        'resource_utilization': {'cpu': [], 'memory': []},
        'error_rates': {'total': 0, 'by_type': {}}
    })

    # Relationships
    task = relationship("Task", back_populates="executions")

    def __init__(self, task_id: UUID) -> None:
        """
        Initialize execution record with enhanced metrics tracking.
        
        Args:
            task_id: UUID of the associated task
        """
        super().__init__(
            task_id=task_id,
            start_time=datetime.utcnow(),
            status='pending',
            metrics={
                'requests': {'success': 0, 'failed': 0, 'retried': 0},
                'bandwidth': {'downloaded': 0, 'uploaded': 0},
                'timing': {'avg_response_time': 0, 'total_processing_time': 0},
                'resources': {'memory_usage': 0, 'cpu_usage': 0}
            },
            performance_metrics={
                'throughput': {'current': 0, 'peak': 0, 'average': 0},
                'latency': {'min': 0, 'max': 0, 'avg': 0},
                'resource_utilization': {'cpu': [], 'memory': []},
                'error_rates': {'total': 0, 'by_type': {}}
            }
        )

    def start(self) -> bool:
        """
        Mark execution as started with performance tracking initialization.
        
        Returns:
            bool: Success status of operation
        """
        if self.status != 'pending':
            return False
            
        self.status = 'running'
        self.start_time = datetime.utcnow()
        self.metrics['timing']['start_timestamp'] = self.start_time.isoformat()
        return True

    def complete(self, final_metrics: Dict[str, Any]) -> bool:
        """
        Mark execution as completed with comprehensive metrics.
        
        Args:
            final_metrics: Final execution metrics and statistics
            
        Returns:
            bool: Success status of operation
        """
        if self.status != 'running':
            return False
            
        self.status = 'completed'
        self.end_time = datetime.utcnow()
        
        # Calculate final processing rate
        duration = (self.end_time - self.start_time).total_seconds()
        self.processing_rate = self.pages_processed / duration if duration > 0 else 0
        
        # Update performance metrics
        self.performance_metrics['throughput']['average'] = self.processing_rate
        self.performance_metrics['timing'] = {
            'total_duration': duration,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat()
        }
        
        # Merge final metrics
        self.metrics.update(final_metrics)
        return True

    def fail(self, error_details: Dict[str, Any]) -> bool:
        """
        Mark execution as failed with detailed error tracking.
        
        Args:
            error_details: Detailed error information and context
            
        Returns:
            bool: Success status of operation
        """
        self.status = 'failed'
        self.end_time = datetime.utcnow()
        
        # Update error metrics
        self.error_count += 1
        error_type = error_details.get('type', 'unknown')
        self.performance_metrics['error_rates']['total'] += 1
        self.performance_metrics['error_rates']['by_type'][error_type] = \
            self.performance_metrics['error_rates']['by_type'].get(error_type, 0) + 1
        
        # Record error details
        self.metrics['errors'] = self.metrics.get('errors', [])
        self.metrics['errors'].append({
            'timestamp': datetime.utcnow().isoformat(),
            'details': error_details,
            'context': {
                'pages_processed': self.pages_processed,
                'processing_rate': self.processing_rate
            }
        })
        return True

    def update_metrics(self, new_metrics: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update execution metrics with enhanced performance tracking.
        
        Args:
            new_metrics: New metrics to incorporate
            
        Returns:
            dict: Updated comprehensive metrics
        """
        if self.status != 'running':
            return self.metrics
            
        # Update pages processed
        if 'pages_processed' in new_metrics:
            self.pages_processed = new_metrics['pages_processed']
            
        # Calculate current processing rate
        duration = (datetime.utcnow() - self.start_time).total_seconds()
        current_rate = self.pages_processed / duration if duration > 0 else 0
        self.processing_rate = current_rate
        
        # Update throughput metrics
        self.performance_metrics['throughput']['current'] = current_rate
        if current_rate > self.performance_metrics['throughput']['peak']:
            self.performance_metrics['throughput']['peak'] = current_rate
            
        # Update resource utilization
        if 'resources' in new_metrics:
            self.performance_metrics['resource_utilization']['cpu'].append(
                new_metrics['resources'].get('cpu_usage', 0)
            )
            self.performance_metrics['resource_utilization']['memory'].append(
                new_metrics['resources'].get('memory_usage', 0)
            )
            
        # Merge new metrics
        self.metrics.update(new_metrics)
        return self.metrics

# Export public components
__all__ = [
    'Execution',
    'EXECUTION_STATUSES'
]