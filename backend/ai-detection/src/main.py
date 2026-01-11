"""
FastAPI application for AI Detection Service
Main entry point for the service
"""
import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from src.config import get_settings
from src.middleware import SessionRateLimitMiddleware
from models.model_manager import initialize_models, get_model_manager
from api import health, question, answer, cache
from lib.errors import AIDetectionError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for the application
    Handles startup and shutdown events
    """
    # Startup
    logger.info("Starting AI Detection Service...")
    logger.info(f"Environment: {settings.ENV}")
    logger.info(f"Debug mode: {settings.DEBUG}")

    try:
        # Initialize ML models
        logger.info("Loading ML models...")
        initialize_models()
        logger.info("ML models loaded successfully")

        # Verify model status
        model_manager = get_model_manager()
        model_status = model_manager.get_model_status()
        logger.info(f"Model status: {model_status}")

    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")
        # Continue anyway - models will be loaded on-demand

    logger.info("AI Detection Service started successfully")

    yield

    # Shutdown
    logger.info("Shutting down AI Detection Service...")

    # Close Redis connections
    try:
        from services.cache_service import get_async_redis_client
        redis_client = get_async_redis_client()
        if redis_client.client:
            await redis_client.close()
            logger.info("Redis connection closed")
    except Exception as e:
        logger.error(f"Error closing Redis connection: {e}")

    # Reset circuit breakers
    try:
        from lib.circuit_breaker import get_circuit_registry
        registry = get_circuit_registry()
        await registry.reset_all()
        logger.info("Circuit breakers reset")
    except Exception as e:
        logger.error(f"Error resetting circuit breakers: {e}")

    # Close database connections
    try:
        from src.database import close_db
        close_db()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database: {e}")

    logger.info("AI Detection Service shut down")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI answer detection service for Blockd interview platform",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-session rate limiting middleware (100 requests/minute per session)
# Uses Redis token bucket algorithm to prevent abuse
app.add_middleware(
    SessionRateLimitMiddleware,
    redis_url=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.REDIS_DB}",
    max_requests_per_minute=100,
    key_prefix=f"{settings.CACHE_PREFIX}:rate_limit"
)


# Exception handlers
@app.exception_handler(AIDetectionError)
async def ai_detection_error_handler(request: Request, exc: AIDetectionError):
    """Handle AIDetectionError exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "message": "An internal error occurred",
            "details": {}
        }
    )


# Include routers
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(question.router, prefix="/api/v1/analysis", tags=["Question Analysis"])
app.include_router(answer.router, prefix="/api/v1/analysis", tags=["Answer Analysis"])
app.include_router(cache.router, prefix="/api/v1", tags=["Cache Management"])


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs"
    }


# Health endpoint for Docker healthcheck (simple version without dependencies)
@app.get("/health")
async def health():
    """Simple health check for Docker/K8s"""
    return {"status": "healthy"}


# Run with uvicorn
def run():
    """Run the application"""
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )


if __name__ == "__main__":
    run()
