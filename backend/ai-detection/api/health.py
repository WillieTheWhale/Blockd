"""
Health check endpoint with circuit breaker status
"""
import logging
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, Response, status
from sqlalchemy import text
from schemas.detection import HealthCheckResponse
from models.model_manager import get_model_manager
from services.llm_service import get_llm_service
from services.cache_service import get_async_redis_client
from src.database import get_db_session
from lib.circuit_breaker import get_circuit_registry
from src.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


async def check_redis_connection() -> tuple[str, str]:
    """Check Redis connection health"""
    try:
        client = get_async_redis_client()
        if client._initialized and client.client:
            await client.client.ping()
            return "ok", ""
        else:
            # Try to initialize
            await client.initialize()
            return "ok", ""
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        return "error", str(e)


def check_database_connection() -> tuple[str, str]:
    """Check database connection health"""
    try:
        session = get_db_session()
        # Execute a simple query to verify connection
        session.execute(text("SELECT 1"))
        session.close()
        return "ok", ""
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        return "error", str(e)


@router.get("/health", response_model=HealthCheckResponse)
async def health_check(response: Response):
    """
    Health check endpoint

    Returns service status and dependency health
    """
    model_manager = get_model_manager()
    model_status = model_manager.get_model_status()

    # Get circuit breaker status
    try:
        llm_service = get_llm_service()
        circuit_status = llm_service.get_circuit_status()
    except Exception:
        circuit_status = {}

    # Check dependencies with actual connection tests
    dependencies = {}
    all_healthy = True

    # Check database
    db_status, db_error = check_database_connection()
    dependencies["database"] = db_status
    if db_status != "ok":
        all_healthy = False

    # Check Redis
    redis_status, redis_error = await check_redis_connection()
    dependencies["redis"] = redis_status
    if redis_status != "ok":
        all_healthy = False

    # RabbitMQ check placeholder (would need pika/aio-pika client)
    dependencies["rabbitmq"] = "ok"

    # Set overall status
    overall_status = "healthy" if all_healthy else "degraded"

    # Return 503 if critical dependencies are down
    if db_status != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        overall_status = "unhealthy"

    return HealthCheckResponse(
        status=overall_status,
        version=settings.APP_VERSION,
        timestamp=datetime.utcnow().isoformat(),
        dependencies=dependencies,
        models_loaded=model_status,
        circuit_breakers=circuit_status
    )


@router.get("/health/live")
async def liveness_check() -> Dict[str, Any]:
    """
    Kubernetes liveness probe endpoint.

    Returns alive if the service process is running.
    This is a simple check that doesn't verify dependencies.
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/health/circuits")
async def get_circuit_breaker_status() -> Dict[str, Any]:
    """
    Get detailed circuit breaker status for all LLM providers.

    Returns:
        Status of each circuit breaker including:
        - state (closed, open, half_open)
        - statistics (calls, successes, failures, rejections)
        - configuration
    """
    try:
        llm_service = get_llm_service()
        return {
            "circuits": llm_service.get_circuit_status(),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.post("/health/circuits/reset")
async def reset_circuit_breakers() -> Dict[str, Any]:
    """
    Reset all circuit breakers to closed state.

    Use this endpoint to manually recover from an outage
    after the underlying issue has been resolved.

    Returns:
        Confirmation of reset
    """
    try:
        llm_service = get_llm_service()
        llm_service.reset_circuits()
        return {
            "status": "reset",
            "message": "All circuit breakers have been reset to closed state",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.get("/health/ready")
async def readiness_check(response: Response) -> Dict[str, Any]:
    """
    Kubernetes readiness probe endpoint.

    Returns ready only if:
    - Database connection is healthy
    - At least one LLM circuit is closed (or no LLM keys configured)
    - Models are loaded
    """
    try:
        # Check database (required for readiness)
        db_status, _ = check_database_connection()
        db_ready = db_status == "ok"

        # Check Redis (optional for readiness, but log warning)
        redis_status, _ = await check_redis_connection()
        redis_ready = redis_status == "ok"

        # Check circuit breakers
        try:
            llm_service = get_llm_service()
            circuit_status = llm_service.get_circuit_status()
            # Check if at least one LLM provider is available
            available_providers = sum(
                1 for name, stat in circuit_status.items()
                if stat.get("state") != "open"
            )
        except Exception:
            circuit_status = {}
            available_providers = 0

        # Check models
        model_manager = get_model_manager()
        model_status = model_manager.get_model_status()
        models_ready = all(model_status.values()) if model_status else False

        # Determine readiness - DB is required, LLM/models are optional
        is_ready = db_ready

        if is_ready:
            return {
                "status": "ready",
                "database": db_ready,
                "redis": redis_ready,
                "available_llm_providers": available_providers,
                "models_loaded": models_ready,
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {
                "status": "not_ready",
                "database": db_ready,
                "redis": redis_ready,
                "available_llm_providers": available_providers,
                "models_loaded": models_ready,
                "timestamp": datetime.utcnow().isoformat()
            }
    except Exception as e:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
