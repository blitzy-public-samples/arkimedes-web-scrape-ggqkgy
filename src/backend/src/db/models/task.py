"""
SQLAlchemy model for web scraping task configurations with comprehensive validation and state management.
Implements task scheduling, extraction rules, execution tracking, and relationship handling.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from uuid import uuid4
from datetime import datetime
from typing import Dict, Any, Optional, List

# Third-party imports with versions
from sqlalchemy import Column, String, JSON, DateTime, Integer, ForeignKey  # v2.0.0
from sqlalchemy.dialects.postgresql import UUID  # v2.0.0
from sqlalchemy.orm import relationship  # v2.0.0
from pydantic import BaseModel, Field, validator  # v2.0.0

# Internal imports
from ..session import Base

# Global constants for task management
TASK_STATUSES = ['active', 'paused', 'completed', 'failed', 'archived']
TASK_PRIORITIES = ['low', 'medium', 'high', 'critical']
DEFAULT_RETRY_COUNT = 3
VALID_STATE_TRANSITIONS = {
    'active': ['paused', 'completed', 'failed'],
    'paused': ['active', 'archived'],
    'completed': ['archived'],
    'failed': ['active', 'archived'],
    'archived': []
}

class TaskConfig(BaseModel):
    """
    Pydantic model for validating task configuration schema with comprehensive validation rules.
    """
    url_pattern: str = Field(..., min_length=1, max_length=2048)
    selectors: Dict[str, str] = Field(..., description="CSS/XPath selectors for data extraction")
    proxy_settings: Optional[Dict[str, Any]] = Field(default=None)
    authentication: Optional[Dict[str, str]] = Field(default=None)
    extraction_rules: List[Dict[str, Any]] = Field(..., min_items=1)
    rate_limits: Dict[str, int] = Field(
        default_factory=lambda: {"requests_per_minute": 60, "max_concurrent": 1}
    )

    @validator('url_pattern')
    def validate_url_pattern(cls, v: str) -> str:
        """Validate URL pattern format"""
        if not v.startswith(('http://', 'https://')):
            raise ValueError("URL pattern must start with http:// or https://")
        return v

    @validator('selectors')
    def validate_selectors(cls, v: Dict[str, str]) -> Dict[str, str]:
        """Validate selector syntax"""
        if not v:
            raise ValueError("At least one selector must be specified")
        for key, selector in v.items():
            if not selector.strip():
                raise ValueError(f"Empty selector for key: {key}")
            if not any([
                selector.startswith('//'),  # XPath
                selector.startswith('.'),   # CSS class
                selector.startswith('#'),   # CSS ID
                selector.strip()[0].isalpha()  # CSS element
            ]):
                raise ValueError(f"Invalid selector format for key: {key}")
        return v

    @validator('extraction_rules')
    def validate_extraction_rules(cls, v: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate extraction rules format"""
        required_keys = {'field_name', 'selector_key', 'data_type'}
        for rule in v:
            missing_keys = required_keys - set(rule.keys())
            if missing_keys:
                raise ValueError(f"Missing required keys in extraction rule: {missing_keys}")
        return v

class Task(Base):
    """
    SQLAlchemy model for web scraping task configuration and management.
    Implements comprehensive state handling and relationship tracking.
    """
    __tablename__ = 'tasks'

    # Primary fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False, index=True)
    configuration = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    status = Column(String(50), nullable=False, default='active', index=True)
    priority = Column(String(50), nullable=False, default='medium', index=True)
    retry_count = Column(Integer, nullable=False, default=0)
    schedule = Column(JSON, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)

    # Relationships
    executions = relationship("TaskExecution", back_populates="task", cascade="all, delete-orphan")
    user = relationship("User", back_populates="tasks")

    def __init__(self, name: str, configuration: Dict[str, Any], user_id: UUID, 
                 schedule: Optional[Dict[str, Any]] = None) -> None:
        """Initialize task record with validated configuration"""
        # Validate configuration using TaskConfig
        config = TaskConfig(**configuration)
        
        super().__init__(
            name=name,
            configuration=config.dict(),
            user_id=user_id,
            schedule=schedule or {"type": "manual"}
        )

    def update_configuration(self, new_configuration: Dict[str, Any]) -> Dict[str, Any]:
        """Update task configuration with schema validation"""
        # Validate new configuration
        config = TaskConfig(**new_configuration)
        validated_config = config.dict()
        
        # Update configuration and timestamp
        self.configuration = validated_config
        self.updated_at = datetime.utcnow()
        
        return validated_config

    def update_status(self, new_status: str) -> str:
        """Update task status with transition validation"""
        if new_status not in TASK_STATUSES:
            raise ValueError(f"Invalid status: {new_status}")
            
        current_status = self.status
        if new_status not in VALID_STATE_TRANSITIONS[current_status]:
            raise ValueError(
                f"Invalid status transition from {current_status} to {new_status}"
            )
            
        self.status = new_status
        self.updated_at = datetime.utcnow()
        
        # Handle transition side effects
        if new_status == 'archived':
            self.schedule = {"type": "archived"}
        elif new_status == 'failed' and self.retry_count >= DEFAULT_RETRY_COUNT:
            self.schedule = {"type": "failed"}
            
        return new_status

    def update_schedule(self, new_schedule: Dict[str, Any]) -> Dict[str, Any]:
        """Update task schedule with validation"""
        required_keys = {'type'}
        if not required_keys.issubset(new_schedule.keys()):
            raise ValueError(f"Missing required schedule keys: {required_keys - set(new_schedule.keys())}")
            
        schedule_type = new_schedule['type']
        if schedule_type not in ['manual', 'interval', 'cron', 'archived']:
            raise ValueError(f"Invalid schedule type: {schedule_type}")
            
        if schedule_type in ['interval', 'cron']:
            if 'value' not in new_schedule:
                raise ValueError(f"Schedule value required for type: {schedule_type}")
                
        self.schedule = new_schedule
        self.updated_at = datetime.utcnow()
        return new_schedule

    def increment_retry(self) -> bool:
        """Increment retry count with exhaustion handling"""
        self.retry_count += 1
        self.updated_at = datetime.utcnow()
        
        if self.retry_count >= DEFAULT_RETRY_COUNT:
            self.update_status('failed')
            return False
            
        return True

# Export public components
__all__ = [
    'Task',
    'TaskConfig',
    'TASK_STATUSES',
    'TASK_PRIORITIES'
]