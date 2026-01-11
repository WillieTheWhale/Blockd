"""
Real-time Gaze Streaming API
WebSocket endpoint for real-time gaze tracking with authentication
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
import json
import structlog
from typing import Dict, Optional
from uuid import UUID

from src.database import get_db_session, GazeEvent, SessionLocal
from services.gaze_processing import GazeProcessingService
from schemas.gaze import StreamFrameMessage, StreamGazeMessage, StreamErrorMessage
from lib.errors import FrameProcessingError, NoFaceDetectedError
from lib.auth import get_authenticator, WebSocketAuthenticator

logger = structlog.get_logger(__name__)

# Thread pool for async database operations
_db_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="gaze_db_")


def _store_gaze_event_sync(session_id: str, result: dict, timestamp: datetime) -> None:
    """
    Synchronously store gaze event to database.
    Called from thread pool to avoid blocking the event loop.
    """
    db = SessionLocal()
    try:
        gaze_event = GazeEvent(
            session_id=UUID(session_id) if isinstance(session_id, str) else session_id,
            timestamp=timestamp,
            gaze_x=result["gaze_x"],
            gaze_y=result["gaze_y"],
            is_off_screen=result["is_off_screen"],
            off_screen_direction=result.get("off_screen_direction"),
            confidence=result["confidence"],
            gaze_vector_x=result.get("gaze_vector_x"),
            gaze_vector_y=result.get("gaze_vector_y"),
            gaze_vector_z=result.get("gaze_vector_z"),
            head_pitch=result.get("head_pitch"),
            head_yaw=result.get("head_yaw"),
            head_roll=result.get("head_roll"),
            is_filtered=result.get("is_filtered", True),
            raw_gaze_x=result.get("raw_gaze_x"),
            raw_gaze_y=result.get("raw_gaze_y")
        )
        db.add(gaze_event)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("gaze_event_storage_failed", session_id=session_id, error=str(e))
        raise
    finally:
        db.close()


async def store_gaze_event_async(session_id: str, result: dict, timestamp: datetime) -> None:
    """
    Asynchronously store gaze event to database using thread pool.
    Fire-and-forget to avoid blocking WebSocket message processing.
    """
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            _db_executor,
            _store_gaze_event_sync,
            session_id,
            result,
            timestamp
        )
    except Exception as e:
        # Log but don't raise - we don't want DB errors to break the WebSocket
        logger.error("async_gaze_storage_error", session_id=session_id, error=str(e))

router = APIRouter()


class ConnectionManager:
    """Manage WebSocket connections"""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.processing_services: Dict[str, GazeProcessingService] = {}
        self._pending_db_tasks: Dict[str, set] = {}  # Track pending tasks per session

    async def connect(self, session_id: str, websocket: WebSocket):
        """Accept and store WebSocket connection"""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.processing_services[session_id] = GazeProcessingService()
        self._pending_db_tasks[session_id] = set()
        logger.info("websocket_connected", session_id=session_id)

    def disconnect(self, session_id: str):
        """Remove WebSocket connection and cleanup resources"""
        if session_id in self.active_connections:
            del self.active_connections[session_id]

        # Explicitly close the processing service to release MediaPipe resources (~200MB)
        if session_id in self.processing_services:
            try:
                self.processing_services[session_id].close()
            except Exception as e:
                logger.error("processing_service_close_error", session_id=session_id, error=str(e))
            del self.processing_services[session_id]

        # Clean up task tracking
        if session_id in self._pending_db_tasks:
            del self._pending_db_tasks[session_id]

        logger.info("websocket_disconnected", session_id=session_id)

    async def send_gaze_data(self, session_id: str, data: dict):
        """Send gaze data to client"""
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(data)

    async def send_error(self, session_id: str, error: str):
        """Send error message to client"""
        if session_id in self.active_connections:
            error_msg = {
                "message_type": "error",
                "error": error,
                "timestamp": datetime.now().isoformat()
            }
            await self.active_connections[session_id].send_json(error_msg)

    async def close_all(self):
        """
        Close all connections and cleanup all resources.
        Called during service shutdown.
        """
        logger.info("closing_all_connections", count=len(self.active_connections))

        # Get list of session IDs (copy to avoid modification during iteration)
        session_ids = list(self.active_connections.keys())

        for session_id in session_ids:
            try:
                # Try to close WebSocket gracefully
                if session_id in self.active_connections:
                    websocket = self.active_connections[session_id]
                    try:
                        await websocket.close(code=1001, reason="Server shutdown")
                    except Exception:
                        pass  # Connection may already be closed

                # Cleanup resources
                self.disconnect(session_id)
            except Exception as e:
                logger.error("connection_close_error", session_id=session_id, error=str(e))

        logger.info("all_connections_closed")

    def get_active_count(self) -> int:
        """Get count of active connections"""
        return len(self.active_connections)


manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager instance"""
    return manager


