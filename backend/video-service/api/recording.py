"""
Recording API Routes
Endpoints for managing video recording sessions
"""

import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field

from services.recording import RecordingManager, RecordingNotFoundError, RecordingAlreadyStartedError
from lib.auth import require_auth, AuthResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recording")

# Global recording manager (injected from main app)
recording_manager: Optional[RecordingManager] = None


def get_recording_manager() -> RecordingManager:
    """Get recording manager instance"""
    if recording_manager is None:
        raise HTTPException(status_code=500, detail="Recording manager not initialized")
    return recording_manager


# Request/Response models
class StartRecordingRequest(BaseModel):
    """Request to start recording"""
    session_id: str = Field(..., description="Interview session UUID")
    input_source: str = Field(..., description="RTMP URL or RTP stream URL")
    video_codec: Optional[str] = Field(None, description="Optional video codec override")
    audio_codec: Optional[str] = Field(None, description="Optional audio codec override")


class StartRecordingResponse(BaseModel):
    """Response with recording metadata"""
    session_id: str
    status: str
    started_at: str
    output_path: str


class StopRecordingRequest(BaseModel):
    """Request to stop recording"""
    session_id: str
    upload_to_s3: bool = Field(default=True, description="Upload to S3 and create adaptive streams")


class StopRecordingResponse(BaseModel):
    """Response with recording results"""
    session_id: str
    status: str
    started_at: Optional[str]
    stopped_at: Optional[str]
    duration: Optional[float]
    file_path: Optional[str]
    file_size: Optional[int]
    urls: Optional[list] = None
    thumbnail_url: Optional[str] = None


class RecordingStatusResponse(BaseModel):
    """Recording status response"""
    session_id: str
    status: str
    is_recording: bool
    started_at: Optional[str] = None
    duration: Optional[float] = None


@router.post("/start", response_model=StartRecordingResponse)
async def start_recording(request: StartRecordingRequest, auth: AuthResult = Depends(require_auth)):
    """
    Start recording for an interview session

    Starts FFmpeg recording from the specified input source (RTMP/RTP stream).
    The recording is saved locally and can be uploaded to S3 when stopped.
    Requires JWT authentication.
    """
    logger.info(f"Starting recording for session {request.session_id} (user: {auth.user_id})")

    try:
        manager = get_recording_manager()

        result = await manager.start_session_recording(
            session_id=request.session_id,
            input_source=request.input_source,
            video_codec=request.video_codec,
            audio_codec=request.audio_codec
        )

        return StartRecordingResponse(**result)

    except RecordingAlreadyStartedError as e:
        logger.warning(f"Recording already started: {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to start recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop", response_model=StopRecordingResponse)
async def stop_recording(
    request: StopRecordingRequest,
    background_tasks: BackgroundTasks,
    auth: AuthResult = Depends(require_auth)
):
    """
    Stop recording and optionally upload to S3

    Stops the FFmpeg recording process. If upload_to_s3 is True:
    - Creates adaptive bitrate streams (240p, 360p, 480p, 720p)
    - Generates video thumbnail
    - Uploads all files to S3
    - Returns signed URLs for all versions

    Note: Encoding and upload may take several minutes for long recordings.
    Requires JWT authentication.
    """
    logger.info(f"Stopping recording for session {request.session_id} (user: {auth.user_id})")

    try:
        manager = get_recording_manager()

        result = await manager.stop_session_recording(
            session_id=request.session_id,
            upload_to_s3=request.upload_to_s3
        )

        return StopRecordingResponse(**result)

    except RecordingNotFoundError as e:
        logger.warning(f"Recording not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to stop recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{session_id}", response_model=RecordingStatusResponse)
async def get_recording_status(session_id: str, auth: AuthResult = Depends(require_auth)):
    """
    Get current status of a recording

    Returns whether a recording is active and its duration if recording.
    Requires JWT authentication.
    """
    logger.info(f"Getting recording status for session {session_id} (user: {auth.user_id})")

    try:
        manager = get_recording_manager()
        result = await manager.get_recording_status(session_id)

        return RecordingStatusResponse(**result)

    except Exception as e:
        logger.error(f"Failed to get recording status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_active_recordings(auth: AuthResult = Depends(require_auth)):
    """
    List all active recordings

    Returns a list of all currently active recording sessions.
    Requires JWT authentication.
    """
    try:
        manager = get_recording_manager()

        active = [
            {
                'session_id': session_id,
                'started_at': recorder.started_at.isoformat() if recorder.started_at else None,
                'duration': recorder.get_duration(),
                'is_recording': recorder.is_recording
            }
            for session_id, recorder in manager.active_recordings.items()
        ]

        return {
            'active_recordings': active,
            'count': len(active)
        }

    except Exception as e:
        logger.error(f"Failed to list recordings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics")
async def get_recording_metrics(auth: AuthResult = Depends(require_auth)):
    """
    Get recording service metrics

    Returns statistics about recordings (started, completed, failed).
    Requires JWT authentication.
    """
    try:
        manager = get_recording_manager()

        return {
            'active_recordings': len(manager.active_recordings),
            'total_recordings_started': manager.total_recordings_started,
            'total_recordings_completed': manager.total_recordings_completed,
            'total_recordings_failed': manager.total_recordings_failed,
        }

    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{session_id}")
async def delete_recording(session_id: str, auth: AuthResult = Depends(require_auth)):
    """
    Stop and delete recording for a session

    Force stops the recording (if active) without uploading to S3.
    Useful for cancelling recordings or cleaning up.
    Requires JWT authentication.
    """
    logger.info(f"Deleting recording for session {session_id} (user: {auth.user_id})")

    try:
        manager = get_recording_manager()

        # Check if recording is active
        if session_id in manager.active_recordings:
            # Stop without uploading
            await manager.stop_session_recording(session_id, upload_to_s3=False)

        return {
            'success': True,
            'message': f'Recording deleted for session {session_id}'
        }

    except Exception as e:
        logger.error(f"Failed to delete recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Dependency injection helper
def set_recording_manager(manager: RecordingManager):
    """Set global recording manager instance"""
    global recording_manager
    recording_manager = manager
