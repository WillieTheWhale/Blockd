"""Blockd Authentication Service - Main Application.

Production-grade FastAPI application for JWT authentication, session management,
and role-based access control for the Blockd interview security platform.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import sys
from datetime import datetime

from .routes import router
from .config import config
from .models import HealthCheckResponse

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.log_level),
    format=config.log_format,
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="Blockd Authentication Service",
    description=(
        "JWT-based authentication and authorization service for Blockd "
        "interview security platform. Provides user registration, login, "
        "token management, and session authentication."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)


# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=config.cors_allow_credentials,
    allow_methods=config.cors_allow_methods,
    allow_headers=config.cors_allow_headers,
)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error_code": "INTERNAL_ERROR"
        }
    )


# Include authentication routes
app.include_router(router)


@app.get(
    "/health",
    response_model=HealthCheckResponse,
    tags=["health"],
    summary="Health check",
    description="Check if the authentication service is running and healthy"
)
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.

    Returns service status and basic information.
    """
    return HealthCheckResponse(
        status="healthy",
        service="auth"
    )


@app.get(
    "/",
    tags=["info"],
    summary="Service information",
    description="Get basic information about the authentication service"
)
async def root():
    """Root endpoint with service information."""
    return {
        "service": "Blockd Authentication Service",
        "version": "1.0.0",
        "status": "running",
        "documentation": "/docs",
        "health": "/health"
    }


@app.on_event("startup")
async def startup_event():
    """
    Startup event handler.

    Executes when the application starts. Useful for initializing
    connections, caches, and other resources.
    """
    logger.info("=" * 60)
    logger.info("Blockd Authentication Service Starting")
    logger.info("=" * 60)
    logger.info(f"Environment: {config.environment}")
    logger.info(f"Host: {config.service_host}:{config.service_port}")
    logger.info(f"Debug mode: {config.debug}")
    logger.info(f"CORS origins: {config.cors_origins}")
    logger.info(f"JWT access token expiry: {config.jwt_access_token_expire_minutes} minutes")
    logger.info(f"JWT refresh token expiry: {config.jwt_refresh_token_expire_days} days")
    logger.info("=" * 60)

    # Verify database connection
    try:
        from database.connection import DatabasePool
        conn = DatabasePool().get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        DatabasePool().return_connection(conn)
        logger.info("✓ Database connection verified")
    except Exception as e:
        logger.error(f"✗ Database connection failed: {e}")
        logger.warning("Service will continue but may fail on database operations")

    logger.info("=" * 60)
    logger.info("Authentication Service Ready")
    logger.info("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """
    Shutdown event handler.

    Executes when the application shuts down. Cleanup resources here.
    """
    logger.info("=" * 60)
    logger.info("Blockd Authentication Service Shutting Down")
    logger.info("=" * 60)

    # Close database connections
    try:
        from database.connection import DatabasePool
        DatabasePool().close_all_connections()
        logger.info("✓ Database connections closed")
    except Exception as e:
        logger.error(f"✗ Error closing database connections: {e}")

    logger.info("=" * 60)
    logger.info("Authentication Service Stopped")
    logger.info("=" * 60)


# Development server runner
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=config.service_host,
        port=config.service_port,
        reload=config.is_development(),
        log_level=config.log_level.lower(),
        access_log=True
    )
