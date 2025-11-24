"""Health check endpoints"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime

from src.database import get_db, health_check
from src.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health():
    """
    Basic health check

    Returns service status
    """
    settings = get_settings()

    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/health/ready")
async def readiness():
    """
    Readiness check

    Verifies all dependencies are available
    """
    settings = get_settings()

    # Check database
    db_healthy = await health_check()

    # Overall status
    ready = db_healthy

    return {
        "ready": ready,
        "service": settings.APP_NAME,
        "checks": {
            "database": db_healthy
        },
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/health/live")
async def liveness():
    """
    Liveness check

    Verifies service is running
    """
    settings = get_settings()

    return {
        "alive": True,
        "service": settings.APP_NAME,
        "timestamp": datetime.utcnow().isoformat()
    }
