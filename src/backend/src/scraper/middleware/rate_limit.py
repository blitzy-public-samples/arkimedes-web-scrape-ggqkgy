"""
Rate limiting middleware implementation for web scraping engine using Redis-based token bucket algorithm.
Provides distributed rate limiting with comprehensive monitoring and error handling.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import json
import logging
from typing import Dict, Optional, Tuple, TypeVar
import time

# Internal imports
from ...services.cache import CacheService
from ...api.core.exceptions import RateLimitExceeded

# Type variable for generic rate limit key
T = TypeVar('T')

# Constants for rate limiting configuration
DEFAULT_RATE_LIMIT = 1000  # Default requests per window
DEFAULT_WINDOW_SECONDS = 60  # Default window size in seconds
RATE_LIMIT_KEY_PREFIX = 'scraper:rate_limit:'
BURST_LIMIT_MULTIPLIER = 0.05  # 5% burst allowance
MAX_BACKOFF_SECONDS = 300  # Maximum backoff time in seconds

class RateLimitMiddleware:
    """
    Middleware for enforcing distributed rate limits on scraping requests using Redis-based 
    token bucket algorithm with comprehensive error handling and monitoring.
    """
    
    def __init__(
        self,
        cache: CacheService,
        rate_limits: Dict[str, int] = None,
        window_seconds: Dict[str, int] = None,
        burst_multipliers: Dict[str, float] = None
    ) -> None:
        """
        Initialize rate limit middleware with Redis cache and configurable limits.

        Args:
            cache: Redis cache service instance
            rate_limits: Domain-specific rate limits (requests/window)
            window_seconds: Domain-specific window sizes
            burst_multipliers: Domain-specific burst allowances
        """
        self._cache = cache
        self._logger = logging.getLogger(__name__)
        
        # Initialize configuration with defaults
        self._rate_limits = rate_limits or {}
        self._window_seconds = window_seconds or {}
        self._burst_multipliers = burst_multipliers or {}
        
        # Set up monitoring metrics
        self._metrics = {
            "rate_limit_hits": 0,
            "rate_limit_misses": 0,
            "rate_limit_errors": 0
        }

    def _get_rate_limit_key(self, domain: str, client_id: Optional[str] = None) -> str:
        """
        Generate Redis key for domain rate limiting with optional client specificity.

        Args:
            domain: Target domain for rate limiting
            client_id: Optional client identifier for per-client limits

        Returns:
            Formatted Redis key
        """
        # Sanitize domain for key generation
        safe_domain = domain.replace(':', '_').replace('/', '_')
        
        # Generate base key
        key = f"{RATE_LIMIT_KEY_PREFIX}{safe_domain}"
        
        # Add client-specific suffix if provided
        if client_id:
            safe_client = client_id.replace(':', '_').replace('/', '_')
            key = f"{key}:client:{safe_client}"
            
        return key

    async def check_rate_limit(
        self,
        domain: str,
        client_id: Optional[str] = None
    ) -> Tuple[bool, int, Optional[float]]:
        """
        Check if request is within rate limits using token bucket algorithm.

        Args:
            domain: Target domain to check
            client_id: Optional client identifier for per-client limits

        Returns:
            Tuple of (is_allowed, remaining_requests, backoff_time)
        """
        try:
            # Get domain-specific configuration
            rate_limit = self._rate_limits.get(domain, DEFAULT_RATE_LIMIT)
            window = self._window_seconds.get(domain, DEFAULT_WINDOW_SECONDS)
            burst_multiplier = self._burst_multipliers.get(domain, BURST_LIMIT_MULTIPLIER)
            
            # Calculate burst limit
            burst_limit = int(rate_limit * (1 + burst_multiplier))
            
            # Generate rate limit key
            key = self._get_rate_limit_key(domain, client_id)
            
            # Check rate limit using Redis
            script = """
                local current = redis.call('get', KEYS[1])
                if not current then
                    redis.call('setex', KEYS[1], ARGV[2], 1)
                    return {1, ARGV[1]}
                elseif tonumber(current) < tonumber(ARGV[1]) then
                    redis.call('incr', KEYS[1])
                    return {1, tonumber(ARGV[1]) - tonumber(current)}
                else
                    return {0, 0}
                end
            """
            
            result = await self._cache._redis_client.eval(
                script,
                keys=[key],
                args=[burst_limit, window]
            )
            
            is_allowed, remaining = result
            
            # Update metrics
            if is_allowed:
                self._metrics["rate_limit_misses"] += 1
                return True, remaining, None
            else:
                self._metrics["rate_limit_hits"] += 1
                # Calculate backoff time
                backoff = min(window * (1 - remaining/burst_limit), MAX_BACKOFF_SECONDS)
                return False, 0, backoff
                
        except Exception as e:
            self._metrics["rate_limit_errors"] += 1
            self._logger.error(
                "Rate limit check failed",
                extra={
                    "error": str(e),
                    "domain": domain,
                    "client_id": client_id
                },
                exc_info=True
            )
            # Fail closed on errors
            return False, 0, DEFAULT_WINDOW_SECONDS

    async def reset_rate_limit(self, domain: str, client_id: Optional[str] = None) -> bool:
        """
        Reset rate limit counter for a domain with optional client specificity.

        Args:
            domain: Target domain to reset
            client_id: Optional client identifier for per-client limits

        Returns:
            Success status
        """
        try:
            key = self._get_rate_limit_key(domain, client_id)
            
            # Acquire lock for atomic reset
            lock_key = f"{key}:lock"
            async with self._cache._redis_client.lock(lock_key):
                # Delete rate limit key
                await self._cache._redis_client.delete(key)
                
                self._logger.info(
                    "Rate limit reset successful",
                    extra={
                        "domain": domain,
                        "client_id": client_id
                    }
                )
                return True
                
        except Exception as e:
            self._logger.error(
                "Rate limit reset failed",
                extra={
                    "error": str(e),
                    "domain": domain,
                    "client_id": client_id
                },
                exc_info=True
            )
            return False

    async def handle_rate_limit(self, domain: str, client_id: Optional[str] = None) -> None:
        """
        Process rate limit check and handle exceeded scenarios with backoff strategy.

        Args:
            domain: Target domain to handle
            client_id: Optional client identifier for per-client limits

        Raises:
            RateLimitExceeded: When rate limit is exceeded
        """
        is_allowed, remaining, backoff = await self.check_rate_limit(domain, client_id)
        
        if not is_allowed:
            # Prepare quota details for exception
            quota_details = {
                "limit": self._rate_limits.get(domain, DEFAULT_RATE_LIMIT),
                "remaining": remaining,
                "window_seconds": self._window_seconds.get(domain, DEFAULT_WINDOW_SECONDS)
            }
            
            # Log rate limit event
            self._logger.warning(
                "Rate limit exceeded",
                extra={
                    "domain": domain,
                    "client_id": client_id,
                    "backoff_seconds": backoff,
                    "quota_details": quota_details
                }
            )
            
            # Raise rate limit exception with retry guidance
            raise RateLimitExceeded(
                retry_after=int(backoff) if backoff else DEFAULT_WINDOW_SECONDS,
                quota_details=quota_details
            )

# Export public interface
__all__ = ['RateLimitMiddleware']