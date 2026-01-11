"""
Cache service for AI answers and analysis results
Uses Redis for caching
"""
import asyncio
import logging
import json
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
import os

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from src.config import get_settings
from lib.errors import CacheError

logger = logging.getLogger(__name__)
settings = get_settings()

# Lock for thread-safe singleton initialization
_cache_service_lock = asyncio.Lock()


@dataclass
class CacheOptions:
    """Cache operation options"""
    ttl: Optional[int] = None  # Time to live in seconds
    prefix: Optional[str] = None  # Key prefix


class AsyncRedisClient:
    """Asynchronous Redis client for ai-detection service"""

    def __init__(self):
        self.client: Optional[aioredis.Redis] = None
        self._initialized = False
        self._init_lock = asyncio.Lock()

    async def initialize(self):
        """Initialize the async client with proper locking to prevent race conditions"""
        # Fast path: already initialized
        if self._initialized:
            return

        # Slow path: acquire lock and initialize
        async with self._init_lock:
            # Double-check after acquiring lock
            if self._initialized:
                return

            # Parse REDIS_URL if available, otherwise use individual vars
            redis_url = os.getenv('REDIS_URL', '')
            if redis_url:
                self.client = aioredis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_timeout=10,
                    socket_connect_timeout=10,
                )
            else:
                self.client = aioredis.Redis(
                    host=os.getenv('REDIS_HOST', 'localhost'),
                    port=int(os.getenv('REDIS_PORT', '6379')),
                    password=os.getenv('REDIS_PASSWORD'),
                    db=int(os.getenv('REDIS_DB', '0')),
                    decode_responses=True,
                    socket_timeout=10,
                    socket_connect_timeout=10,
                )

            await self._test_connection()
            self._initialized = True

    async def _test_connection(self) -> None:
        """Test Redis connection"""
        try:
            await self.client.ping()
            logger.info("Connected to Redis server")
        except RedisError as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    def _build_key(self, key: str, prefix: Optional[str] = None) -> str:
        """Build full key with optional prefix"""
        return f"{prefix}:{key}" if prefix else key

    async def get(self, key: str, options: Optional[CacheOptions] = None) -> Optional[Any]:
        """Get value from cache"""
        if not self._initialized:
            await self.initialize()

        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            value = await self.client.get(full_key)

            if value is None:
                return None

            return json.loads(value)
        except RedisError as e:
            logger.error(f"Error getting key {key}: {e}")
            raise

    async def set(self, key: str, value: Any, options: Optional[CacheOptions] = None) -> None:
        """Set value in cache"""
        if not self._initialized:
            await self.initialize()

        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            serialized = json.dumps(value)

            if opts.ttl:
                await self.client.setex(full_key, opts.ttl, serialized)
            else:
                await self.client.set(full_key, serialized)
        except RedisError as e:
            logger.error(f"Error setting key {key}: {e}")
            raise

    async def close(self) -> None:
        """Close Redis connection and reset state"""
        async with self._init_lock:
            if self.client:
                await self.client.close()
                self.client = None
            self._initialized = False
            logger.info("Redis connection closed")


# Singleton instance
_async_redis_client: Optional[AsyncRedisClient] = None


def get_async_redis_client() -> AsyncRedisClient:
    """Get singleton async Redis client instance"""
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = AsyncRedisClient()
    return _async_redis_client


class CacheService:
    """Cache management for AI detection service"""

    def __init__(self):
        """Initialize cache service"""
        self.redis_client = get_async_redis_client()
        self.cache_prefix = settings.CACHE_PREFIX

    async def get_ai_answers(
        self,
        question_hash: str
    ) -> Optional[Dict[str, Dict]]:
        """
        Get cached AI answers for a question

        Args:
            question_hash: Question hash

        Returns:
            Dictionary of model_name -> {answer, embedding, perplexity}
        """
        try:
            cache_key = f"{self.cache_prefix}:ai_answers:{question_hash}"
            cached_data = await self.redis_client.get(
                cache_key,
                CacheOptions(prefix=None)
            )

            if cached_data:
                logger.info(f"Cache hit (Redis) for question hash: {question_hash}")
                return cached_data

            logger.info(f"Cache miss for question hash: {question_hash}")
            return None

        except Exception as e:
            logger.error(f"Error getting cached AI answers: {e}")
            raise CacheError(str(e), "get_ai_answers")

    async def save_ai_answers(
        self,
        question_hash: str,
        question_text: str,
        ai_answers: Dict[str, Dict]
    ):
        """
        Save AI answers to cache (Redis)

        Args:
            question_hash: Question hash
            question_text: Question text
            ai_answers: Dictionary of model_name -> {answer, embedding, perplexity}
        """
        try:
            cache_key = f"{self.cache_prefix}:ai_answers:{question_hash}"
            await self.redis_client.set(
                cache_key,
                ai_answers,
                CacheOptions(
                    ttl=settings.AI_ANSWER_CACHE_TTL,
                    prefix=None
                )
            )

            logger.info(f"Saved AI answers to cache for question hash: {question_hash}")

        except Exception as e:
            logger.error(f"Error saving AI answers to cache: {e}")
            raise CacheError(str(e), "save_ai_answers")

    async def get_analysis_result(
        self,
        analysis_id: str
    ) -> Optional[Dict]:
        """
        Get cached analysis result

        Args:
            analysis_id: Analysis ID

        Returns:
            Analysis result or None
        """
        try:
            cache_key = f"{self.cache_prefix}:analysis:{analysis_id}"
            cached_data = await self.redis_client.get(
                cache_key,
                CacheOptions(prefix=None)
            )

            if cached_data:
                logger.info(f"Cache hit for analysis: {analysis_id}")

            return cached_data

        except Exception as e:
            logger.error(f"Error getting cached analysis: {e}")
            return None

    async def save_analysis_result(
        self,
        analysis_id: str,
        analysis_data: Dict
    ):
        """
        Save analysis result to cache

        Args:
            analysis_id: Analysis ID
            analysis_data: Analysis result data
        """
        try:
            cache_key = f"{self.cache_prefix}:analysis:{analysis_id}"
            await self.redis_client.set(
                cache_key,
                analysis_data,
                CacheOptions(
                    ttl=settings.ANALYSIS_CACHE_TTL,
                    prefix=None
                )
            )

            logger.info(f"Saved analysis result to cache: {analysis_id}")

        except Exception as e:
            logger.error(f"Error saving analysis to cache: {e}")
            # Don't raise error for cache save failures

    async def delete_cache(self, pattern: str):
        """
        Delete cache entries by pattern

        Args:
            pattern: Cache key pattern
        """
        try:
            full_pattern = f"{self.cache_prefix}:{pattern}"
            # Note: delete_pattern is not available in async client
            # This is a placeholder for manual implementation
            logger.warning("Async delete_pattern not implemented")

        except Exception as e:
            logger.error(f"Error deleting cache: {e}")
            raise CacheError(str(e), "delete_cache")


# Singleton instance
_cache_service: Optional[CacheService] = None


async def get_cache_service() -> CacheService:
    """
    Get singleton cache service instance.

    Uses async lock to prevent race conditions during initialization.

    Returns:
        Cache service
    """
    global _cache_service

    # Fast path: if already initialized, return immediately
    if _cache_service is not None:
        return _cache_service

    # Slow path: acquire lock and initialize if needed
    async with _cache_service_lock:
        # Double-check after acquiring lock (another task may have initialized)
        if _cache_service is None:
            service = CacheService()
            await service.redis_client.initialize()
            _cache_service = service

    return _cache_service
