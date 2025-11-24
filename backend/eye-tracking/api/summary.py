"""
Session Summary API
Endpoints for retrieving gaze session summaries
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime
from uuid import UUID
import structlog

from ..src.database import get_db_session, GazeEvent, GazeSession, GazeSummary
from ..services.pattern_recognition import GazePoint
from ..services.summary_generation import SummaryGenerationService
from ..schemas.summary import SummaryRequest, SummaryResponse
from ..src.config import settings

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/summary/{session_id}", response_model=SummaryResponse)
async def get_session_summary(
    session_id: UUID,
    generate_heatmap: bool = True,
    db: Session = Depends(get_db_session)
):
    """
    Get comprehensive summary for a gaze session

    Args:
        session_id: Session UUID
        generate_heatmap: Whether to generate heatmap visualization
        db: Database session

    Returns:
        Comprehensive session summary with patterns, anomalies, and risk score
    """
    try:
        # Check if session exists
        session = db.query(GazeSession).filter(
            GazeSession.session_id == session_id
        ).first()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check if summary already exists
        existing_summary = db.query(GazeSummary).filter(
            GazeSummary.session_id == session_id
        ).first()

        if existing_summary:
            # Return cached summary
            logger.info("returning_cached_summary", session_id=str(session_id))
            return existing_summary.__dict__

        # Fetch gaze events
        gaze_events = db.query(GazeEvent).filter(
            GazeEvent.session_id == session_id
        ).order_by(GazeEvent.timestamp).all()

        if not gaze_events:
            raise HTTPException(status_code=404, detail="No gaze data found for session")

        # Convert to GazePoint objects
        gaze_points = [
            GazePoint(
                x=event.gaze_x,
                y=event.gaze_y,
                timestamp=event.timestamp,
                is_off_screen=event.is_off_screen,
                off_screen_direction=event.off_screen_direction,
                confidence=event.confidence
            )
            for event in gaze_events
        ]

        # Generate summary
        summary_service = SummaryGenerationService()

        heatmap_dir = settings.HEATMAP_OUTPUT_DIR if generate_heatmap else None

        summary = summary_service.generate_summary(
            session_id=session_id,
            gaze_points=gaze_points,
            heatmap_output_dir=heatmap_dir
        )

        # Store summary in database
        gaze_summary = GazeSummary(
            session_id=session_id,
            total_duration_seconds=summary["total_duration_seconds"],
            on_screen_percentage=summary["on_screen_percentage"],
            average_confidence=summary["average_confidence"],
            patterns_detected=summary["patterns_detected"],
            off_screen_events=summary["off_screen_events"],
            anomalies=summary["anomalies"],
            heatmap_url=summary.get("heatmap_url"),
            risk_score=summary["risk_score"],
            risk_factors=summary["risk_factors"]
        )

        db.add(gaze_summary)

        # Update session with risk score
        session.risk_score = summary["risk_score"]
        session.total_duration_seconds = summary["total_duration_seconds"]
        session.on_screen_percentage = summary["on_screen_percentage"]
        session.average_confidence = summary["average_confidence"]

        db.commit()

        logger.info(
            "summary_generated_and_stored",
            session_id=str(session_id),
            risk_score=summary["risk_score"]
        )

        return summary

    except HTTPException:
        raise
    except Exception as e:
        logger.error("summary_generation_error", session_id=str(session_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")


@router.post("/summary/{session_id}/refresh")
async def refresh_session_summary(
    session_id: UUID,
    generate_heatmap: bool = True,
    db: Session = Depends(get_db_session)
):
    """
    Force regeneration of session summary

    Args:
        session_id: Session UUID
        generate_heatmap: Whether to regenerate heatmap
        db: Database session

    Returns:
        Refreshed summary
    """
    try:
        # Delete existing summary
        db.query(GazeSummary).filter(
            GazeSummary.session_id == session_id
        ).delete()
        db.commit()

        # Regenerate summary
        return await get_session_summary(session_id, generate_heatmap, db)

    except Exception as e:
        logger.error("summary_refresh_error", session_id=str(session_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Summary refresh failed: {str(e)}")


@router.get("/sessions")
async def list_sessions(
    user_id: UUID = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db_session)
):
    """
    List gaze sessions

    Args:
        user_id: Optional user ID filter
        page: Page number (1-indexed)
        page_size: Items per page
        db: Database session

    Returns:
        List of sessions
    """
    try:
        # Build query
        query = db.query(GazeSession)

        if user_id:
            query = query.filter(GazeSession.user_id == user_id)

        # Get total count
        total_count = query.count()

        # Paginate
        offset = (page - 1) * page_size
        sessions = query.order_by(
            GazeSession.started_at.desc()
        ).offset(offset).limit(page_size).all()

        # Format response
        session_list = [
            {
                "session_id": session.session_id,
                "user_id": session.user_id,
                "started_at": session.started_at.isoformat(),
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "duration_seconds": session.total_duration_seconds,
                "risk_score": session.risk_score,
                "is_calibrated": session.is_calibrated
            }
            for session in sessions
        ]

        return {
            "sessions": session_list,
            "total_count": total_count,
            "page": page,
            "page_size": page_size
        }

    except Exception as e:
        logger.error("session_list_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Session list failed: {str(e)}")
