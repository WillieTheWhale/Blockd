"""
Meeting Stream API Routes
Endpoints for receiving audio/video streams from the Blockd browser
when users are on meeting platforms (Google Meet, Zoom, MS Teams)
"""

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional, Dict, Any
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Depends, Query
from pydantic import BaseModel, Field

from lib.auth import require_auth, AuthResult, get_ws_authenticator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meeting-stream")

# Active meeting streams (session_id -> stream info)
active_meeting_streams: Dict[str, Dict[str, Any]] = {}
# Lock for thread-safe access to active_meeting_streams
active_meeting_streams_lock = asyncio.Lock()

# Maximum upload sizes to prevent unbounded file uploads
MAX_AUDIO_CHUNK_SIZE = 5 * 1024 * 1024  # 5 MB max for audio chunks
MAX_VIDEO_FRAME_SIZE = 2 * 1024 * 1024  # 2 MB max for video frames

# Valid meeting platform domains for URL validation
VALID_MEETING_DOMAINS = {
    "google-meet": ["meet.google.com"],
    "zoom": ["zoom.us", "us02web.zoom.us", "us04web.zoom.us", "us05web.zoom.us", "us06web.zoom.us"],
    "teams": ["teams.microsoft.com", "teams.live.com"],
}


def validate_meeting_url(meeting_url: str, meeting_platform: str) -> bool:
    """
    Validate that the meeting URL domain matches the expected platform.

    Args:
        meeting_url: The full meeting URL
        meeting_platform: The platform identifier (google-meet, zoom, teams)

    Returns:
        True if URL domain matches expected platform, False otherwise
    """
    try:
        parsed = urlparse(meeting_url)
        hostname = parsed.hostname

        if not hostname:
            return False

        # Normalize hostname to lowercase
        hostname = hostname.lower()

        # Get valid domains for the platform
        valid_domains = VALID_MEETING_DOMAINS.get(meeting_platform, [])

        # Check if hostname matches any valid domain (including subdomains)
        for domain in valid_domains:
            if hostname == domain or hostname.endswith(f".{domain}"):
                return True

        return False
    except Exception:
        return False


# Request/Response models
class MeetingStreamStartRequest(BaseModel):
    """Request to start meeting stream capture"""
    session_id: str = Field(..., description="Interview session UUID")
    user_id: str = Field(..., description="User ID (interviewee)")
    meeting_platform: str = Field(..., description="Platform: google-meet, zoom, teams")
    meeting_url: str = Field(..., description="Full meeting URL")
    browser_fingerprint: str = Field(..., description="Browser verification fingerprint")
    video_enabled: bool = Field(default=True, description="Whether to capture video")
    audio_enabled: bool = Field(default=True, description="Whether to capture audio")


class MeetingStreamStopRequest(BaseModel):
    """Request to stop meeting stream capture"""
    session_id: str = Field(..., description="Interview session UUID")
    reason: str = Field(default="user_stopped", description="Reason for stopping")


class MeetingStreamStatus(BaseModel):
    """Meeting stream status response"""
    session_id: str
    is_active: bool
    meeting_platform: Optional[str]
    started_at: Optional[str]
    duration_seconds: int
    video_frames_received: int
    audio_chunks_received: int
    bytes_received: int
    last_activity: Optional[str]


class AudioChunkMetadata(BaseModel):
    """Metadata for audio chunk upload"""
    session_id: str
    chunk_index: int
    timestamp: str
    duration_ms: int
    sample_rate: int = 48000
    channels: int = 1


class VideoFrameMetadata(BaseModel):
    """Metadata for video frame upload"""
    session_id: str
    frame_index: int
    timestamp: str
    width: int
    height: int
    format: str = "jpeg"  # jpeg, webp, png


