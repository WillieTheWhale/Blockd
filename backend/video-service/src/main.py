"""
Video Processing Service - Main Application
FastAPI application with WebRTC signaling, recording, and stream management
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from src.config import settings
from api.webrtc import router as webrtc_router
from api.recording import router as recording_router
from api.stream import router as stream_router
from api.meeting_stream import router as meeting_stream_router
from services.recording import RecordingManager
from services.storage import S3StorageService
from lib.message_queue import MessageQueueClient

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Global service instances
recording_manager: RecordingManager = None
storage_service: S3StorageService = None
mq_client: MessageQueueClient = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global recording_manager, storage_service, mq_client

    # Startup
    logger.info(f"Starting {settings.SERVICE_NAME} v{settings.SERVICE_VERSION}")

    # Initialize services
    recording_manager = RecordingManager()
    storage_service = S3StorageService()
    mq_client = MessageQueueClient()

    try:
        # Connect to message queue
        await mq_client.connect()
        logger.info("Connected to RabbitMQ")

        # Initialize S3 bucket (optional - may not be configured in dev)
        try:
            if settings.S3_ACCESS_KEY and settings.S3_SECRET_KEY:
                await storage_service.ensure_bucket_exists()
                logger.info(f"S3 bucket '{settings.S3_BUCKET}' ready")
            else:
                logger.warning("S3 not configured - video storage will be disabled")
        except Exception as s3_error:
            logger.warning(f"S3 initialization failed (non-fatal): {s3_error}")

        # Start background cleanup task
        if settings.AUTO_CLEANUP_ENABLED:
            cleanup_task = asyncio.create_task(recording_manager.cleanup_loop())
            logger.info("Started automatic cleanup task")

        logger.info(f"Service started on {settings.API_HOST}:{settings.API_PORT}")

        yield

    finally:
        # Shutdown
        logger.info("Shutting down video processing service")

        # Stop all active recordings
        await recording_manager.stop_all_recordings()

        # Close connections
        await mq_client.close()
        logger.info("Closed RabbitMQ connection")

        # Cleanup task will be cancelled automatically
        logger.info("Service shutdown complete")


# Create FastAPI application
app = FastAPI(
    title=settings.SERVICE_NAME,
    version=settings.SERVICE_VERSION,
    description="Video Processing Service with WebRTC streaming and FFmpeg recording",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(webrtc_router, prefix=settings.API_PREFIX, tags=["WebRTC"])
app.include_router(recording_router, prefix=settings.API_PREFIX, tags=["Recording"])
app.include_router(stream_router, prefix=settings.API_PREFIX, tags=["Stream"])
app.include_router(meeting_stream_router, prefix=settings.API_PREFIX, tags=["Meeting Stream"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    health_status = {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "active_recordings": len(recording_manager.active_recordings) if recording_manager else 0,
    }

    # Check mediasoup connection
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{settings.MEDIASOUP_URL}/health", timeout=2.0)
            health_status["mediasoup"] = "healthy" if response.status_code == 200 else "unhealthy"
    except Exception as e:
        health_status["mediasoup"] = f"unhealthy: {str(e)}"

    # Check S3 connection
    try:
        if storage_service:
            await storage_service.check_connection()
            health_status["s3"] = "healthy"
        else:
            health_status["s3"] = "not configured"
    except Exception as e:
        health_status["s3"] = f"unhealthy: {str(e)}"

    # Check RabbitMQ connection
    health_status["rabbitmq"] = "healthy" if mq_client and mq_client.is_connected else "unhealthy"

    return health_status


@app.get("/metrics")
async def metrics():
    """Prometheus-compatible metrics endpoint"""
    if not settings.ENABLE_METRICS:
        return JSONResponse({"error": "Metrics disabled"}, status_code=404)

    metrics_data = {
        "active_recordings": len(recording_manager.active_recordings) if recording_manager else 0,
        "total_recordings_started": recording_manager.total_recordings_started if recording_manager else 0,
        "total_recordings_completed": recording_manager.total_recordings_completed if recording_manager else 0,
        "total_recordings_failed": recording_manager.total_recordings_failed if recording_manager else 0,
    }

    return metrics_data


@app.websocket("/ws/signaling/{session_id}")
async def websocket_signaling(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for WebRTC signaling
    Handles offer/answer/ICE candidate exchange
    """
    await websocket.accept()
    logger.info(f"WebSocket connection established for session {session_id}")

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")

            logger.debug(f"Received signaling message: {message_type} for session {session_id}")

            # Forward to mediasoup server
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.MEDIASOUP_URL}/signaling/{session_id}",
                    json=data,
                    timeout=10.0
                )
                response_data = response.json()

            # Send response back to client
            await websocket.send_json(response_data)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        await websocket.close(code=1011, reason=str(e))


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )


def main():
    """Run the application"""
    uvicorn.run(
        "src.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info"
    )


if __name__ == "__main__":
    main()
