"""
Comprehensive integration tests for the web scraping platform's REST API endpoints.
Tests authentication flows, task management, rate limiting, and error handling with
database transaction management and external service mocking.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# Internal imports
from src.api.core.config import settings
from src.api.core.security import create_access_token
from src.db.models.task import Task, TaskConfig
from src.services.metrics import MetricsCollector

# Constants for testing
API_V1_PREFIX = "/api/v1"
TASKS_ENDPOINT = f"{API_V1_PREFIX}/tasks"
TEST_TIMEOUT = 30
RATE_LIMIT_PER_MINUTE = 1000

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.timeout(TEST_TIMEOUT)
async def test_create_task(
    async_client: AsyncClient,
    test_user: Dict[str, Any],
    db_session: AsyncSession
) -> None:
    """
    Test task creation endpoint with comprehensive validation.
    
    Args:
        async_client: Test HTTP client
        test_user: Test user fixture
        db_session: Test database session
    """
    # Prepare test data
    task_data = {
        "name": "Test Scraping Task",
        "configuration": {
            "url_pattern": "https://example.com/products/*",
            "selectors": {
                "title": "h1.product-title",
                "price": "span.price",
                "description": "div.description"
            },
            "extraction_rules": [
                {
                    "field_name": "title",
                    "selector_key": "title",
                    "data_type": "string"
                },
                {
                    "field_name": "price",
                    "selector_key": "price",
                    "data_type": "float"
                }
            ],
            "rate_limits": {
                "requests_per_minute": 60,
                "max_concurrent": 1
            }
        },
        "schedule": "*/15 * * * *",  # Every 15 minutes
        "priority": "medium"
    }

    # Create access token
    token = create_access_token({"sub": str(test_user["id"])})
    headers = {"Authorization": f"Bearer {token}"}

    # Test successful task creation
    response = await async_client.post(
        f"{TASKS_ENDPOINT}/",
        json=task_data,
        headers=headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == task_data["name"]
    assert data["status"] == "pending"
    assert "id" in data

    # Verify database state
    task = await db_session.get(Task, uuid.UUID(data["id"]))
    assert task is not None
    assert task.name == task_data["name"]
    assert task.user_id == uuid.UUID(test_user["id"])

    # Test duplicate task name
    response = await async_client.post(
        f"{TASKS_ENDPOINT}/",
        json=task_data,
        headers=headers
    )
    assert response.status_code == 422

    # Test invalid configuration
    invalid_task = task_data.copy()
    invalid_task["configuration"]["url_pattern"] = "invalid-url"
    response = await async_client.post(
        f"{TASKS_ENDPOINT}/",
        json=invalid_task,
        headers=headers
    )
    assert response.status_code == 422

    # Test rate limiting
    tasks = []
    for i in range(RATE_LIMIT_PER_MINUTE + 1):
        task_data["name"] = f"Test Task {i}"
        tasks.append(
            async_client.post(
                f"{TASKS_ENDPOINT}/",
                json=task_data,
                headers=headers
            )
        )
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    assert any(r.status_code == 429 for r in responses if hasattr(r, 'status_code'))

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.security
async def test_authentication(
    async_client: AsyncClient,
    test_user: Dict[str, Any]
) -> None:
    """
    Test API authentication mechanisms and security controls.
    
    Args:
        async_client: Test HTTP client
        test_user: Test user fixture
    """
    # Test missing token
    response = await async_client.get(f"{TASKS_ENDPOINT}/")
    assert response.status_code == 401

    # Test invalid token
    headers = {"Authorization": "Bearer invalid-token"}
    response = await async_client.get(f"{TASKS_ENDPOINT}/", headers=headers)
    assert response.status_code == 401

    # Test expired token
    expired_token = create_access_token(
        {"sub": str(test_user["id"])},
        expires_delta=timedelta(seconds=-1)
    )
    headers = {"Authorization": f"Bearer {expired_token}"}
    response = await async_client.get(f"{TASKS_ENDPOINT}/", headers=headers)
    assert response.status_code == 401

    # Test valid token
    valid_token = create_access_token({"sub": str(test_user["id"])})
    headers = {"Authorization": f"Bearer {valid_token}"}
    response = await async_client.get(f"{TASKS_ENDPOINT}/", headers=headers)
    assert response.status_code == 200

    # Test token refresh
    refresh_token = create_access_token(
        {"sub": str(test_user["id"])},
        expires_delta=timedelta(days=30)
    )
    headers = {
        "Authorization": f"Bearer {expired_token}",
        "X-Refresh-Token": refresh_token
    }
    response = await async_client.post(
        f"{API_V1_PREFIX}/auth/refresh",
        headers=headers
    )
    assert response.status_code == 200
    assert "access_token" in response.json()

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.performance
async def test_rate_limiting(
    async_client: AsyncClient,
    test_user: Dict[str, Any],
    redis_client: Redis
) -> None:
    """
    Test API rate limiting functionality and performance boundaries.
    
    Args:
        async_client: Test HTTP client
        test_user: Test user fixture
        redis_client: Redis client fixture
    """
    # Setup test token
    token = create_access_token({"sub": str(test_user["id"])})
    headers = {"Authorization": f"Bearer {token}"}

    # Test rate limit headers
    response = await async_client.get(f"{TASKS_ENDPOINT}/", headers=headers)
    assert response.status_code == 200
    assert "X-RateLimit-Limit" in response.headers
    assert "X-RateLimit-Remaining" in response.headers
    assert "X-RateLimit-Reset" in response.headers

    # Test concurrent requests within limit
    tasks = []
    for _ in range(10):
        tasks.append(
            async_client.get(f"{TASKS_ENDPOINT}/", headers=headers)
        )
    responses = await asyncio.gather(*tasks)
    assert all(r.status_code == 200 for r in responses)

    # Test rate limit exceeded
    tasks = []
    for _ in range(RATE_LIMIT_PER_MINUTE + 1):
        tasks.append(
            async_client.get(f"{TASKS_ENDPOINT}/", headers=headers)
        )
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    assert any(r.status_code == 429 for r in responses if hasattr(r, 'status_code'))

    # Test rate limit reset
    await asyncio.sleep(60)  # Wait for rate limit window to reset
    response = await async_client.get(f"{TASKS_ENDPOINT}/", headers=headers)
    assert response.status_code == 200

    # Test rate limit persistence
    rate_limit_key = f"rate_limit:{test_user['id']}"
    count = await redis_client.get(rate_limit_key)
    assert count is not None
    assert int(count) > 0