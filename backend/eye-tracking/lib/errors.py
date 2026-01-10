"""
Custom Exceptions for Eye Tracking Service.

This module provides a comprehensive exception hierarchy for the eye tracking service,
with HTTP status codes and error codes for proper API error responses.

Exception Hierarchy:
    EyeTrackingError (base)
    ├── FaceMeshError (422)
    │   ├── NoFaceDetectedError (422)
    │   └── LandmarkExtractionError (422)
    ├── GazeEstimationError (422)
    │   └── InvalidGazeVectorError (422)
    ├── CalibrationError (422)
    │   └── InsufficientCalibrationPointsError (422)
    ├── KalmanFilterError (500)
    ├── PatternRecognitionError (500)
    ├── AnomalyDetectionError (500)
    ├── ModelLoadError (503)
    ├── FrameProcessingError (422)
    │   └── InvalidFrameError (400)
    ├── SessionNotFoundError (404)
    ├── DatabaseError (500)
    ├── HeatmapGenerationError (500)
    ├── ConfigurationError (500)
    └── ValidationError (400)

Usage:
    from lib.errors import NoFaceDetectedError

    raise NoFaceDetectedError(
        "No face detected in frame",
        frame_index=42,
        confidence_threshold=0.5
    )
"""

from typing import Any, Dict, Optional


class EyeTrackingError(Exception):
    """
    Base exception for eye tracking service.

    All eye tracking errors inherit from this class, providing consistent
    error handling with HTTP status codes and structured error details.

    Attributes:
        message: Human-readable error message
        status_code: HTTP status code for API responses
        error_code: Machine-readable error code (e.g., "NO_FACE_DETECTED")
        details: Additional context about the error
    """

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_code: str = "EYE_TRACKING_ERROR",
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for JSON serialization"""
        return {
            "error": self.error_code,
            "message": self.message,
            "details": self.details,
        }


# =============================================================================
# Face Detection Errors (422 - Unprocessable Entity)
# =============================================================================

class FaceMeshError(EyeTrackingError):
    """Error in MediaPipe FaceMesh processing"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=f"FaceMesh Error: {message}",
            status_code=422,
            error_code="FACEMESH_ERROR",
            details=details,
        )


class NoFaceDetectedError(FaceMeshError):
    """No face detected in frame"""

    def __init__(
        self,
        message: str = "No face detected in the video frame",
        frame_index: Optional[int] = None,
        confidence_threshold: Optional[float] = None
    ):
        details = {}
        if frame_index is not None:
            details["frame_index"] = frame_index
        if confidence_threshold is not None:
            details["confidence_threshold"] = confidence_threshold

        super().__init__(
            message=message,
            details=details,
        )
        self.error_code = "NO_FACE_DETECTED"


class LandmarkExtractionError(FaceMeshError):
    """Failed to extract required landmarks"""

    def __init__(
        self,
        message: str = "Failed to extract facial landmarks",
        missing_landmarks: Optional[list] = None,
        landmark_count: Optional[int] = None
    ):
        details = {}
        if missing_landmarks:
            details["missing_landmarks"] = missing_landmarks
        if landmark_count is not None:
            details["landmark_count"] = landmark_count

        super().__init__(
            message=message,
            details=details,
        )
        self.error_code = "LANDMARK_EXTRACTION_ERROR"


# =============================================================================
# Gaze Estimation Errors (422 - Unprocessable Entity)
# =============================================================================

class GazeEstimationError(EyeTrackingError):
    """Error in gaze estimation"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=f"Gaze Estimation Error: {message}",
            status_code=422,
            error_code="GAZE_ESTIMATION_ERROR",
            details=details,
        )


class InvalidGazeVectorError(GazeEstimationError):
    """Invalid gaze vector calculated"""

    def __init__(
        self,
        message: str = "Calculated gaze vector is invalid",
        gaze_vector: Optional[tuple] = None,
        reason: Optional[str] = None
    ):
        details = {}
        if gaze_vector:
            details["gaze_vector"] = gaze_vector
        if reason:
            details["reason"] = reason

        super().__init__(
            message=message,
            details=details,
        )
        self.error_code = "INVALID_GAZE_VECTOR"


# =============================================================================
# Calibration Errors (422 - Unprocessable Entity)
# =============================================================================

class CalibrationError(EyeTrackingError):
    """Error in gaze calibration"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=f"Calibration Error: {message}",
            status_code=422,
            error_code="CALIBRATION_ERROR",
            details=details,
        )


