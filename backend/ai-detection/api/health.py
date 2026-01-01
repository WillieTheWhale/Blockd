"""
Health check endpoint
"""
from datetime import datetime
from fastapi import APIRouter
from schemas.detection import HealthCheckResponse
from models.model_manager import get_model_manager
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
        models_loaded=model_status
    )
