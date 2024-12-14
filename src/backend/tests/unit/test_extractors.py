"""
Comprehensive test suite for validating data extraction capabilities, accuracy,
performance, and reliability of HTML, JSON, and XML extractors.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import pytest
import asyncio
from typing import Dict, Any
import json
from datetime import datetime

# Third-party imports with versions
import pytest_asyncio  # ^0.21.0
from pytest_mock import MockerFixture  # ^3.11.0
from pytest_benchmark.fixture import BenchmarkFixture  # ^4.0.0
import aiohttp  # ^3.8.0

# Internal imports
from scraper.extractors.base import BaseExtractor
from scraper.extractors.html import HTMLExtractor
from scraper.extractors.json import JSONExtractor
from scraper.extractors.xml import XMLExtractor
from utils.validation import ValidationError

# Test data constants
TEST_HTML_CONTENT = """
<html>
    <body>
        <div class="product">
            <h1 class="title">Test Product</h1>
            <span class="price">$19.99</span>
            <div class="description">Product description</div>
        </div>
        <div class="pagination">
            <a href="/page/2">Next</a>
        </div>
    </body>
</html>
"""

TEST_JSON_CONTENT = {
    "product": {
        "title": "Test Product",
        "price": 19.99,
        "description": "Product description",
        "metadata": {
            "timestamp": "2024-01-20T10:00:00Z"
        }
    }
}

TEST_XML_CONTENT = """
<?xml version="1.0" encoding="UTF-8"?>
<product>
    <title>Test Product</title>
    <price currency="USD">19.99</price>
    <description>Product description</description>
