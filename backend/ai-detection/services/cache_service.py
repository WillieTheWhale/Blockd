"""
Cache service for AI answers and analysis results
Uses Redis for caching with hash validation to prevent cache poisoning
"""
import logging
import json
import hashlib
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
import os

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from src.config import get_settings
from lib.errors import CacheError

logger = logging.getLogger(__name__)
settings = get_settings()


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

    async def initialize(self):
        """Initialize the async client"""
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
        """Close Redis connection"""
        if self.client:
            await self.client.close()


# Singleton instance
_async_redis_client: Optional[AsyncRedisClient] = None


def get_async_redis_client() -> AsyncRedisClient:
    """Get singleton async Redis client instance"""
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = AsyncRedisClient()
    return _async_redis_client


def compute_content_hash(content: Dict) -> str:
    """
    Compute SHA-256 hash of cache content for integrity validation.

    Args:
        content: Dictionary content to hash

    Returns:
        Hex-encoded SHA-256 hash
    """
    # Serialize with sorted keys for consistent hashing
    serialized = json.dumps(content, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(serialized.encode()).hexdigest()


def validate_content_hash(content: Dict, expected_hash: str) -> bool:
    """
    Validate that content matches expected hash.

    Args:
        content: Dictionary content to validate
        expected_hash: Expected SHA-256 hash

    Returns:
        True if content hash matches expected hash
    """
    actual_hash = compute_content_hash(content)
    return actual_hash == expected_hash


class CacheService:
    """Cache management for AI detection service with integrity validation"""

    def __init__(self):
        """Initialize cache service"""
        self.redis_client = get_async_redis_client()
        self.cache_prefix = settings.CACHE_PREFIX

    async def get_ai_answers(
        self,
        question_hash: str
    ) -> Optional[Dict[str, Dict]]:
        """
        Get cached AI answers for a question with integrity validation.

        Args:
            question_hash: Question hash

        Returns:
            Dictionary of model_name -> {answer, embedding, perplexity}
            Returns None if cache miss or validation fails
        """
        try:
            cache_key = f"{self.cache_prefix}:ai_answers:{question_hash}"
            cached_data = await self.redis_client.get(
                cache_key,
                CacheOptions(prefix=None)
            )

            if cached_data:
                # Validate cache integrity
                stored_hash = cached_data.get("_content_hash")
                if stored_hash:
                    # Remove hash from content for validation
                    content_to_validate = {k: v for k, v in cached_data.items() if k != "_content_hash"}
                    if not validate_content_hash(content_to_validate, stored_hash):
                        logger.warning(
                            f"Cache integrity validation failed for question hash: {question_hash}. "
                            "Possible cache poisoning detected. Treating as cache miss."
                        )
                        # Delete the corrupted cache entry
                        await self.redis_client.client.delete(cache_key)
                        return None

                    # Return validated content without the hash field
                    logger.info(f"Cache hit (Redis) with valid integrity for question hash: {question_hash}")
                    return content_to_validate
                else:
                    # Legacy cache entry without hash - still return but log warning
                    logger.warning(f"Cache entry missing integrity hash for question hash: {question_hash}")
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
        Save AI answers to cache (Redis) with integrity hash.

        Computes SHA-256 hash of content to detect cache poisoning on retrieval.

        Args:
            question_hash: Question hash
            question_text: Question text
            ai_answers: Dictionary of model_name -> {answer, embedding, perplexity}
        """
        try:
            cache_key = f"{self.cache_prefix}:ai_answers:{question_hash}"

            # Compute content hash for integrity validation
            content_hash = compute_content_hash(ai_answers)

            # Include hash in stored data
            cache_data = {
                **ai_answers,
                "_content_hash": content_hash
            }

            await self.redis_client.set(
                cache_key,
                cache_data,
                CacheOptions(
                    ttl=settings.AI_ANSWER_CACHE_TTL,
                    prefix=None
                )
            )

            logger.info(f"Saved AI answers to cache for question hash: {question_hash} with integrity hash")

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
_cache_service = None


async def get_cache_service() -> CacheService:
    """
    Get singleton cache service instance

    Returns:
        Cache service
    """
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
        await _cache_service.redis_client.initialize()
    return _cache_service
