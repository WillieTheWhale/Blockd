"""
Eye Tracking Service - FastAPI Application
Production-grade eye tracking analysis service

This service provides real-time eye tracking and gaze analysis capabilities:
- MediaPipe FaceMesh integration for facial landmark detection
- Gaze vector estimation and off-screen detection
- Pattern recognition (reading, drift, shifty eyes)
- LSTM autoencoder for anomaly detection
- Kalman filtering for noise reduction
- Heatmap generation for visualization

API Endpoints:
    POST /api/v1/gaze/stream - WebSocket for real-time gaze streaming
    POST /api/v1/gaze/analyze - Batch gaze analysis
    GET /api/v1/gaze/summary/{session_id} - Session summary with risk score
    POST /api/v1/gaze/calibrate - Calibration for user-specific adjustment
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import structlog
import sys
import traceback

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ]
)

from .config import settings
from .database import init_db
from lib.errors import EyeTrackingError, ValidationError as EyeValidationError

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

    # Cleanup WebSocket connections and resources
    try:
        from api.stream import shutdown_connection_manager
        await shutdown_connection_manager()
        logger.info("connection_manager_shutdown_complete")
    except Exception as e:
        logger.error("connection_manager_shutdown_error", error=str(e))

    logger.info("eye_tracking_service_shutdown_complete")


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


# =============================================================================
# Exception Handlers
# =============================================================================

@app.exception_handler(EyeTrackingError)
async def eye_tracking_error_handler(request: Request, exc: EyeTrackingError):
    """
    Handle all EyeTrackingError exceptions.

    Converts our custom exceptions to proper JSON responses with
    appropriate HTTP status codes and error details.
    """
    logger.warning(
        "eye_tracking_error",
        path=request.url.path,
        method=request.method,
        error_code=exc.error_code,
        message=exc.message,
        details=exc.details,
        status_code=exc.status_code
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details if settings.DEBUG else {}
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle Pydantic validation errors from request parsing.

    Provides detailed information about which fields failed validation.
    """
    errors = exc.errors()

    # Extract field names and error messages
    error_details = []
    for error in errors:
        loc = ".".join(str(l) for l in error.get("loc", []))
        msg = error.get("msg", "Validation error")
        error_details.append({"field": loc, "message": msg})

    logger.warning(
        "request_validation_error",
        path=request.url.path,
        method=request.method,
        errors=error_details
    )

    return JSONResponse(
        status_code=422,
        content={
            "error": "VALIDATION_ERROR",
            "message": "Request validation failed",
            "details": {"validation_errors": error_details}
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled exceptions.

    Catches any exceptions not handled by specific handlers and
    returns a generic 500 error. In debug mode, includes stack trace.
    """
    # Log full exception with traceback
    logger.error(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        error_type=type(exc).__name__,
        traceback=traceback.format_exc() if settings.DEBUG else None
    )

    # Build response content
    content = {
        "error": "INTERNAL_ERROR",
        "message": "An internal error occurred"
    }

    # In debug mode, include exception details
    if settings.DEBUG:
        content["details"] = {
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "traceback": traceback.format_exc().split("\n")
        }
    else:
        content["details"] = {}

    return JSONResponse(
        status_code=500,
        content=content
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