class InsufficientCalibrationPointsError(CalibrationError):
    """Not enough calibration points provided"""

    def __init__(
        self,
        message: str = "Insufficient calibration points",
        points_provided: Optional[int] = None,
        points_required: Optional[int] = None
    ):
        details = {}
        if points_provided is not None:
            details["points_provided"] = points_provided
        if points_required is not None:
            details["points_required"] = points_required

        super().__init__(
            message=message,
            details=details,
        )
        self.error_code = "INSUFFICIENT_CALIBRATION_POINTS"


# =============================================================================
# Processing Errors (500 - Internal Server Error)
# =============================================================================

class KalmanFilterError(EyeTrackingError):
    """Error in Kalman filtering"""

    def __init__(
        self,
        message: str,
        filter_state: Optional[str] = None
    ):
        details = {}
        if filter_state:
            details["filter_state"] = filter_state

        super().__init__(
            message=f"Kalman Filter Error: {message}",
            status_code=500,
            error_code="KALMAN_FILTER_ERROR",
            details=details,
        )


class PatternRecognitionError(EyeTrackingError):
    """Error in pattern recognition"""

    def __init__(
        self,
        message: str,
        pattern_type: Optional[str] = None
    ):
        details = {}
        if pattern_type:
            details["pattern_type"] = pattern_type

        super().__init__(
            message=f"Pattern Recognition Error: {message}",
            status_code=500,
            error_code="PATTERN_RECOGNITION_ERROR",
            details=details,
        )


class AnomalyDetectionError(EyeTrackingError):
    """Error in anomaly detection"""

    def __init__(
        self,
        message: str,
        anomaly_type: Optional[str] = None,
        sequence_length: Optional[int] = None
    ):
        details = {}
        if anomaly_type:
            details["anomaly_type"] = anomaly_type
        if sequence_length is not None:
            details["sequence_length"] = sequence_length

        super().__init__(
            message=f"Anomaly Detection Error: {message}",
            status_code=500,
            error_code="ANOMALY_DETECTION_ERROR",
            details=details,
        )


# =============================================================================
# Model Errors (503 - Service Unavailable)
# =============================================================================

class ModelLoadError(EyeTrackingError):
    """Failed to load ML model"""

    def __init__(
        self,
        message: str,
        model_name: Optional[str] = None,
        model_path: Optional[str] = None
    ):
        details = {}
        if model_name:
            details["model_name"] = model_name
        if model_path:
            details["model_path"] = model_path

        super().__init__(
            message=f"Model Load Error: {message}",
            status_code=503,
            error_code="MODEL_LOAD_ERROR",
            details=details,
        )


# =============================================================================
# Frame Processing Errors (422/400)
# =============================================================================