@router.post("/start")
async def start_meeting_stream(request: MeetingStreamStartRequest, auth: AuthResult = Depends(require_auth)):
    """
    Start capturing meeting stream from Blockd browser

    Called by the browser when user navigates to a meeting platform.
    Initializes stream capture and prepares for receiving media chunks.
    Requires JWT authentication.
    """
    session_id = request.session_id

    logger.info(
        f"Starting meeting stream for session {session_id} "
        f"(platform: {request.meeting_platform}, user: {request.user_id}, auth_user: {auth.user_id})"
    )

    async with active_meeting_streams_lock:
        # Check if already streaming
        if session_id in active_meeting_streams:
            existing = active_meeting_streams[session_id]
            if existing.get("is_active"):
                return {
                    "success": True,
                    "message": "Stream already active",
                    "stream_id": existing.get("stream_id"),
                    "endpoints": get_stream_endpoints(session_id)
                }

        # Validate meeting platform
        valid_platforms = ["google-meet", "zoom", "teams"]
        if request.meeting_platform not in valid_platforms:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid meeting platform. Must be one of: {valid_platforms}"
            )

        # Validate meeting URL domain matches the specified platform
        if not validate_meeting_url(request.meeting_url, request.meeting_platform):
            expected_domains = VALID_MEETING_DOMAINS.get(request.meeting_platform, [])
            raise HTTPException(
                status_code=400,
                detail=f"Meeting URL domain does not match expected platform. "
                       f"For {request.meeting_platform}, URL must be from: {expected_domains}"
            )

        # Create stream entry
        stream_id = f"{session_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

        active_meeting_streams[session_id] = {
            "stream_id": stream_id,
            "user_id": request.user_id,
            "meeting_platform": request.meeting_platform,
            "meeting_url": request.meeting_url,
            "browser_fingerprint": request.browser_fingerprint,
            "video_enabled": request.video_enabled,
            "audio_enabled": request.audio_enabled,
            "started_at": datetime.utcnow().isoformat(),
            "is_active": True,
            "video_frames_received": 0,
            "audio_chunks_received": 0,
            "bytes_received": 0,
            "last_activity": datetime.utcnow().isoformat(),
        }

        logger.info(f"Meeting stream started: {stream_id}")

    return {
        "success": True,
        "message": "Meeting stream started",
        "stream_id": stream_id,
        "endpoints": get_stream_endpoints(session_id),
        "config": {
            "video_quality": "720p",
            "video_fps": 15,
            "video_format": "jpeg",
            "audio_sample_rate": 48000,
            "audio_channels": 1,
            "chunk_duration_ms": 5000,
            "heartbeat_interval_ms": 10000,
            "max_audio_chunk_size": MAX_AUDIO_CHUNK_SIZE,
            "max_video_frame_size": MAX_VIDEO_FRAME_SIZE,
        }
    }


@router.post("/stop")
async def stop_meeting_stream(request: MeetingStreamStopRequest, auth: AuthResult = Depends(require_auth)):
    """
    Stop capturing meeting stream

    Called when user leaves the meeting or ends the session.
    Requires JWT authentication.
    """
    session_id = request.session_id

    logger.info(f"Stopping meeting stream for session {session_id} (reason: {request.reason}, user: {auth.user_id})")

    async with active_meeting_streams_lock:
        if session_id not in active_meeting_streams:
            return {
                "success": True,
                "message": "No active stream found",
            }

        stream = active_meeting_streams[session_id]
        stream["is_active"] = False
        stream["ended_at"] = datetime.utcnow().isoformat()
        stream["end_reason"] = request.reason

        # Calculate duration
        started = datetime.fromisoformat(stream["started_at"])
        duration_seconds = int((datetime.utcnow() - started).total_seconds())

        # Move to completed streams (keep for a short time for cleanup)
        # In production, this would trigger upload to S3 and processing

        return {
            "success": True,
            "message": "Meeting stream stopped",
            "summary": {
                "duration_seconds": duration_seconds,
                "video_frames_received": stream["video_frames_received"],
                "audio_chunks_received": stream["audio_chunks_received"],
                "bytes_received": stream["bytes_received"],
            }
        }


