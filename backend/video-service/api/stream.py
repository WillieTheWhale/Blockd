"""
Stream Management API Routes
Endpoints for managing WebRTC stream sessions
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.stream import StreamManager, StreamError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stream")

# Global stream manager (injected from main app)
stream_manager: Optional[StreamManager] = None


def get_stream_manager() -> StreamManager:
    """Get stream manager instance"""
    if stream_manager is None:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    return stream_manager


# Request/Response models
class CreateSessionRequest(BaseModel):
    """Request to create stream session"""
    session_id: str = Field(..., description="Interview session UUID")
    interviewer_id: str = Field(..., description="Interviewer user ID")
    candidate_id: str = Field(..., description="Candidate user ID")


class SessionInfoResponse(BaseModel):
    """Stream session information"""
    session_id: str
    interviewer_id: str
    candidate_id: str
    created_at: str
    started_at: Optional[str]
    ended_at: Optional[str]
    is_active: bool
    is_recording: bool
    participant_count: int
    connected_participants: list
    producer_count: int
    consumer_count: int


class ParticipantRequest(BaseModel):
    """Request to add/remove participant"""
    user_id: str = Field(..., description="User ID")


class SessionStatsResponse(BaseModel):
    """Stream statistics"""
    active_sessions: int
    total_participants: int
    total_producers: int
    total_consumers: int
    max_concurrent_streams: int


@router.post("/sessions", response_model=SessionInfoResponse)
async def create_session(request: CreateSessionRequest):
    """
    Create new stream session

    Initializes a new WebRTC streaming session for an interview.
    Must be called before participants can join.
    """
    logger.info(
        f"Creating stream session {request.session_id} "
        f"(interviewer: {request.interviewer_id}, candidate: {request.candidate_id})"
    )

    try:
        manager = get_stream_manager()

        session = await manager.create_session(
            session_id=request.session_id,
            interviewer_id=request.interviewer_id,
            candidate_id=request.candidate_id
        )

        return SessionInfoResponse(**session.get_session_info())

    except StreamError as e:
        logger.error(f"Failed to create session: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}", response_model=SessionInfoResponse)
async def get_session(session_id: str):
    """
    Get stream session information

    Returns current state and participants for a session.
    """
    logger.info(f"Getting session info for {session_id}")

    try:
        manager = get_stream_manager()
        session = await manager.get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        return SessionInfoResponse(**session.get_session_info())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/start")
async def start_session(session_id: str):
    """
    Start stream session

    Marks the session as active. Should be called when both participants are ready.
    """
    logger.info(f"Starting session {session_id}")

    try:
        manager = get_stream_manager()
        await manager.start_session(session_id)

        return {
            'success': True,
            'message': f'Session {session_id} started'
        }

    except StreamError as e:
        logger.error(f"Failed to start session: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error starting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/end")
async def end_session(session_id: str):
    """
    End stream session

    Marks the session as ended and cleans up resources.
    """
    logger.info(f"Ending session {session_id}")

    try:
        manager = get_stream_manager()
        await manager.end_session(session_id)

        return {
            'success': True,
            'message': f'Session {session_id} ended'
        }

    except Exception as e:
        logger.error(f"Failed to end session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/participants/add")
async def add_participant(session_id: str, request: ParticipantRequest):
    """
    Add participant to session

    Registers a user as connected to the session.
    """
    logger.info(f"Adding participant {request.user_id} to session {session_id}")

    try:
        manager = get_stream_manager()
        await manager.add_participant(session_id, request.user_id)

        return {
            'success': True,
            'message': f'Participant {request.user_id} added to session'
        }

    except StreamError as e:
        logger.error(f"Failed to add participant: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error adding participant: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/participants/remove")
async def remove_participant(session_id: str, request: ParticipantRequest):
    """
    Remove participant from session

    Unregisters a user from the session. If no participants remain, the session ends.
    """
    logger.info(f"Removing participant {request.user_id} from session {session_id}")

    try:
        manager = get_stream_manager()
        await manager.remove_participant(session_id, request.user_id)

        return {
            'success': True,
            'message': f'Participant {request.user_id} removed from session'
        }

    except Exception as e:
        logger.error(f"Failed to remove participant: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
async def list_sessions():
    """
    List all active sessions

    Returns information about all currently active streaming sessions.
    """
    logger.info("Listing all active sessions")

    try:
        manager = get_stream_manager()
        sessions = await manager.list_active_sessions()

        return {
            'sessions': sessions,
            'count': len(sessions)
        }

    except Exception as e:
        logger.error(f"Failed to list sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=SessionStatsResponse)
async def get_stats():
    """
    Get streaming statistics

    Returns aggregate statistics about all active sessions.
    """
    logger.info("Getting stream stats")

    try:
        manager = get_stream_manager()
        stats = await manager.get_session_stats()

        return SessionStatsResponse(**stats)

    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Force delete session

    Immediately ends and removes a session, cleaning up all resources.
    """
    logger.info(f"Force deleting session {session_id}")

    try:
        manager = get_stream_manager()
        await manager.end_session(session_id)

        return {
            'success': True,
            'message': f'Session {session_id} deleted'
        }

    except Exception as e:
        logger.error(f"Failed to delete session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Dependency injection helper
def set_stream_manager(manager: StreamManager):
    """Set global stream manager instance"""
    global stream_manager
    stream_manager = manager
