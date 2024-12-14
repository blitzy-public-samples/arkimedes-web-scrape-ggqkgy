"""
Integration tests for the Web Scraping Platform's core scraping engine.
Validates end-to-end functionality including HTML extraction, data processing,
error handling, and performance metrics.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import pytest
from datetime import datetime
from typing import Dict, Any
from uuid import uuid4

# Third-party imports with versions
import aiohttp  # ^3.8.0
from aioresponses import aioresponses  # ^0.7.0
from bs4 import BeautifulSoup  # ^4.12.0

# Internal imports
from scraper.extractors.html import HTMLExtractor
from scraper.pipeline.processor import DataProcessor
from api.schemas.data import ScrapedData

# Test constants
TEST_HTML_CONTENT = """
<html>
    <body>
        <div class='content'>Test Data</div>
        <h1>Title</h1>
        <ul class='items'>
            <li>Item 1</li>
            <li>Item 2</li>
        </ul>
    </body>
</html>
"""

TEST_CONFIG = {
    "selectors": {
        "content": {"type": "css", "value": ".content"},
        "title": {"type": "css", "value": "h1"},
        "items": {"type": "css", "value": "ul.items li", "multiple": True}
    },
    "encoding": "utf-8",
    "parser": "lxml",
    "timeout": 30,
    "retries": 3,
    "validation_rules": {
        "content": {"required": True, "type": "str"},
        "title": {"required": True, "type": "str"},
        "items": {"required": True, "type": "list"}
    }
}

PERFORMANCE_THRESHOLDS = {
    "max_response_time": 200,  # milliseconds
    "min_throughput": 1000,    # pages/minute
    "max_error_rate": 0.001    # 0.1%
}

class TestScraperIntegration:
    """
    Integration test suite for web scraper functionality with comprehensive coverage.
    Tests data extraction, processing pipeline, error handling, and performance metrics.
    """

    def setup_method(self):
        """Set up test environment before each test execution."""
        self._extractor = HTMLExtractor(TEST_CONFIG)
        self._processor = DataProcessor({
            "validation": TEST_CONFIG["validation_rules"],
            "cleaning": {"field_encodings": {"content": "utf-8"}},
            "transformation": {"field_mappings": {}}
        })
        self._metrics = {
            "start_time": datetime.utcnow(),
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "total_processing_time": 0
        }

    def teardown_method(self):
        """Clean up resources after each test execution."""
        asyncio.run(self._extractor.cleanup())
        self._metrics = {}

    @pytest.mark.asyncio
    async def test_html_extraction(self, aioresponses, metrics_collector):
        """
        Test HTML content extraction with various selectors and validation of extraction quality.
        Validates 99.9% data accuracy requirement.
        """
        # Setup mock response
        test_url = "http://test.com/page"
        aioresponses.get(test_url, status=200, body=TEST_HTML_CONTENT)

        try:
            # Extract data
            start_time = datetime.utcnow()
            data = await self._extractor.extract(test_url)

            # Validate extraction results
            assert data["content"] == "Test Data"
            assert data["title"] == "Title"
            assert len(data["items"]) == 2
            assert "Item 1" in data["items"]
            assert "Item 2" in data["items"]

            # Validate performance metrics
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            assert processing_time < PERFORMANCE_THRESHOLDS["max_response_time"]

            # Update metrics
            self._metrics["successful_requests"] += 1
            self._metrics["total_processing_time"] += processing_time

        except Exception as e:
            self._metrics["failed_requests"] += 1
            raise

        finally:
            self._metrics["total_requests"] += 1

    @pytest.mark.asyncio
    async def test_data_processing_pipeline(self, aioresponses, metrics_collector):
        """
        Test end-to-end data processing pipeline with quality validation.
        Verifies schema compliance and data transformation accuracy.
        """
        # Create test data
        test_data = ScrapedData(
            id=uuid4(),
            execution_id=uuid4(),
            raw_data={
                "content": "<p>Test Content</p>",
                "title": "Test Title",
                "items": ["Item 1", "Item 2"]
            },
            version="1.0.0"
        )

        try:
            # Process data through pipeline
            start_time = datetime.utcnow()
            processed_data = await self._processor.process(test_data)

            # Validate processing results
            assert processed_data.transformed_data["content"] == "Test Content"
            assert processed_data.transformed_data["title"] == "Test Title"
            assert len(processed_data.transformed_data["items"]) == 2

            # Verify data quality metrics
            assert processed_data.validation_results["success_rate"] >= 0.999
            assert "schema_validation" not in processed_data.validation_results

            # Validate performance
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            assert processing_time < PERFORMANCE_THRESHOLDS["max_response_time"]

        except Exception as e:
            self._metrics["failed_requests"] += 1
            raise

    @pytest.mark.asyncio
    async def test_concurrent_scraping(self, aioresponses, metrics_collector):
        """
        Test concurrent scraping operations with performance validation.
        Verifies system handles 1000+ pages/minute requirement.
        """
        # Setup multiple test URLs
        test_urls = [f"http://test.com/page{i}" for i in range(100)]
        for url in test_urls:
            aioresponses.get(url, status=200, body=TEST_HTML_CONTENT)

        try:
            start_time = datetime.utcnow()
            
            # Create concurrent extraction tasks
            tasks = [self._extractor.extract(url) for url in test_urls]
            results = await asyncio.gather(*tasks)

            # Validate results
            assert len(results) == len(test_urls)
            for result in results:
                assert result["content"] == "Test Data"
                assert result["title"] == "Title"
                assert len(result["items"]) == 2

            # Calculate throughput
            total_time = (datetime.utcnow() - start_time).total_seconds()
            pages_per_minute = (len(results) / total_time) * 60
            assert pages_per_minute >= PERFORMANCE_THRESHOLDS["min_throughput"]

            self._metrics["successful_requests"] += len(results)

        except Exception as e:
            self._metrics["failed_requests"] += len(test_urls)
            raise

        finally:
            self._metrics["total_requests"] += len(test_urls)

    @pytest.mark.asyncio
    async def test_error_handling(self, aioresponses, metrics_collector):
        """
        Test error handling and recovery mechanisms with comprehensive scenarios.
        Validates system maintains < 0.1% error rate.
        """
        # Setup test scenarios
        test_url = "http://test.com/error"
        error_scenarios = [
            (408, "Request Timeout"),
            (429, "Too Many Requests"),
            (500, "Internal Server Error"),
            (503, "Service Unavailable")
        ]

        total_requests = len(error_scenarios)
        successful_retries = 0

        for status, error_message in error_scenarios:
            # First attempt fails
            aioresponses.get(
                test_url,
                status=status,
                body=error_message,
                repeat=True
            )
            # Retry succeeds
            aioresponses.get(
                test_url,
                status=200,
                body=TEST_HTML_CONTENT,
                repeat=True
            )

            try:
                # Attempt extraction with retry
                data = await self._extractor.extract(test_url)
                
                # Validate retry success
                assert data["content"] == "Test Data"
                successful_retries += 1

            except Exception as e:
                self._metrics["failed_requests"] += 1

            finally:
                self._metrics["total_requests"] += 1

        # Calculate error rate
        error_rate = (self._metrics["failed_requests"] / self._metrics["total_requests"])
        assert error_rate <= PERFORMANCE_THRESHOLDS["max_error_rate"]