async def shutdown_connection_manager():
    """Shutdown handler for the connection manager"""
    await manager.close_all()

    # Also shutdown the DB executor
    global _db_executor
    _db_executor.shutdown(wait=True, cancel_futures=False)
    logger.info("db_executor_shutdown")


@router.websocket("/stream")
async def gaze_stream(
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT token for authentication"),
    session_token: Optional[str] = Query(None, description="Session-specific token")
):
    """
    WebSocket endpoint for real-time gaze tracking with authentication.

    Authentication:
    - Pass token via query param: /stream?token=<jwt>&session_token=<session_token>
    - Or pass Authorization header (extracted from first message)

    Protocol:
    1. Client connects with auth params
    2. Client sends frame messages: {"session_id": "...", "frame": "base64...", "timestamp": "..."}
    3. Server responds with gaze data: {"gaze_x": ..., "gaze_y": ..., "confidence": ..., ...}
    4. On error, server sends: {"message_type": "error", "error": "..."}
    """
    session_id = None
    authenticator = get_authenticator()

    try:
        # Accept connection (we'll validate auth on first message)
        await websocket.accept()
        logger.info("websocket_connection_accepted")

        # Main message loop
        while True:
            try:
                # Receive message
                message = await websocket.receive_json()

                # Parse session ID from first message and authenticate
                if session_id is None:
                    session_id = message.get("session_id")
                    if not session_id:
                        await websocket.send_json({
                            "message_type": "error",
                            "error": "session_id required",
                            "timestamp": datetime.now().isoformat()
                        })
                        continue

                    # Get auth tokens from message if not in query params
                    jwt_token = token or message.get("token")
                    sess_token = session_token or message.get("session_token")

                    # Authenticate the connection
                    auth_result = await authenticator.authenticate(
                        session_id=session_id,
                        jwt_token=jwt_token,
                        session_token=sess_token
                    )

                    if not auth_result.is_valid:
                        logger.warning(
                            "websocket_auth_failed",
                            session_id=session_id,
                            error=auth_result.error
                        )
                        await websocket.send_json({
                            "message_type": "auth_error",
                            "error": auth_result.error or "Authentication failed",
                            "timestamp": datetime.now().isoformat()
                        })
                        await websocket.close(code=4001, reason="Authentication failed")
                        return

                    logger.info(
                        "websocket_authenticated",
                        session_id=session_id,
                        user_id=auth_result.user_id
                    )

                    # Initialize connection
                    await manager.connect(session_id, websocket)

                # Get processing service
                processing_service = manager.processing_services.get(session_id)
                if not processing_service:
                    await manager.send_error(session_id, "Processing service not initialized")
                    continue

                # Parse frame data
                frame_base64 = message.get("frame")
                timestamp_str = message.get("timestamp")

                if not frame_base64:
                    await manager.send_error(session_id, "frame data required")
                    continue

                # Parse timestamp
                if timestamp_str:
                    timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                else:
                    timestamp = datetime.now()

                # Process frame
                try:
                    result = processing_service.process_base64_frame(
                        base64_frame=frame_base64,
                        timestamp=timestamp,
                        detect_anomalies=True
                    )

                    # Prepare response
                    gaze_response = {
                        "message_type": "gaze",
                        "session_id": session_id,
                        "gaze_x": result["gaze_x"],
                        "gaze_y": result["gaze_y"],
                        "is_off_screen": result["is_off_screen"],
                        "off_screen_direction": result.get("off_screen_direction"),
                        "confidence": result["confidence"],
                        "timestamp": result["timestamp"],
                        "processing_time_ms": result.get("processing_time_ms"),
                        "has_anomaly": result.get("has_anomaly", False)
                    }

                    # Send response
                    await manager.send_gaze_data(session_id, gaze_response)

                    # Store gaze event to database asynchronously
                    # Fire-and-forget: don't await to avoid blocking WebSocket
                    asyncio.create_task(
                        store_gaze_event_async(session_id, result, timestamp)
                    )

                except NoFaceDetectedError:
                    await manager.send_error(session_id, "No face detected in frame")
                except FrameProcessingError as e:
                    await manager.send_error(session_id, str(e))
                except Exception as e:
                    logger.error("frame_processing_error", session_id=session_id, error=str(e))
                    await manager.send_error(session_id, f"Processing error: {str(e)}")

            except json.JSONDecodeError:
                await manager.send_error(session_id, "Invalid JSON message")
            except Exception as e:
                logger.error("message_handling_error", session_id=session_id, error=str(e))
                await manager.send_error(session_id, "Message handling error")

    except WebSocketDisconnect:
        if session_id:
            manager.disconnect(session_id)
        logger.info("websocket_disconnected", session_id=session_id)

    except Exception as e:
        logger.error("websocket_error", session_id=session_id, error=str(e))
        if session_id:
            manager.disconnect(session_id)
        raise


