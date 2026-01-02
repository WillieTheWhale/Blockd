"""
Eye Tracking Service - FastAPI Application
Production-grade eye tracking analysis service
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import structlog
import sys

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ]
)

from .config import settings
from .database import init_db

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    logger.info("eye_tracking_service_starting", version=settings.VERSION)

    # Initialize database
    try:
        init_db()
        logger.info("database_initialized")
    except Exception as e:
        logger.error("database_initialization_failed", error=str(e))
        sys.exit(1)

    # Initialize models (optional - can be lazy loaded)
    logger.info("models_ready")

    logger.info("eye_tracking_service_started")

    yield

    # Shutdown
    logger.info("eye_tracking_service_shutting_down")


# Create FastAPI application
app = FastAPI(
    title="Blockd Eye Tracking Service",
    description="Production-grade eye tracking analysis with MediaPipe, LSTM anomaly detection, and pattern recognition",
    version=settings.VERSION,
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION,
        "description": "Eye Tracking Analysis Service",
        "endpoints": {
            "health": "/health",
            "stream": "/api/v1/gaze/stream",
            "analyze": "/api/v1/gaze/analyze",
            "summary": "/api/v1/gaze/summary/{session_id}",
            "calibrate": "/api/v1/gaze/calibrate"
        }
    }


# Import and include routers
try:
    from api import stream, analyze, summary, calibration

    app.include_router(stream.router, prefix="/api/v1/gaze", tags=["gaze-stream"])
    app.include_router(analyze.router, prefix="/api/v1/gaze", tags=["gaze-analysis"])
    app.include_router(summary.router, prefix="/api/v1/gaze", tags=["gaze-summary"])
    app.include_router(calibration.router, prefix="/api/v1/gaze", tags=["gaze-calibration"])

    logger.info("api_routers_registered")
except ImportError as e:
    logger.warning("api_routers_import_failed", error=str(e))


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled exceptions"""
    logger.error(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc)
    )

    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if settings.DEBUG else "An error occurred"
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=1 if settings.DEBUG else settings.WORKERS,
        log_level=settings.LOG_LEVEL.lower()
    )