@router.get("/status/{session_id}", response_model=MeetingStreamStatus)
async def get_meeting_stream_status(session_id: str, auth: AuthResult = Depends(require_auth)):
    """
    Get status of meeting stream for a session
    Requires JWT authentication.
    """
    async with active_meeting_streams_lock:
        if session_id not in active_meeting_streams:
            return MeetingStreamStatus(
                session_id=session_id,
                is_active=False,
                meeting_platform=None,
                started_at=None,
                duration_seconds=0,
                video_frames_received=0,
                audio_chunks_received=0,
                bytes_received=0,
                last_activity=None,
            )

        stream = active_meeting_streams[session_id]

        # Calculate duration
        duration = 0
        if stream.get("started_at"):
            started = datetime.fromisoformat(stream["started_at"])
            duration = int((datetime.utcnow() - started).total_seconds())

        return MeetingStreamStatus(
            session_id=session_id,
            is_active=stream.get("is_active", False),
            meeting_platform=stream.get("meeting_platform"),
            started_at=stream.get("started_at"),
            duration_seconds=duration,
            video_frames_received=stream.get("video_frames_received", 0),
            audio_chunks_received=stream.get("audio_chunks_received", 0),
            bytes_received=stream.get("bytes_received", 0),
            last_activity=stream.get("last_activity"),
        )


@router.post("/audio/{session_id}")
async def upload_audio_chunk(
    session_id: str,
    audio: UploadFile = File(...),
    chunk_index: int = Form(...),
    timestamp: str = Form(...),
    duration_ms: int = Form(...),
    auth: AuthResult = Depends(require_auth),
):
    """
    Upload audio chunk from meeting stream

    Browser sends audio in chunks (typically 5 seconds each).
    Audio is stored for later processing by AI detection service.
    Requires JWT authentication.
    """
    # Read audio data with size limit validation
    audio_data = await audio.read(MAX_AUDIO_CHUNK_SIZE + 1)
    if len(audio_data) > MAX_AUDIO_CHUNK_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Audio chunk too large. Maximum size is {MAX_AUDIO_CHUNK_SIZE} bytes"
        )

    async with active_meeting_streams_lock:
        if session_id not in active_meeting_streams:
            raise HTTPException(status_code=404, detail="No active stream for this session")

        stream = active_meeting_streams[session_id]

        if not stream.get("is_active"):
            raise HTTPException(status_code=400, detail="Stream is not active")

        if not stream.get("audio_enabled"):
            raise HTTPException(status_code=400, detail="Audio capture not enabled for this stream")

        # Update counters
        stream["audio_chunks_received"] = stream.get("audio_chunks_received", 0) + 1
        stream["bytes_received"] = stream.get("bytes_received", 0) + len(audio_data)
        stream["last_activity"] = datetime.utcnow().isoformat()

    logger.debug(
        f"Received audio chunk {chunk_index} for session {session_id} "
        f"({len(audio_data)} bytes, {duration_ms}ms)"
    )

    # In production: save to temporary storage and queue for processing
    # await save_audio_chunk(session_id, chunk_index, audio_data, timestamp)
    # await queue_audio_for_analysis(session_id, chunk_index)

    return {
        "success": True,
        "chunk_index": chunk_index,
        "bytes_received": len(audio_data),
    }


@router.post("/video/{session_id}")
async def upload_video_frame(
    session_id: str,
    frame: UploadFile = File(...),
    frame_index: int = Form(...),
    timestamp: str = Form(...),
    width: int = Form(default=1280),
    height: int = Form(default=720),
    auth: AuthResult = Depends(require_auth),
):
    """
    Upload video frame from meeting stream

    Browser sends video frames at reduced rate (15 fps).
    Frames are stored for eye tracking and recording.
    Requires JWT authentication.
    """
    # Read frame data with size limit validation
    frame_data = await frame.read(MAX_VIDEO_FRAME_SIZE + 1)
    if len(frame_data) > MAX_VIDEO_FRAME_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Video frame too large. Maximum size is {MAX_VIDEO_FRAME_SIZE} bytes"
        )

    async with active_meeting_streams_lock:
        if session_id not in active_meeting_streams:
            raise HTTPException(status_code=404, detail="No active stream for this session")

        stream = active_meeting_streams[session_id]

        if not stream.get("is_active"):
            raise HTTPException(status_code=400, detail="Stream is not active")

        if not stream.get("video_enabled"):
            raise HTTPException(status_code=400, detail="Video capture not enabled for this stream")

        # Update counters
        stream["video_frames_received"] = stream.get("video_frames_received", 0) + 1
        stream["bytes_received"] = stream.get("bytes_received", 0) + len(frame_data)
        stream["last_activity"] = datetime.utcnow().isoformat()

    logger.debug(
        f"Received video frame {frame_index} for session {session_id} "
        f"({len(frame_data)} bytes, {width}x{height})"
    )

    # In production: save to temporary storage and queue for processing
    # await save_video_frame(session_id, frame_index, frame_data, timestamp)
    # await queue_frame_for_eye_tracking(session_id, frame_index)

    return {
        "success": True,
        "frame_index": frame_index,
        "bytes_received": len(frame_data),
    }


