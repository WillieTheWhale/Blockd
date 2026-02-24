"""
AI Detection Tasks
Handles answer analysis, embedding generation, and cache warming
"""

import os
import logging
import hashlib
from typing import Dict, Any, List, Optional
from celery import shared_task
import redis
import requests
import numpy as np

logger = logging.getLogger(__name__)

# Service URLs
AI_DETECTION_SERVICE_URL = os.getenv('AI_DETECTION_SERVICE_URL', 'http://ai-detection:3003')
SESSION_SERVICE_URL = os.getenv('SESSION_SERVICE_URL', 'http://session-service:3002')

# Redis configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))

# Cache TTLs
EMBEDDING_CACHE_TTL = int(os.getenv('EMBEDDING_CACHE_TTL', '86400'))  # 24 hours
AI_ANSWER_CACHE_TTL = int(os.getenv('AI_ANSWER_CACHE_TTL', '3600'))  # 1 hour


def get_redis_client():
    """Get configured Redis client"""
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=0,
        decode_responses=True,
    )


@shared_task(
    name='tasks.ai.analyze',
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=60,
    time_limit=90,
)
def analyze(
    self,
    session_id: str,
    question_id: str,
    answer_text: str,
    question_text: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Analyze an answer for AI detection.

    Args:
        session_id: Interview session ID
        question_id: Question ID
        answer_text: The answer text to analyze
        question_text: Original question text (optional)

    Returns:
        Analysis results with risk score and flags
    """
    logger.info(f"Starting AI analysis: session={session_id}, question={question_id}")

    try:
        # Call AI detection service for analysis
        response = requests.post(
            f"{AI_DETECTION_SERVICE_URL}/analyze/answer",
            json={
                'session_id': session_id,
                'question_id': question_id,
                'answer_text': answer_text,
                'question_text': question_text,
            },
            timeout=30,
        )
        response.raise_for_status()
        analysis_result = response.json()

        # Generate embedding for the answer
        from celery_app import app
        app.send_task(
            'tasks.ai.embedding',
            args=[question_id, answer_text],
            routing_key=f'ai.embedding.{question_id}',
            exchange='ai_detection',
        )

        # Cache the results
        if analysis_result.get('risk_score', 0) > 0.7:
            # High-risk answers need immediate notification
            _notify_high_risk(session_id, question_id, analysis_result)

        logger.info(f"AI analysis complete: question={question_id}, risk_score={analysis_result.get('risk_score')}")

        return {
            'session_id': session_id,
            'question_id': question_id,
            'analysis': analysis_result,
            'status': 'success',
        }

    except requests.RequestException as e:
        logger.error(f"AI analysis failed: {e}")
        raise


@shared_task(
    name='tasks.ai.embedding',
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=30,
    time_limit=45,
)
def embedding(
    self,
    question_id: str,
    text: str,
    model: str = 'all-MiniLM-L6-v2',
    **kwargs
) -> Dict[str, Any]:
    """
    Generate embedding vector for text.

    Args:
        question_id: Question ID for reference
        text: Text to generate embedding for
        model: Embedding model name

    Returns:
        Dict with embedding vector
    """
    logger.info(f"Generating embedding: question={question_id}, model={model}")

    try:
        # Call AI detection service for embedding generation
        response = requests.post(
            f"{AI_DETECTION_SERVICE_URL}/embeddings/generate",
            json={
                'text': text,
                'model': model,
            },
            timeout=15,
        )
        response.raise_for_status()
        result = response.json()

        embedding_vector = result.get('embedding', [])

        # Cache embedding in Redis
        cache_key = _get_embedding_cache_key(text, model)
        redis_client = get_redis_client()
        redis_client.setex(
            cache_key,
            EMBEDDING_CACHE_TTL,
            str(embedding_vector),
        )

        logger.info(f"Embedding generated: question={question_id}, dim={len(embedding_vector)}")

        return {
            'question_id': question_id,
            'embedding_dimension': len(embedding_vector),
            'model': model,
            'cached': True,
            'status': 'success',
        }

    except requests.RequestException as e:
        logger.error(f"Embedding generation failed: {e}")
        raise


@shared_task(
    name='tasks.ai.cache',
    bind=True,
    autoretry_for=(requests.RequestException, redis.RedisError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=60,
    time_limit=90,
)
def cache(
    self,
    question_text: str,
    models: Optional[List[str]] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Warm up cache with AI-generated answers for a question.

    Args:
        question_text: The question to generate answers for
        models: List of AI models to use (default: gpt-4, claude-3-opus, gemini-1.5-pro)

    Returns:
        Dict with cached answer keys
    """
    models = models or ['gpt-4', 'claude-3-opus', 'gemini-1.5-pro']

    logger.info(f"Warming cache for question: {question_text[:50]}...")

    redis_client = get_redis_client()
    cached_keys = []

    for model in models:
        cache_key = _get_ai_answer_cache_key(question_text, model)

        # Check if already cached
        if redis_client.exists(cache_key):
            logger.info(f"Cache hit for model={model}")
            cached_keys.append(cache_key)
            continue

        try:
            # Generate AI answer
            response = requests.post(
                f"{AI_DETECTION_SERVICE_URL}/generate/answer",
                json={
                    'question_text': question_text,
                    'model': model,
                },
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()

            ai_answer = result.get('answer', '')

            # Cache the answer
            redis_client.setex(
                cache_key,
                AI_ANSWER_CACHE_TTL,
                ai_answer,
            )
            cached_keys.append(cache_key)

            logger.info(f"Cached AI answer for model={model}")

        except requests.RequestException as e:
            logger.warning(f"Failed to generate answer for model={model}: {e}")

    logger.info(f"Cache warmup complete: {len(cached_keys)}/{len(models)} models cached")

    return {
        'question_hash': hashlib.sha256(question_text.encode()).hexdigest()[:16],
        'models_cached': len(cached_keys),
        'total_models': len(models),
        'status': 'success',
    }


def _get_embedding_cache_key(text: str, model: str) -> str:
    """Generate cache key for embedding"""
    text_hash = hashlib.sha256(text.encode()).hexdigest()[:32]
    return f"embedding:{model}:{text_hash}"


def _get_ai_answer_cache_key(question_text: str, model: str) -> str:
    """Generate cache key for AI answer"""
    question_hash = hashlib.sha256(question_text.encode()).hexdigest()[:32]
    return f"ai_answer:{model}:{question_hash}"


def _notify_high_risk(session_id: str, question_id: str, analysis: Dict[str, Any]):
    """Send notification for high-risk answers"""
    try:
        # Publish to security events exchange
        from celery_app import app

        app.send_task(
            'tasks.security.alert',
            args=[{
                'session_id': session_id,
                'event_type': 'high_risk_answer',
                'severity': 'high',
                'data': {
                    'question_id': question_id,
                    'risk_score': analysis.get('risk_score'),
                    'flags': analysis.get('flags', []),
                },
            }],
            exchange='security_events',
        )

        logger.info(f"High-risk notification sent: session={session_id}, question={question_id}")

    except Exception as e:
        logger.error(f"Failed to send high-risk notification: {e}")
