"""
High-performance Redis-based distributed caching service with connection pooling,
automatic retry mechanisms, rate limiting, and comprehensive error handling.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import ssl
from typing import Any, Optional, Dict
import time

# Third-party imports with versions
import redis.asyncio  # v4.5.0
import aioredis  # v2.0.0
import orjson  # v3.9.0

# Internal imports
from ..api.core.config import get_redis_uri, get_redis_ssl_context
from ..utils.retry import AsyncRetry

# Constants for cache configuration
DEFAULT_TTL = 900  # 15 minutes default TTL
RATE_LIMIT_WINDOW = 60  # 1 minute rate limit window
REDIS_RETRY_ATTEMPTS = 3
REDIS_POOL_SIZE = 50
REDIS_POOL_TIMEOUT = 20
REDIS_CONNECT_TIMEOUT = 5
REDIS_HEALTH_CHECK_INTERVAL = 30

class CacheService:
    """
    Thread-safe asynchronous Redis cache service with connection pooling,
    health checks, and comprehensive error handling.
    """

    def __init__(self, host: str, port: int, password: str, use_ssl: bool = True) -> None:
        """
        Initialize Redis connection pool and client with SSL support.

        Args:
            host: Redis server hostname
            port: Redis server port
            password: Redis server password
            use_ssl: Enable SSL/TLS connection
        """
        self._redis_client: Optional[redis.asyncio.Redis] = None
        self._pool: Optional[aioredis.ConnectionPool] = None
        self._connected: bool = False
        self._metrics: Dict[str, int] = {
            "hits": 0,
            "misses": 0,
            "errors": 0,
            "rate_limit_hits": 0
        }
        
        # Configure SSL context if enabled
        self._ssl_context = None
        if use_ssl:
            self._ssl_context = get_redis_ssl_context()
            
        # Configure connection pool
        self._pool = aioredis.ConnectionPool(
            host=host,
            port=port,
            password=password,
            ssl=self._ssl_context,
            max_connections=REDIS_POOL_SIZE,
            timeout=REDIS_POOL_TIMEOUT,
            retry_on_timeout=True,
            health_check_interval=REDIS_HEALTH_CHECK_INTERVAL
        )
        
        # Initialize Redis client with pool
        self._redis_client = redis.asyncio.Redis(
            connection_pool=self._pool,
            socket_timeout=REDIS_CONNECT_TIMEOUT,
            retry_on_timeout=True,
            decode_responses=True
        )

    @AsyncRetry(max_retries=REDIS_RETRY_ATTEMPTS, backoff_factor=2)
    async def connect(self) -> bool:
        """
        Establishes secure connection to Redis server with health check.

        Returns:
            bool: Connection success status
        """
        try:
            if self._redis_client:
                # Verify connection with ping
                await self._redis_client.ping()
                self._connected = True
                
                # Start health check background task
                asyncio.create_task(self._health_check_loop())
                return True
            return False
        except Exception as e:
            self._metrics["errors"] += 1
            raise redis.RedisError(f"Failed to connect to Redis: {str(e)}")

    async def disconnect(self) -> None:
        """
        Safely closes Redis connection and performs cleanup.
        """
        try:
            if self._redis_client:
                await self._redis_client.close()
            if self._pool:
                await self._pool.disconnect()
            self._connected = False
            self._metrics.clear()
        except Exception as e:
            self._metrics["errors"] += 1
            raise redis.RedisError(f"Error disconnecting from Redis: {str(e)}")

    @AsyncRetry(max_retries=REDIS_RETRY_ATTEMPTS, backoff_factor=2)
    async def get(self, key: str) -> Any:
        """
        Retrieves and deserializes value from cache with metrics tracking.

        Args:
            key: Cache key to retrieve

        Returns:
            Any: Cached value or None if not found
        """
        if not self._connected or not self._redis_client:
            raise redis.RedisError("Redis client not connected")

        try:
            value = await self._redis_client.get(key)
            if value:
                self._metrics["hits"] += 1
                return orjson.loads(value)
            self._metrics["misses"] += 1
            return None
        except Exception as e:
            self._metrics["errors"] += 1
            raise redis.RedisError(f"Error retrieving from cache: {str(e)}")

    @AsyncRetry(max_retries=REDIS_RETRY_ATTEMPTS, backoff_factor=2)
    async def set(self, key: str, value: Any, ttl: int = DEFAULT_TTL) -> bool:
        """
        Serializes and stores value in cache with TTL.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (default: 15 minutes)

        Returns:
            bool: Operation success status
        """
        if not self._connected or not self._redis_client:
            raise redis.RedisError("Redis client not connected")

        try:
            serialized = orjson.dumps(value)
            return await self._redis_client.set(key, serialized, ex=ttl)
        except Exception as e:
            self._metrics["errors"] += 1
            raise redis.RedisError(f"Error setting cache value: {str(e)}")

    @AsyncRetry(max_retries=REDIS_RETRY_ATTEMPTS, backoff_factor=2)
    async def delete(self, key: str) -> bool:
        """
        Removes value from cache with metric tracking.

        Args:
            key: Cache key to delete

        Returns:
            bool: Operation success status
        """
        if not self._connected or not self._redis_client:
            raise redis.RedisError("Redis client not connected")

        try:
            return bool(await self._redis_client.delete(key))
        except Exception as e:
            self._metrics["errors"] += 1
            raise redis.RedisError(f"Error deleting cache key: {str(e)}")

    @AsyncRetry(max_retries=REDIS_RETRY_ATTEMPTS, backoff_factor=2)
    async def check_rate_limit(self, key: str, limit: int) -> bool:
        """
        Implements atomic token bucket rate limiting with Redis.

        Args:
            key: Rate limit key
            limit: Maximum requests per window

        Returns:
            bool: True if within limit, False if rate limited
        """
        if not self._connected or not self._redis_client:
            raise redis.RedisError("Redis client not connected")

        try:
            # Atomic rate limit script
            script = """
            local current = redis.call('get', KEYS[1])
            if not current then
                redis.call('setex', KEYS[1], ARGV[2], 1)
                return 1
            elseif tonumber(current) < tonumber(ARGV[1]) then
                redis.call('incr', KEYS[1])
                return 1
            else
                return 0
            end
            """
            
            result = await self._redis_client.eval(
                script,
                keys=[key],
                args=[limit, RATE_LIMIT_WINDOW]
            )
            
            if not result:
                self._metrics["rate_limit_hits"] += 1
                return False
            return True
        except Exception as e:
            self._metrics["errors"] += 1
            raise redis.RedisError(f"Error checking rate limit: {str(e)}")

    async def health_check(self) -> bool:
        """
        Performs periodic Redis health checks.

        Returns:
            bool: Health status
        """
        try:
            if self._redis_client:
                # Check Redis connection
                await self._redis_client.ping()
                
                # Check pool status
                if self._pool:
                    pool_info = await self._redis_client.info("clients")
                    connected_clients = pool_info.get("connected_clients", 0)
                    if connected_clients >= REDIS_POOL_SIZE:
                        raise redis.RedisError("Connection pool exhausted")
                
                return True
            return False
        except Exception:
            self._metrics["errors"] += 1
            return False

    async def _health_check_loop(self) -> None:
        """Background task for periodic health checks."""
        while self._connected:
            try:
                await self.health_check()
                await asyncio.sleep(REDIS_HEALTH_CHECK_INTERVAL)
            except Exception:
                continue

# Export the cache service
__all__ = ['CacheService']