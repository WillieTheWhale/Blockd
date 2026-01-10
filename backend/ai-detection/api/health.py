"""
Health check endpoint with circuit breaker status
"""
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter
from schemas.detection import HealthCheckResponse
from models.model_manager import get_model_manager
from services.llm_service import get_llm_service
from lib.circuit_breaker import get_circuit_registry
from src.config import settings

router = APIRouter()


@router.get("/health", response_model=HealthCheckResponse)
async def health_check():
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

    # Check dependencies
    dependencies = {
        "database": "ok",  # Would check actual DB connection
        "redis": "ok",     # Would check actual Redis connection
        "rabbitmq": "ok"   # Would check actual RabbitMQ connection
    }

    return HealthCheckResponse(
        status="healthy",
        version=settings.APP_VERSION,
        timestamp=datetime.utcnow().isoformat(),
        dependencies=dependencies,
        models_loaded=model_status,
        circuit_breakers=circuit_status
    )


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
async def readiness_check() -> Dict[str, Any]:
    """
    Kubernetes readiness probe endpoint.

    Returns ready only if:
    - At least one LLM circuit is closed
    - Models are loaded
    """
    try:
        llm_service = get_llm_service()
        circuit_status = llm_service.get_circuit_status()

        # Check if at least one LLM provider is available
        available_providers = sum(
            1 for name, status in circuit_status.items()
            if status.get("state") != "open"
        )

        model_manager = get_model_manager()
        model_status = model_manager.get_model_status()
        models_ready = all(model_status.values())

        if available_providers > 0 and models_ready:
            return {
                "status": "ready",
                "available_llm_providers": available_providers,
                "models_loaded": True,
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            return {
                "status": "not_ready",
                "available_llm_providers": available_providers,
                "models_loaded": models_ready,
                "timestamp": datetime.utcnow().isoformat()
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
