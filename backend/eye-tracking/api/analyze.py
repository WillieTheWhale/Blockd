"""
Gaze Analysis API
Endpoints for batch gaze analysis
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
import structlog

from src.database import get_db_session, GazeEvent
from services.pattern_recognition import PatternRecognitionService, GazePoint
from services.anomaly_detection import AnomalyDetectionService
from schemas.analysis import AnalysisBatchRequest, AnalysisResponse

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_gaze_data(
    request: AnalysisBatchRequest,
    db: Session = Depends(get_db_session)
):
    """
    Perform batch analysis on gaze data

    Args:
        request: Analysis request with session_id and time range
        db: Database session

    Returns:
        Analysis results with patterns and anomalies
    """
    try:
        # Build query
        query = db.query(GazeEvent).filter(
            GazeEvent.session_id == request.session_id
        )

        # Apply time filters
        if request.start_time:
            query = query.filter(GazeEvent.timestamp >= request.start_time)
        if request.end_time:
            query = query.filter(GazeEvent.timestamp <= request.end_time)

        # Fetch events
        gaze_events = query.order_by(GazeEvent.timestamp).all()

        if not gaze_events:
            raise HTTPException(status_code=404, detail="No gaze data found")

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

        # Initialize services
        pattern_service = PatternRecognitionService()
        anomaly_service = AnomalyDetectionService()

        # Detect patterns
        patterns = None
        if request.detect_patterns:
            pattern_results = pattern_service.analyze_all_patterns(gaze_points)

            patterns = {
                "is_reading": pattern_results["reading"]["is_reading"],
                "reading_confidence": pattern_results["reading"].get("confidence"),
                "is_drifting": pattern_results["attention_drift"]["is_drifting"],
                "max_drift_seconds": pattern_results["attention_drift"].get("max_drift_seconds"),
                "shifty_eyes_detected": pattern_results["shifty_eyes"]["detected"],
                "shifty_eyes_direction": pattern_results["shifty_eyes"].get("direction")
            }

        # Detect anomalies
        anomalies = None
        if request.detect_anomalies:
            # LSTM anomalies
            lstm_anomalies = anomaly_service.detect_batch_anomalies(gaze_points)

            # Statistical anomalies
            stat_anomalies = anomaly_service.detect_statistical_anomalies(gaze_points)

            # Combine
            all_anomalies = lstm_anomalies + stat_anomalies

            anomalies = [
                {
                    "timestamp": datetime.fromisoformat(a["timestamp"]),
                    "anomaly_score": a["anomaly_score"],
                    "anomaly_type": a["anomaly_type"],
                    "description": a["description"]
                }
                for a in all_anomalies
            ]

        # Calculate statistics
        on_screen_count = sum(1 for p in gaze_points if not p.is_off_screen)
        on_screen_percentage = (on_screen_count / len(gaze_points) * 100)

        average_confidence = sum(p.confidence for p in gaze_points) / len(gaze_points)

        logger.info(
            "gaze_analysis_completed",
            session_id=str(request.session_id),
            num_points=len(gaze_points),
            patterns_detected=patterns is not None,
            anomalies_detected=len(anomalies) if anomalies else 0
        )

        return {
            "session_id": request.session_id,
            "analysis_timestamp": datetime.now(),
            "num_gaze_points_analyzed": len(gaze_points),
            "patterns": patterns,
            "anomalies": anomalies,
            "on_screen_percentage": on_screen_percentage,
            "average_confidence": average_confidence
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("analysis_error", session_id=str(request.session_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/analyze/{session_id}/fixations")
async def analyze_fixations(
    session_id: UUID,
    db: Session = Depends(get_db_session)
):
    """
    Analyze fixations and saccades for session

    Args:
        session_id: Session UUID
        db: Database session

    Returns:
        Fixations and saccades data
    """
    try:
        # Fetch gaze events
        gaze_events = db.query(GazeEvent).filter(
            GazeEvent.session_id == session_id
        ).order_by(GazeEvent.timestamp).all()

        if not gaze_events:
            raise HTTPException(status_code=404, detail="No gaze data found")

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

        # Analyze fixations and saccades
        pattern_service = PatternRecognitionService()
        result = pattern_service.detect_fixations_and_saccades(gaze_points)

        logger.info(
            "fixation_analysis_completed",
            session_id=str(session_id),
            num_fixations=result["num_fixations"],
            num_saccades=result["num_saccades"]
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("fixation_analysis_error", session_id=str(session_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Fixation analysis failed: {str(e)}")
