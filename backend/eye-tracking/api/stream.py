"""
Real-time Gaze Streaming API
WebSocket endpoint for real-time gaze tracking
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import json
import structlog
from typing import Dict

from src.database import get_db_session, GazeEvent
from services.gaze_processing import GazeProcessingService
from schemas.gaze import StreamFrameMessage, StreamGazeMessage, StreamErrorMessage
from lib.errors import FrameProcessingError, NoFaceDetectedError

logger = structlog.get_logger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manage WebSocket connections"""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.processing_services: Dict[str, GazeProcessingService] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        """Accept and store WebSocket connection"""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.processing_services[session_id] = GazeProcessingService()
        logger.info("websocket_connected", session_id=session_id)

    def disconnect(self, session_id: str):
        """Remove WebSocket connection"""
        if session_id in self.active_connections:
            del self.active_connections[session_id]
        if session_id in self.processing_services:
            del self.processing_services[session_id]
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


manager = ConnectionManager()


@router.websocket("/stream")
async def gaze_stream(websocket: WebSocket):
    """
    WebSocket endpoint for real-time gaze tracking

    Protocol:
    1. Client connects
    2. Client sends frame messages: {"session_id": "...", "frame": "base64...", "timestamp": "..."}
    3. Server responds with gaze data: {"gaze_x": ..., "gaze_y": ..., "confidence": ..., ...}
    4. On error, server sends: {"message_type": "error", "error": "..."}
    """
    session_id = None

    try:
        # Accept connection
        await websocket.accept()
        logger.info("websocket_connection_accepted")

        # Main message loop
        while True:
            try:
                # Receive message
                message = await websocket.receive_json()

                # Parse session ID from first message
                if session_id is None:
                    session_id = message.get("session_id")
                    if not session_id:
                        await websocket.send_json({
                            "message_type": "error",
                            "error": "session_id required",
                            "timestamp": datetime.now().isoformat()
                        })
                        continue

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

                    # Store in database (async would be better in production)
                    try:
                        # In production, use background task or message queue
                        pass  # Database storage handled elsewhere
                    except Exception as e:
                        logger.error("database_storage_error", error=str(e))

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