class FrameProcessingError(EyeTrackingError):
    """Error processing video frame"""

    def __init__(
        self,
        message: str,
        frame_index: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        frame_details = details or {}
        if frame_index is not None:
            frame_details["frame_index"] = frame_index

        super().__init__(
            message=f"Frame Processing Error: {message}",
            status_code=422,
            error_code="FRAME_PROCESSING_ERROR",
            details=frame_details,
        )


class InvalidFrameError(FrameProcessingError):
    """Invalid frame format or data"""

    def __init__(
        self,
        message: str = "Invalid frame format or data",
        expected_format: Optional[str] = None,
        received_format: Optional[str] = None,
        frame_shape: Optional[tuple] = None
    ):
        details = {}
        if expected_format:
            details["expected_format"] = expected_format
        if received_format:
            details["received_format"] = received_format
        if frame_shape:
            details["frame_shape"] = frame_shape

        super().__init__(
            message=message,
            details=details,
        )
        self.status_code = 400
        self.error_code = "INVALID_FRAME"


# =============================================================================
# Resource Errors (404 - Not Found)
# =============================================================================

class SessionNotFoundError(EyeTrackingError):
    """Gaze session not found"""

    def __init__(
        self,
        session_id: str,
        message: Optional[str] = None
    ):
        super().__init__(
            message=message or f"Gaze session not found: {session_id}",
            status_code=404,
            error_code="SESSION_NOT_FOUND",
            details={"session_id": session_id},
        )


# =============================================================================
# Database Errors (500 - Internal Server Error)
# =============================================================================

class DatabaseError(EyeTrackingError):
    """Database operation error"""

    def __init__(
        self,
        message: str,
        operation: Optional[str] = None,
        table: Optional[str] = None
    ):
        details = {}
        if operation:
            details["operation"] = operation
        if table:
            details["table"] = table

        super().__init__(
            message=f"Database Error: {message}",
            status_code=500,
            error_code="DATABASE_ERROR",
            details=details,
        )


# =============================================================================
# Output Errors (500 - Internal Server Error)
# =============================================================================

class HeatmapGenerationError(EyeTrackingError):
    """Error generating heatmap"""

    def __init__(
        self,
        message: str,
        resolution: Optional[tuple] = None,
        gaze_point_count: Optional[int] = None
    ):
        details = {}
        if resolution:
            details["resolution"] = resolution
        if gaze_point_count is not None:
            details["gaze_point_count"] = gaze_point_count

        super().__init__(
            message=f"Heatmap Generation Error: {message}",
            status_code=500,
            error_code="HEATMAP_GENERATION_ERROR",
            details=details,
        )


# =============================================================================
# Configuration Errors (500 - Internal Server Error)
# =============================================================================

class ConfigurationError(EyeTrackingError):
    """Invalid configuration"""

    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        config_value: Optional[Any] = None
    ):
        details = {}
        if config_key:
            details["config_key"] = config_key
        if config_value is not None:
            details["config_value"] = str(config_value)

        super().__init__(
            message=f"Configuration Error: {message}",
            status_code=500,
            error_code="CONFIGURATION_ERROR",
            details=details,
        )


# =============================================================================
# Validation Errors (400 - Bad Request)
# =============================================================================

class ValidationError(EyeTrackingError):
    """Request validation error"""

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        value: Optional[Any] = None,
        constraint: Optional[str] = None
    ):
        details = {}
        if field:
            details["field"] = field
        if value is not None:
            details["value"] = str(value)
        if constraint:
            details["constraint"] = constraint

        super().__init__(
            message=message,
            status_code=400,
            error_code="VALIDATION_ERROR",
            details=details,
        )


# =============================================================================
# Rate Limiting Errors (429 - Too Many Requests)
# =============================================================================

class RateLimitError(EyeTrackingError):
    """Rate limit exceeded"""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        limit: Optional[int] = None,
        reset_time: Optional[int] = None
    ):
        details = {}
        if limit is not None:
            details["limit"] = limit
        if reset_time is not None:
            details["reset_time"] = reset_time

        super().__init__(
            message=message,
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            details=details,
        )


# =============================================================================
# WebSocket Errors (Various)
# =============================================================================

class WebSocketError(EyeTrackingError):
    """WebSocket communication error"""

    def __init__(
        self,
        message: str,
        connection_id: Optional[str] = None,
        reason: Optional[str] = None
    ):
        details = {}
        if connection_id:
            details["connection_id"] = connection_id
        if reason:
            details["reason"] = reason

        super().__init__(
            message=f"WebSocket Error: {message}",
            status_code=500,
            error_code="WEBSOCKET_ERROR",
            details=details,
        )


class ConnectionClosedError(WebSocketError):
    """WebSocket connection closed unexpectedly"""

    def __init__(
        self,
        message: str = "Connection closed unexpectedly",
        close_code: Optional[int] = None,
        close_reason: Optional[str] = None
    ):
        details = {}
        if close_code is not None:
            details["close_code"] = close_code
        if close_reason:
            details["close_reason"] = close_reason

        super().__init__(
            message=message,
            reason=close_reason,
        )
        self.error_code = "CONNECTION_CLOSED"
