"""
Custom Exceptions for Eye Tracking Service
"""


class EyeTrackingError(Exception):
    """Base exception for eye tracking service"""
    pass


class FaceMeshError(EyeTrackingError):
    """Error in MediaPipe FaceMesh processing"""
    pass


class NoFaceDetectedError(FaceMeshError):
    """No face detected in frame"""
    pass


class LandmarkExtractionError(FaceMeshError):
    """Failed to extract required landmarks"""
    pass


class GazeEstimationError(EyeTrackingError):
    """Error in gaze estimation"""
    pass


class InvalidGazeVectorError(GazeEstimationError):
    """Invalid gaze vector calculated"""
    pass


class CalibrationError(EyeTrackingError):
    """Error in gaze calibration"""
    pass


class InsufficientCalibrationPointsError(CalibrationError):
    """Not enough calibration points provided"""
    pass


class KalmanFilterError(EyeTrackingError):
    """Error in Kalman filtering"""
    pass


class PatternRecognitionError(EyeTrackingError):
    """Error in pattern recognition"""
    pass


class AnomalyDetectionError(EyeTrackingError):
    """Error in anomaly detection"""
    pass


class ModelLoadError(EyeTrackingError):
    """Failed to load ML model"""
    pass


class FrameProcessingError(EyeTrackingError):
    """Error processing video frame"""
    pass


class InvalidFrameError(FrameProcessingError):
    """Invalid frame format or data"""
    pass


class SessionNotFoundError(EyeTrackingError):
    """Gaze session not found"""
    pass


class DatabaseError(EyeTrackingError):
    """Database operation error"""
    pass


class HeatmapGenerationError(EyeTrackingError):
    """Error generating heatmap"""
    pass


class ConfigurationError(EyeTrackingError):
    """Invalid configuration"""
    pass