@router.websocket("/ws/{session_id}")
async def meeting_stream_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(None, description="JWT token for authentication"),
    session_token: str = Query(None, description="Session-specific token"),
):
    """
    WebSocket endpoint for real-time meeting stream

    Alternative to chunk uploads - allows streaming via WebSocket
    for lower latency applications.
    Requires JWT authentication via query parameter.
    """
    # Authenticate the connection before accepting
    authenticator = get_ws_authenticator()
    auth_result = await authenticator.authenticate(
        session_id=session_id,
        jwt_token=token,
        session_token=session_token
    )

    if not auth_result.is_valid:
        logger.warning(f"WebSocket auth failed for meeting stream {session_id}: {auth_result.error}")
        await websocket.close(code=4001, reason=auth_result.error or "Authentication failed")
        return

    await websocket.accept()
    logger.info(f"WebSocket meeting stream connected for session {session_id} (user: {auth_result.user_id})")

    async with active_meeting_streams_lock:
        if session_id not in active_meeting_streams:
            await websocket.close(code=4004, reason="No active stream for this session")
            return
        stream = active_meeting_streams[session_id]

    try:
        while True:
            async with active_meeting_streams_lock:
                is_active = stream.get("is_active", False)
            if not is_active:
                break

            # Receive binary data (audio/video chunks)
            data = await asyncio.wait_for(
                websocket.receive_bytes(),
                timeout=30.0
            )

            # First byte indicates type: 0x01 = audio, 0x02 = video
            if len(data) < 1:
                continue

            data_type = data[0]
            payload = data[1:]

            # Validate payload size based on type
            if data_type == 0x01 and len(payload) > MAX_AUDIO_CHUNK_SIZE:
                await websocket.send_json({
                    "type": "error",
                    "error": f"Audio chunk too large. Maximum size is {MAX_AUDIO_CHUNK_SIZE} bytes"
                })
                continue
            elif data_type == 0x02 and len(payload) > MAX_VIDEO_FRAME_SIZE:
                await websocket.send_json({
                    "type": "error",
                    "error": f"Video frame too large. Maximum size is {MAX_VIDEO_FRAME_SIZE} bytes"
                })
                continue

            async with active_meeting_streams_lock:
                if data_type == 0x01:  # Audio
                    stream["audio_chunks_received"] = stream.get("audio_chunks_received", 0) + 1
                elif data_type == 0x02:  # Video
                    stream["video_frames_received"] = stream.get("video_frames_received", 0) + 1

                stream["bytes_received"] = stream.get("bytes_received", 0) + len(payload)
                stream["last_activity"] = datetime.utcnow().isoformat()

            # Send acknowledgment
            await websocket.send_json({
                "type": "ack",
                "bytes_received": len(payload)
            })

    except WebSocketDisconnect:
        logger.info(f"WebSocket meeting stream disconnected for session {session_id}")
    except asyncio.TimeoutError:
        logger.warning(f"WebSocket meeting stream timeout for session {session_id}")
        await websocket.close(code=4008, reason="Timeout - no data received")
    except Exception as e:
        logger.error(f"WebSocket meeting stream error for session {session_id}: {e}")
        await websocket.close(code=1011, reason=str(e))


def get_stream_endpoints(session_id: str) -> Dict[str, str]:
    """Get endpoint URLs for a session"""
    return {
        "audio_upload": f"/api/v1/meeting-stream/audio/{session_id}",
        "video_upload": f"/api/v1/meeting-stream/video/{session_id}",
        "websocket": f"/api/v1/meeting-stream/ws/{session_id}",
        "status": f"/api/v1/meeting-stream/status/{session_id}",
        "stop": "/api/v1/meeting-stream/stop",
    }