@router.post("/process-frame")
async def process_single_frame(
    request: dict,
    db: Session = Depends(get_db_session)
):
    """
    Process a single frame (REST endpoint alternative to WebSocket)

    Args:
        request: {session_id, frame (base64), timestamp}

    Returns:
        Gaze data
    """
    try:
        session_id = request.get("session_id")
        frame_base64 = request.get("frame")
        timestamp_str = request.get("timestamp")

        if not session_id or not frame_base64:
            return {"error": "session_id and frame required"}, 400

        # Parse timestamp
        if timestamp_str:
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        else:
            timestamp = datetime.now()

        # Create processing service (or get from cache)
        processing_service = GazeProcessingService()

        # Process frame
        result = processing_service.process_base64_frame(
            base64_frame=frame_base64,
            timestamp=timestamp,
            detect_anomalies=True
        )

        # Store in database
        gaze_event = GazeEvent(
            session_id=session_id,
            timestamp=timestamp,
            gaze_x=result["gaze_x"],
            gaze_y=result["gaze_y"],
            is_off_screen=result["is_off_screen"],
            off_screen_direction=result.get("off_screen_direction"),
            confidence=result["confidence"],
            gaze_vector_x=result.get("gaze_vector_x"),
            gaze_vector_y=result.get("gaze_vector_y"),
            gaze_vector_z=result.get("gaze_vector_z"),
            head_pitch=result.get("head_pitch"),
            head_yaw=result.get("head_yaw"),
            head_roll=result.get("head_roll"),
            is_filtered=result.get("is_filtered", True),
            raw_gaze_x=result.get("raw_gaze_x"),
            raw_gaze_y=result.get("raw_gaze_y")
        )

        db.add(gaze_event)
        db.commit()

        return result

    except Exception as e:
        logger.error("frame_processing_error", error=str(e))
        return {"error": str(e)}, 500