</product>
"""

@pytest.fixture
def base_config() -> Dict[str, Any]:
    """Fixture providing base configuration for extractors."""
    return {
        "timeout": 30,
        "retries": 3,
        "headers": {"User-Agent": "TestAgent/1.0"},
        "schema_version": "1.0",
        "validation_rules": {
            "strict_mode": True
        }
    }

@pytest.fixture
def html_config(base_config) -> Dict[str, Any]:
    """Fixture providing HTML extractor configuration."""
    return {
        **base_config,
        "selectors": {
            "title": {"type": "css", "value": "h1.title"},
            "price": {"type": "css", "value": "span.price"},
            "description": {"type": "css", "value": "div.description"}
        },
        "pagination": {
            "selector": "div.pagination a",
            "pattern": "{url}?page={page}"
        }
    }

@pytest.fixture
def json_config(base_config) -> Dict[str, Any]:
    """Fixture providing JSON extractor configuration."""
    return {
        **base_config,
        "json_schema": {
            "type": "object",
            "properties": {
                "product": {
                    "type": "object",
                    "required": ["title", "price"]
                }
            }
        },
        "field_mappings": {
            "product.title": "title",
            "product.price": "price",
            "product.description": "description"
        }
    }

@pytest.fixture
def xml_config(base_config) -> Dict[str, Any]:
    """Fixture providing XML extractor configuration."""
    return {
        **base_config,
        "extraction_rules": {
            "title": {"xpath": ".//title", "type": "single"},
            "price": {"xpath": ".//price", "type": "single"},
            "description": {"xpath": ".//description", "type": "single"}
        }
    }

class TestBaseExtractor:
    """Test suite for BaseExtractor functionality."""

    @pytest.mark.asyncio
    async def test_initialization(self, base_config):
        """Test extractor initialization with various configurations."""
        extractor = BaseExtractor(base_config)
        assert extractor._config == base_config
        assert extractor._headers["User-Agent"] == "TestAgent/1.0"

    @pytest.mark.asyncio
    async def test_fetch_with_retry(self, base_config, mocker: MockerFixture):
        """Test fetch method with retry logic."""
        mock_response = mocker.AsyncMock()
        mock_response.read.return_value = b"test content"
        mock_response.raise_for_status = mocker.Mock()
        
        mock_session = mocker.AsyncMock()
        mock_session.get.return_value = mock_response
        
        mocker.patch("aiohttp.ClientSession", return_value=mock_session)
        
        extractor = BaseExtractor(base_config)
        content = await extractor.fetch("http://test.com")
        
        assert content == b"test content"
        mock_session.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_validation(self, base_config):
        """Test data validation functionality."""
        extractor = BaseExtractor(base_config)
        test_data = {"field": "value"}
        is_valid, errors = await extractor.validate(test_data)
        assert isinstance(is_valid, bool)

class TestHTMLExtractor:
    """Test suite for HTMLExtractor functionality."""

    @pytest.mark.asyncio
    async def test_html_extraction(self, html_config, mocker: MockerFixture):
        """Test HTML content extraction with selectors."""
        mock_fetch = mocker.patch.object(
            HTMLExtractor,
            "fetch",
            return_value=TEST_HTML_CONTENT
        )

        extractor = HTMLExtractor(html_config)
        result = await extractor.extract("http://test.com")

        assert result["title"] == "Test Product"
        assert result["price"] == "$19.99"
        assert result["description"] == "Product description"
        mock_fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_pagination_handling(self, html_config, mocker: MockerFixture):
        """Test pagination handling in HTML extraction."""
        mock_responses = [
            TEST_HTML_CONTENT,
            TEST_HTML_CONTENT.replace("Test Product", "Test Product 2")
        ]
        
        mock_fetch = mocker.patch.object(
            HTMLExtractor,
            "fetch",
            side_effect=mock_responses
        )

        extractor = HTMLExtractor(html_config)
        result = await extractor.extract("http://test.com")

        assert mock_fetch.call_count == 2
        assert isinstance(result, dict)

class TestJSONExtractor:
    """Test suite for JSONExtractor functionality."""

    @pytest.mark.asyncio
    async def test_json_extraction(self, json_config, mocker: MockerFixture):
        """Test JSON data extraction and transformation."""
        mock_fetch = mocker.patch.object(
            JSONExtractor,
            "fetch",
            return_value=json.dumps(TEST_JSON_CONTENT)
        )

        extractor = JSONExtractor(json_config)
        result = await extractor.extract("http://test.com")

        assert result["title"] == "Test Product"
        assert result["price"] == 19.99
        assert result["description"] == "Product description"
        mock_fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_json_schema_validation(self, json_config):
        """Test JSON schema validation."""
        invalid_json = {"invalid": "data"}
        
        extractor = JSONExtractor(json_config)
        with pytest.raises(ValidationError):
            await extractor.parse_json(json.dumps(invalid_json))

class TestXMLExtractor:
    """Test suite for XMLExtractor functionality."""

    @pytest.mark.asyncio
    async def test_xml_extraction(self, xml_config, mocker: MockerFixture):
        """Test XML content extraction with XPath."""
        mock_fetch = mocker.patch.object(
            XMLExtractor,
            "fetch",
            return_value=TEST_XML_CONTENT
        )

        extractor = XMLExtractor(xml_config)
        result = await extractor.extract("http://test.com")

        assert result["data"]["title"] == "Test Product"
        assert "19.99" in result["data"]["price"]
        assert result["data"]["description"] == "Product description"
        mock_fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_xml_namespace_handling(self, xml_config, mocker: MockerFixture):
        """Test XML namespace handling."""
        namespaced_xml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <ns:product xmlns:ns="http://test.com/ns">
            <ns:title>Test Product</ns:title>
        </ns:product>
        """
        
        xml_config["namespaces"] = {"ns": "http://test.com/ns"}
        xml_config["extraction_rules"]["title"]["xpath"] = ".//ns:title"
        
        mock_fetch = mocker.patch.object(
            XMLExtractor,
            "fetch",
            return_value=namespaced_xml
        )

        extractor = XMLExtractor(xml_config)
        result = await extractor.extract("http://test.com")
        assert result["data"]["title"] == "Test Product"

@pytest.mark.benchmark
def test_extraction_performance(benchmark: BenchmarkFixture, html_config):
    """Benchmark extraction performance."""
    async def run_extraction():
        extractor = HTMLExtractor(html_config)
        return await extractor.parse_html(TEST_HTML_CONTENT)

    result = benchmark(
        lambda: asyncio.run(run_extraction())
    )
    assert result is not None

def test_error_rate_compliance(html_config):
    """Verify error rate stays below 0.1%."""
    error_count = 0
    total_operations = 1000

    async def run_test_operations():
        nonlocal error_count
        extractor = HTMLExtractor(html_config)
        
        for _ in range(total_operations):
            try:
                await extractor.parse_html(TEST_HTML_CONTENT)
            except Exception:
                error_count += 1

    asyncio.run(run_test_operations())
    error_rate = (error_count / total_operations) * 100
    assert error_rate <= 0.1, f"Error rate {error_rate}% exceeds 0.1% threshold"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])