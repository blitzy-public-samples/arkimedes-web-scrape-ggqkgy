"""
SQLAlchemy model for storing and managing scraped data points with comprehensive validation,
transformation, and quality tracking capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from uuid import uuid4
from datetime import datetime
from typing import Dict, Any, Optional

# Third-party imports with versions
from sqlalchemy import Column, String, JSON, DateTime, Float, ForeignKey  # v2.0.0
from sqlalchemy.dialects.postgresql import UUID  # v2.0.0
from sqlalchemy.orm import relationship  # v2.0.0

# Internal imports
from ..session import Base
from .execution import Execution

# Global constants for data management
DATA_TYPES = ['html', 'json', 'xml', 'text', 'binary']
VALIDATION_STATUSES = ['valid', 'invalid', 'pending', 'error', 'warning']

class Data(Base):
    """
    SQLAlchemy model for storing and validating individual data points with comprehensive quality tracking.
    Implements data transformation, validation, and versioning capabilities.
    """
    __tablename__ = 'data_points'

    # Primary fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    execution_id = Column(
        UUID(as_uuid=True), 
        ForeignKey('executions.id', ondelete='CASCADE'), 
        nullable=False, 
        index=True
    )
    
    # Data storage
    raw_data = Column(JSON, nullable=False)
    transformed_data = Column(JSON, nullable=True)
    
    # Timestamps
    collected_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    
    # Data characteristics
    data_type = Column(String(50), nullable=False)
    validation_status = Column(
        String(50), 
        nullable=False, 
        default='pending',
        index=True
    )
    validation_errors = Column(JSON, nullable=False, default=list)
    version = Column(String(50), nullable=False, default='1.0')
    quality_score = Column(Float, nullable=False, default=0.0)
    
    # Relationships
    execution = relationship("Execution", back_populates="data_points")

    def __init__(self, execution_id: UUID, raw_data: Dict[str, Any], data_type: str) -> None:
        """
        Initialize data point record with comprehensive tracking fields.
        
        Args:
            execution_id: UUID of associated execution
            raw_data: Original scraped data
            data_type: Type of data content
        """
        if data_type not in DATA_TYPES:
            raise ValueError(f"Invalid data type: {data_type}. Must be one of {DATA_TYPES}")
            
        super().__init__(
            execution_id=execution_id,
            raw_data=raw_data,
            data_type=data_type,
            collected_at=datetime.utcnow(),
            validation_status='pending',
            validation_errors=[],
            version='1.0',
            quality_score=0.0
        )

    def transform(self, transformation_rules: Dict[str, Any], 
                 quality_metrics: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Apply data transformation rules with version tracking and quality assessment.
        
        Args:
            transformation_rules: Dictionary of transformation rules
            quality_metrics: Optional quality assessment criteria
            
        Returns:
            Dict containing transformed data with quality metrics
        """
        try:
            # Validate transformation rules
            if not isinstance(transformation_rules, dict) or not transformation_rules:
                raise ValueError("Invalid transformation rules format")
                
            # Apply transformations
            transformed = {}
            for field, rule in transformation_rules.items():
                if rule.get('source') in self.raw_data:
                    value = self.raw_data[rule['source']]
                    
                    # Apply transformation function if specified
                    if 'transform_func' in rule:
                        value = rule['transform_func'](value)
                        
                    transformed[field] = value
            
            # Update version if schema changed
            if self.transformed_data and set(transformed.keys()) != set(self.transformed_data.keys()):
                current_version = float(self.version)
                self.version = f"{current_version + 0.1:.1f}"
            
            # Calculate quality score if metrics provided
            if quality_metrics:
                score = 0.0
                total_weight = 0
                
                for metric, config in quality_metrics.items():
                    weight = config.get('weight', 1.0)
                    if config['check_func'](transformed):
                        score += weight
                    total_weight += weight
                
                self.quality_score = (score / total_weight) * 100 if total_weight > 0 else 0.0
            
            # Update record
            self.transformed_data = transformed
            self.processed_at = datetime.utcnow()
            
            return transformed
            
        except Exception as e:
            self.validation_errors.append({
                'type': 'transformation_error',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
            raise

    def validate(self, schema: Dict[str, Any], strict_mode: bool = True) -> bool:
        """
        Comprehensive data validation with detailed error tracking.
        
        Args:
            schema: Validation schema definition
            strict_mode: Whether to enforce strict validation
            
        Returns:
            bool: Validation result
        """
        try:
            if not self.transformed_data:
                raise ValueError("No transformed data available for validation")
                
            errors = []
            
            # Schema validation
            for field, rules in schema.items():
                if rules.get('required', False) and field not in self.transformed_data:
                    errors.append({
                        'field': field,
                        'type': 'missing_required_field',
                        'message': f"Required field '{field}' is missing"
                    })
                    if strict_mode:
                        break
                        
                if field in self.transformed_data:
                    value = self.transformed_data[field]
                    
                    # Type validation
                    expected_type = rules.get('type')
                    if expected_type and not isinstance(value, eval(expected_type)):
                        errors.append({
                            'field': field,
                            'type': 'invalid_type',
                            'message': f"Expected type {expected_type} for field '{field}'"
                        })
                    
                    # Value validation
                    if 'validator' in rules:
                        if not rules['validator'](value):
                            errors.append({
                                'field': field,
                                'type': 'validation_failed',
                                'message': f"Validation failed for field '{field}'"
                            })
            
            # Update validation status
            if errors:
                self.validation_status = 'invalid'
                self.validation_errors = errors
                # Adjust quality score based on validation errors
                error_penalty = len(errors) * 10  # 10% penalty per error
                self.quality_score = max(0.0, self.quality_score - error_penalty)
                return False
            else:
                self.validation_status = 'valid'
                return True
                
        except Exception as e:
            self.validation_status = 'error'
            self.validation_errors.append({
                'type': 'validation_error',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
            return False

    def to_dict(self, include_raw: bool = False, 
                include_validation: bool = True) -> Dict[str, Any]:
        """
        Convert data point to comprehensive dictionary format.
        
        Args:
            include_raw: Whether to include raw data
            include_validation: Whether to include validation details
            
        Returns:
            Dict containing formatted data point representation
        """
        result = {
            'id': str(self.id),
            'execution_id': str(self.execution_id),
            'data_type': self.data_type,
            'collected_at': self.collected_at.isoformat(),
            'version': self.version,
            'quality_score': self.quality_score
        }
        
        if self.processed_at:
            result['processed_at'] = self.processed_at.isoformat()
            
        if include_raw:
            result['raw_data'] = self.raw_data
            
        if self.transformed_data:
            result['transformed_data'] = self.transformed_data
            
        if include_validation:
            result.update({
                'validation_status': self.validation_status,
                'validation_errors': self.validation_errors
            })
            
        return result

# Export public components
__all__ = [
    'Data',
    'DATA_TYPES',
    'VALIDATION_STATUSES'
]