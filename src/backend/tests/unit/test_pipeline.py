"""
Comprehensive unit tests for data processing pipeline components.
Tests data validation, cleaning, transformation and end-to-end processing with metrics.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import pytest
import pandas as pd
from datetime import datetime
from uuid import uuid4
from typing import Dict, Any

# Internal imports
from ...src.scraper.pipeline.validator import DataValidator
from ...src.scraper.pipeline.cleaner import DataCleaner
from ...src.scraper.pipeline.transformer import DataTransformer
from ...src.scraper.pipeline.processor import DataProcessor
from ...src.api.schemas.data import ScrapedData

# Test data fixtures
@pytest.fixture
def valid_scraped_data() -> ScrapedData:
    """Fixture providing valid scraped data for testing."""
    return ScrapedData(
        id=uuid4(),
        execution_id=uuid4(),
        raw_data={
            "url": "https://example.com/product",
            "timestamp": datetime.utcnow().isoformat(),
            "content": "<div>Sample product content</div>",
            "price": "$19.99",
            "stock": "In Stock",
            "rating": 4.5
        },
        status="pending",
        version="1.0.0"
    )

@pytest.fixture
def invalid_scraped_data() -> ScrapedData:
    """Fixture providing invalid scraped data for testing."""
    return ScrapedData(
        id=uuid4(),
        execution_id=uuid4(),
        raw_data={
            "url": "invalid-url",  # Invalid URL format
            "content": "<script>malicious</script>",  # Contains disallowed tags
            "price": "invalid-price",  # Invalid price format
            "rating": "not-a-number"  # Invalid numeric value
        },
        status="pending",
        version="1.0.0"
    )

@pytest.fixture
def pipeline_config() -> Dict[str, Any]:
    """Fixture providing pipeline configuration."""
    return {
        "validation": {
            "validation_rules": {
                "url": {"type": "str", "required": True, "pattern": r"^https?://.*"},
                "price": {"type": "str", "required": True, "pattern": r"^\$\d+\.\d{2}$"},
                "rating": {"type": "float", "required": False, "range": [0, 5]}
            }
        },
        "cleaning": {
            "field_encodings": {
                "content": "utf-8"
            }
        },
        "transformation": {
            "field_mappings": {
                "product_url": "url",
                "product_price": "price"
            },
            "transformation_rules": [
                {
                    "field": "price",
                    "type": "string",
                    "operation": "numeric_operation",
                    "parameters": {"operator": ".strip('$')"} 
                },
                {
                    "field": "rating",
                    "type": "float",
                    "operation": "type_conversion"
                }
            ]
        }
    }

class TestDataValidator:
    """Test suite for data validation functionality."""

    @pytest.mark.asyncio
    async def test_validate_valid_data(self, valid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test validation of correctly formatted data."""
        validator = DataValidator(pipeline_config["validation"])
        
        # Execute validation
        is_valid, errors, metadata = await validator.validate(valid_scraped_data)
        
        # Assert validation success
        assert is_valid is True
        assert len(errors) == 0
        assert metadata["schema_version"] == "1.0.0"
        assert "start_time" in metadata
        assert "duration_ms" in metadata
        
        # Verify validation metrics
        validation_stats = validator._stats
        assert validation_stats["total_validations"] == 1
        assert validation_stats["successful_validations"] == 1
        assert validation_stats["failed_validations"] == 0

    @pytest.mark.asyncio
    async def test_validate_invalid_data(self, invalid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test validation of malformed data."""
        validator = DataValidator(pipeline_config["validation"])
        
        # Execute validation
        is_valid, errors, metadata = await validator.validate(invalid_scraped_data)
        
        # Assert validation failure
        assert is_valid is False
        assert len(errors) > 0
        assert any("Invalid URL format" in error for error in errors)
        assert any("Invalid price format" in error for error in errors)
        
        # Verify error tracking
        validation_stats = validator._stats
        assert validation_stats["failed_validations"] == 1
        assert validation_stats["successful_validations"] == 0

    @pytest.mark.asyncio
    async def test_custom_validator(self, valid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test custom validation rules."""
        validator = DataValidator(pipeline_config["validation"])
        
        # Add custom price validator
        async def validate_price(price: str) -> bool:
            return price.startswith("$") and len(price.split(".")[1]) == 2
            
        validator.add_custom_validator(
            "price",
            validate_price,
            {"description": "Validate price format"}
        )
        
        # Execute validation
        is_valid, errors, metadata = await validator.validate(valid_scraped_data)
        
        # Assert custom validation
        assert is_valid is True
        assert len(errors) == 0

class TestDataCleaner:
    """Test suite for data cleaning functionality."""

    @pytest.mark.asyncio
    async def test_clean_html_content(self, valid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test HTML content cleaning."""
        cleaner = DataCleaner(pipeline_config["cleaning"])
        
        # Add malicious content
        valid_scraped_data.raw_data["content"] = """
            <div>Valid content</div>
            <script>alert('malicious')</script>
            <img src="invalid" onerror="alert('xss')">
        """
        
        # Execute cleaning
        cleaned_data = await cleaner.clean(valid_scraped_data)
        
        # Assert content cleaning
        assert "<script>" not in cleaned_data.transformed_data["content"]
        assert "onerror" not in cleaned_data.transformed_data["content"]
        assert "Valid content" in cleaned_data.transformed_data["content"]
        
        # Verify cleaning metrics
        assert cleaned_data.validation_results["success_rate"] > 0.99
        assert cleaned_data.validation_results["error_counts"] == {}

    @pytest.mark.asyncio
    async def test_whitespace_normalization(self, valid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test whitespace normalization."""
        cleaner = DataCleaner(pipeline_config["cleaning"])
        
        # Add text with irregular whitespace
        valid_scraped_data.raw_data["description"] = "Product    description  with \n\n irregular    spacing"
        
        # Execute cleaning
        cleaned_data = await cleaner.clean(valid_scraped_data)
        
        # Assert whitespace normalization
        assert cleaned_data.transformed_data["description"] == "Product description with irregular spacing"

class TestDataTransformer:
    """Test suite for data transformation functionality."""

    @pytest.mark.asyncio
    async def test_field_mapping(self, valid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test field mapping transformations."""
        transformer = DataTransformer(pipeline_config["transformation"])
        
        # Execute transformation
        transformed_data = await transformer.transform(valid_scraped_data)
        
        # Assert field mappings
        assert "product_url" in transformed_data.transformed_data
        assert "product_price" in transformed_data.transformed_data
        assert transformed_data.transformed_data["product_url"] == valid_scraped_data.raw_data["url"]
        
        # Verify transformation history
        assert len(transformed_data.transformation_history) == 1
        assert "timestamp" in transformed_data.transformation_history[0]

    @pytest.mark.asyncio
    async def test_data_aggregation(self, valid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test data aggregation transformations."""
        transformer = DataTransformer(pipeline_config["transformation"])
        
        # Add numeric fields for aggregation
        valid_scraped_data.raw_data.update({
            "ratings": [4.5, 4.0, 5.0],
            "prices": ["$19.99", "$20.99", "$18.99"]
        })
        
        # Execute transformation
        transformed_data = await transformer.transform(valid_scraped_data)
        
        # Assert aggregations
        assert isinstance(transformed_data.transformed_data.get("rating"), float)
        assert transformed_data.transformed_data["rating"] <= 5.0

class TestDataProcessor:
    """Test suite for end-to-end pipeline processing."""

    @pytest.mark.asyncio
    async def test_full_pipeline_processing(self, valid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test complete pipeline execution."""
        processor = DataProcessor(pipeline_config)
        
        # Execute full pipeline
        processed_data = await processor.process(valid_scraped_data)
        
        # Assert successful processing
        assert processed_data.status == "valid"
        assert processed_data.transformed_data is not None
        assert processed_data.validation_results is not None
        assert processed_data.error_context is None
        
        # Verify pipeline metrics
        pipeline_stats = processor.get_pipeline_stats()
        assert pipeline_stats["metrics"]["successful"] == 1
        assert pipeline_stats["metrics"]["failed"] == 0
        assert pipeline_stats["quality_metrics"]["accuracy"] == 100.0

    @pytest.mark.asyncio
    async def test_pipeline_error_handling(self, invalid_scraped_data: ScrapedData, pipeline_config: Dict[str, Any]):
        """Test pipeline error handling and recovery."""
        processor = DataProcessor(pipeline_config)
        
        # Execute pipeline with invalid data
        processed_data = await processor.process(invalid_scraped_data)
        
        # Assert error handling
        assert processed_data.status == "invalid"
        assert processed_data.error_context is not None
        assert "stage" in processed_data.error_context
        assert "timestamp" in processed_data.error_context
        
        # Verify error metrics
        pipeline_stats = processor.get_pipeline_stats()
        assert pipeline_stats["metrics"]["failed"] == 1
        assert pipeline_stats["metrics"]["validation_errors"] > 0
        assert pipeline_stats["quality_metrics"]["error_rate"] > 0

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )