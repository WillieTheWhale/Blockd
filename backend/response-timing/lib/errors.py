"""Custom exception classes for Response Timing Service"""

from typing import Dict, Optional


class TimingServiceError(Exception):
    """Base exception for timing service errors"""

    def __init__(
        self,
        message: str,
        details: Optional[Dict] = None,
        status_code: int = 500,
        error_code: str = "TIMING_SERVICE_ERROR"
    ):
        self.message = message
        self.details = details or {}
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(self.message)


class TranscriptionError(TimingServiceError):
    """Error during audio transcription"""

    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            message=message,
            details=details,
            status_code=422,
            error_code="TRANSCRIPTION_ERROR"
        )


class AudioProcessingError(TimingServiceError):
    """Error during audio processing"""

    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            message=message,
            details=details,
            status_code=422,
            error_code="AUDIO_PROCESSING_ERROR"
        )


class TimingAnalysisError(TimingServiceError):
    """Error during timing analysis"""

    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            message=message,
            details=details,
            status_code=422,
            error_code="TIMING_ANALYSIS_ERROR"
        )


class PauseDetectionError(TimingServiceError):
    """Error during pause detection"""

    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            message=message,
            details=details,
            status_code=422,
            error_code="PAUSE_DETECTION_ERROR"
        )


class FillerDetectionError(TimingServiceError):
    """Error during filler word detection"""

    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            message=message,
            details=details,
            status_code=422,
            error_code="FILLER_DETECTION_ERROR"
        )


class AnomalyDetectionError(TimingServiceError):
    """Error during anomaly detection"""

    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            message=message,
            details=details,
            status_code=422,
            error_code="ANOMALY_DETECTION_ERROR"
        )


class AudioDownloadError(TimingServiceError):
    """Error downloading audio from S3"""

    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            message=message,
            details=details,
            status_code=500,
            error_code="AUDIO_DOWNLOAD_ERROR"
        )
