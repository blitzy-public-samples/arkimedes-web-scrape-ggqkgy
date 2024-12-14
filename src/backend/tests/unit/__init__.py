"""
Unit Test Suite Configuration
----------------------------
Configures pytest markers and test utilities for backend service unit tests.
Implements comprehensive test categorization for different test types including
async, sync, utils, api, db, cache, and scraper tests.

Version: 1.0.0
"""

# External imports
import pytest  # pytest ^7.4.0 - Testing framework for marker registration

# Define available unit test markers for test categorization
UNIT_TEST_MARKERS = [
    "unit",     # Basic unit tests for individual components
    "async",    # Tests for asynchronous functions
    "sync",     # Tests for synchronous functions
    "utils",    # Tests for utility functions
    "api",      # Tests for API endpoints
    "db",       # Tests for database operations
    "cache",    # Tests for caching mechanisms
    "scraper"   # Tests for web scraping components
]

def pytest_configure(config):
    """
    Pytest hook to configure test markers for the unit test suite.
    Registers custom markers for different test categories to enable
    selective test execution and proper test organization.

    Args:
        config: The pytest configuration object

    Returns:
        None: Markers are registered directly in the pytest configuration

    Example:
        To run only API tests:
        pytest -m api

        To run async and db tests:
        pytest -m "async or db"
    """
    try:
        # Register all unit test markers with descriptive messages
        marker_definitions = {
            "unit": "Mark test as a basic unit test verifying individual component functionality",
            "async": "Mark test as requiring async test runner for asynchronous function testing",
            "sync": "Mark test as a synchronous function test with standard execution",
            "utils": "Mark test as a utility function test covering helper functions",
            "api": "Mark test as an API endpoint test verifying request/response handling",
            "db": "Mark test as a database operation test ensuring data persistence",
            "cache": "Mark test as a caching mechanism test validating cache operations",
            "scraper": "Mark test as a web scraping component test checking extraction logic"
        }

        # Register each marker in pytest configuration
        for marker, description in marker_definitions.items():
            config.addinivalue_line(
                "markers",
                f"{marker}: {description}"
            )

    except Exception as e:
        # Log error but don't fail test suite initialization
        import logging
        logging.error(f"Failed to register pytest markers: {str(e)}")
        # Re-raise if in strict mode
        if config.option.strict_markers:
            raise

# Export the pytest configuration hook for test framework initialization
__all__ = ['pytest_configure']