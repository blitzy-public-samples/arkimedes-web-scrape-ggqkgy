"""
Enterprise-grade pytest configuration and fixtures for comprehensive testing of the web scraping platform.
Implements isolated test environments, async support, and thorough resource management.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import os
from typing import AsyncGenerator, Dict, Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, AsyncEngine
from prometheus_client import CollectorRegistry, Counter, Histogram

# Internal imports
from src.api.server import create_application
from src.db.session import Base, get_session, get_async_session
from src.services.cache import CacheService
from src.utils.logging import TestLogger

# Test configuration constants
TEST_DB_URL = os.getenv("TEST_DB_URL", "postgresql+asyncpg://test:test@localhost:5432/test_db")
TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/1")
TEST_LOG_LEVEL = "DEBUG"

# Initialize test metrics
test_registry = CollectorRegistry()
test_request_counter = Counter(
    "test_requests_total",
    "Total test requests",
    ["method", "endpoint", "status"],
    registry=test_registry
)
test_request_latency = Histogram(
    "test_request_duration_seconds",
    "Test request duration",
    ["endpoint"],
    registry=test_registry
)

def pytest_configure(config):
    """
    Configure pytest environment with enhanced logging and monitoring.
    
    Args:
        config: pytest configuration object
    """
    # Initialize test logger
    TestLogger.setup(level=TEST_LOG_LEVEL)
    
    # Configure test environment variables
    os.environ["TESTING"] = "1"
    os.environ["DATABASE_URL"] = TEST_DB_URL
    os.environ["REDIS_URL"] = TEST_REDIS_URL
    
    # Configure test metrics collection
    config.test_metrics = {
        "counter": test_request_counter,
        "latency": test_request_latency
    }

@pytest.fixture(scope="session")
async def event_loop() -> AsyncGenerator[asyncio.AbstractEventLoop, None]:
    """
    Create and manage event loop for async tests with proper cleanup.
    
    Yields:
        asyncio.AbstractEventLoop: Configured event loop instance
    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    await loop.shutdown_asyncgens()
    loop.close()

@pytest.fixture(scope="session")
async def test_db_engine() -> AsyncGenerator[AsyncEngine, None]:
    """
    Create and manage test database engine with isolation.
    
    Yields:
        AsyncEngine: Configured SQLAlchemy engine
    """
    engine = create_async_engine(
        TEST_DB_URL,
        echo=True,
        pool_size=5,
        max_overflow=10,
        isolation_level="REPEATABLE READ"
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture
async def test_db_session(test_db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Provide isolated test database session with transaction management.
    
    Args:
        test_db_engine: Test database engine
        
    Yields:
        AsyncSession: Configured database session
    """
    connection = await test_db_engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)
    
    yield session
    
    await session.close()
    await transaction.rollback()
    await connection.close()

@pytest.fixture
async def test_cache() -> AsyncGenerator[CacheService, None]:
    """
    Provide isolated test cache service with monitoring.
    
    Yields:
        CacheService: Configured Redis cache service
    """
    cache = CacheService(
        host="localhost",
        port=6379,
        password="",
        use_ssl=False
    )
    await cache.connect()
    
    # Set test-specific prefix
    test_prefix = f"test_{uuid4()}"
    cache._prefix = test_prefix
    
    yield cache
    
    # Cleanup test data
    await cache.redis_client.delete(f"{test_prefix}*")
    await cache.disconnect()

@pytest.fixture
async def test_client(
    test_db_session: AsyncSession,
    test_cache: CacheService
) -> AsyncGenerator[AsyncClient, None]:
    """
    Provide configured async HTTP test client with dependencies.
    
    Args:
        test_db_session: Test database session
        test_cache: Test cache service
        
    Yields:
        AsyncClient: Configured test client
    """
    app = create_application()
    
    # Override dependencies for testing
    app.dependency_overrides[get_session] = lambda: test_db_session
    app.dependency_overrides[get_async_session] = lambda: test_db_session
    
    # Configure test client
    async with AsyncClient(
        app=app,
        base_url="http://test",
        headers={"Content-Type": "application/json"},
        timeout=30.0
    ) as client:
        yield client