"""
Cache service for AI answers and analysis results
Uses both Redis and PostgreSQL (pgvector)
"""
import logging
import json
from typing import Optional, Dict, List
import sys
import os

# Add parent directory to path to import shared modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from backend.shared.cache.redis_client import get_async_redis_client, CacheOptions
from src.database import DatabaseManager
from src.config import get_settings
from lib.errors import CacheError, DatabaseError

logger = logging.getLogger(__name__)
settings = get_settings()


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
            # Try Redis first
            cache_key = f"{self.cache_prefix}:ai_answers:{question_hash}"
            cached_data = await self.redis_client.get(
                cache_key,
                CacheOptions(prefix=None)
            )

            if cached_data:
                logger.info(f"Cache hit (Redis) for question hash: {question_hash}")
                return cached_data

            # Fallback to PostgreSQL
            with DatabaseManager() as db:
                cached_answers = db.get_all_ai_answers_for_question(question_hash)

                if not cached_answers:
                    logger.info(f"Cache miss for question hash: {question_hash}")
                    return None

                # Build response
                result = {}
                for cache_entry in cached_answers:
                    result[cache_entry.model_name] = {
                        "answer": cache_entry.answer_text,
                        "embedding": cache_entry.embedding,
                        "perplexity": float(cache_entry.perplexity_score) if cache_entry.perplexity_score else None,
                        "token_count": cache_entry.token_count
                    }

                # Cache in Redis for next time
                await self.redis_client.set(
                    cache_key,
                    result,
                    CacheOptions(
                        ttl=settings.AI_ANSWER_CACHE_TTL,
                        prefix=None
                    )
                )

                logger.info(f"Cache hit (PostgreSQL) for question hash: {question_hash}")
                return result

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
        Save AI answers to cache (both Redis and PostgreSQL)

        Args:
            question_hash: Question hash
            question_text: Question text
            ai_answers: Dictionary of model_name -> {answer, embedding, perplexity}
        """
        try:
            # Save to PostgreSQL
            with DatabaseManager() as db:
                for model_name, answer_data in ai_answers.items():
                    db.save_ai_answer_cache(
                        question_hash=question_hash,
                        question_text=question_text,
                        model_name=model_name,
                        answer_text=answer_data["answer"],
                        embedding=answer_data["embedding"],
                        perplexity_score=answer_data.get("perplexity"),
                        token_count=answer_data.get("token_count")
                    )

            # Save to Redis
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
