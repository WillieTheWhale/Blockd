"""
Gaze Calibration API
Endpoints for calibrating gaze estimation
"""

import threading
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
import structlog

from src.database import get_db_session, GazeSession
from services.gaze_processing import GazeProcessingService
from schemas.gaze import CalibrationRequest, CalibrationResponse

logger = structlog.get_logger(__name__)

router = APIRouter()

# Store processing services per session with TTL-based cleanup
# Each entry stores (service, last_access_time)
_processing_services: dict = {}
_processing_services_lock = threading.Lock()
_SERVICE_TTL_SECONDS = 3600  # 1 hour TTL


def _cleanup_expired_services():
    """Remove services that haven't been accessed within TTL"""
    current_time = time.time()
    expired_keys = []

    with _processing_services_lock:
        for session_id, (service, last_access) in _processing_services.items():
            if current_time - last_access > _SERVICE_TTL_SECONDS:
                expired_keys.append(session_id)

        for key in expired_keys:
            service, _ = _processing_services.pop(key)
            try:
                service.close()
            except Exception as e:
                logger.error("service_cleanup_error", session_id=key, error=str(e))

    if expired_keys:
        logger.info("expired_services_cleaned", count=len(expired_keys))


def _get_or_create_service(session_id: str) -> GazeProcessingService:
    """Thread-safe get or create processing service with TTL update"""
    # Periodically cleanup expired services (simple approach)
    _cleanup_expired_services()

    current_time = time.time()
    with _processing_services_lock:
        if session_id in _processing_services:
            service, _ = _processing_services[session_id]
            _processing_services[session_id] = (service, current_time)
            return service
        else:
            service = GazeProcessingService()
            _processing_services[session_id] = (service, current_time)
            return service


def _get_service(session_id: str) -> GazeProcessingService | None:
    """Thread-safe get service if exists"""
    current_time = time.time()
    with _processing_services_lock:
        if session_id in _processing_services:
            service, _ = _processing_services[session_id]
            _processing_services[session_id] = (service, current_time)
            return service
    return None


@router.post("/calibrate", response_model=CalibrationResponse)
async def calibrate_gaze(
    request: CalibrationRequest,
    db: Session = Depends(get_db_session)
):
    """
    Calibrate gaze estimation for a session

    Args:
        request: Calibration request with ground truth and observed points
        db: Database session

    Returns:
        Calibration result
    """
    try:
        session_id = str(request.session_id)

        # Check if session exists
        session = db.query(GazeSession).filter(
            GazeSession.session_id == request.session_id
        ).first()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get or create processing service (thread-safe with TTL)
        processing_service = _get_or_create_service(session_id)

        # Extract calibration points
        ground_truth_points = [
            (point.ground_truth_x, point.ground_truth_y)
            for point in request.calibration_points
        ]

        observed_points = [
            (point.observed_x, point.observed_y)
            for point in request.calibration_points
        ]

        # Apply calibration
        processing_service.calibrate_gaze(
            calibration_points=ground_truth_points,
            observed_points=observed_points
        )

        # Store calibration in database
        session.is_calibrated = True
        session.calibration_points = [
            {
                "ground_truth": {"x": gt[0], "y": gt[1]},
                "observed": {"x": obs[0], "y": obs[1]}
            }
            for gt, obs in zip(ground_truth_points, observed_points)
        ]

        db.commit()

        logger.info(
            "calibration_applied",
            session_id=session_id,
            num_points=len(request.calibration_points)
        )

        return {
            "session_id": request.session_id,
            "success": True,
            "message": f"Calibration applied with {len(request.calibration_points)} points",
            "calibration_applied": True
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("calibration_error", session_id=str(request.session_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Calibration failed: {str(e)}")


@router.post("/calibrate/{session_id}/reset")
async def reset_calibration(
    session_id: UUID,
    db: Session = Depends(get_db_session)
):
    """
    Reset calibration for a session

    Args:
        session_id: Session UUID
        db: Database session

    Returns:
        Reset result
    """
    try:
        session_id_str = str(session_id)

        # Check if session exists
        session = db.query(GazeSession).filter(
            GazeSession.session_id == session_id
        ).first()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Reset processing service calibration (thread-safe)
        service = _get_service(session_id_str)
        if service:
            service.reset_calibration()

        # Update database
        session.is_calibrated = False
        session.calibration_points = None

        db.commit()

        logger.info("calibration_reset", session_id=session_id_str)

        return {
            "session_id": session_id,
            "success": True,
            "message": "Calibration reset successfully",
            "calibration_applied": False
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("calibration_reset_error", session_id=str(session_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Calibration reset failed: {str(e)}")


@router.get("/calibrate/{session_id}/status")
async def get_calibration_status(
    session_id: UUID,
    db: Session = Depends(get_db_session)
):
    """
    Get calibration status for a session

    Args:
        session_id: Session UUID
        db: Database session

    Returns:
        Calibration status
    """
    try:
        # Check if session exists
        session = db.query(GazeSession).filter(
            GazeSession.session_id == session_id
        ).first()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return {
            "session_id": session_id,
            "is_calibrated": session.is_calibrated,
            "num_calibration_points": len(session.calibration_points) if session.calibration_points else 0,
            "calibration_points": session.calibration_points
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("calibration_status_error", session_id=str(session_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to get calibration status: {str(e)}")
