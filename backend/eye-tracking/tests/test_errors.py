"""
Tests for Eye Tracking Error Classes.

Tests the custom exception hierarchy with HTTP status codes and error codes.
"""
import pytest
from lib.errors import (
    EyeTrackingError,
    FaceMeshError,
    NoFaceDetectedError,
    LandmarkExtractionError,
    GazeEstimationError,
    InvalidGazeVectorError,
    CalibrationError,
    InsufficientCalibrationPointsError,
    KalmanFilterError,
    PatternRecognitionError,
    AnomalyDetectionError,
    ModelLoadError,
    FrameProcessingError,
    InvalidFrameError,
    SessionNotFoundError,
    DatabaseError,
    HeatmapGenerationError,
    ConfigurationError,
    ValidationError,
    RateLimitError,
    WebSocketError,
    ConnectionClosedError,
)


class TestEyeTrackingError:
    """Tests for base EyeTrackingError class"""

    def test_basic_error(self):
        """Test basic error creation"""
        error = EyeTrackingError("Test error message")

        assert error.message == "Test error message"
        assert error.status_code == 500  # Default
        assert error.error_code == "EYE_TRACKING_ERROR"
        assert error.details == {}

    def test_error_with_custom_status(self):
        """Test error with custom status code"""
        error = EyeTrackingError(
            message="Custom error",
            status_code=400,
            error_code="CUSTOM_ERROR"
        )

        assert error.status_code == 400
        assert error.error_code == "CUSTOM_ERROR"

    def test_error_with_details(self):
        """Test error with additional details"""
        error = EyeTrackingError(
            message="Error with details",
            details={"key": "value", "count": 42}
        )

        assert error.details == {"key": "value", "count": 42}

    def test_to_dict(self):
        """Test error to_dict method"""
        error = EyeTrackingError(
            message="Test message",
            status_code=422,
            error_code="TEST_ERROR",
            details={"field": "test"}
        )

        result = error.to_dict()

        assert result == {
            "error": "TEST_ERROR",
            "message": "Test message",
            "details": {"field": "test"}
        }

    def test_error_string_representation(self):
        """Test error string representation"""
        error = EyeTrackingError("Error message")
        assert str(error) == "Error message"


class TestFaceMeshErrors:
    """Tests for FaceMesh-related errors"""

    def test_facemesh_error(self):
        """Test FaceMeshError"""
        error = FaceMeshError("Processing failed")

        assert "FaceMesh Error" in error.message
        assert error.status_code == 422
        assert error.error_code == "FACEMESH_ERROR"

    def test_no_face_detected_error_default(self):
        """Test NoFaceDetectedError with defaults"""
        error = NoFaceDetectedError()

        assert "No face detected" in error.message
        assert error.status_code == 422
        assert error.error_code == "NO_FACE_DETECTED"

    def test_no_face_detected_error_with_frame_index(self):
        """Test NoFaceDetectedError with frame index"""
        error = NoFaceDetectedError(
            message="No face in frame",
            frame_index=42,
            confidence_threshold=0.8
        )

        assert error.details["frame_index"] == 42
        assert error.details["confidence_threshold"] == 0.8

    def test_landmark_extraction_error(self):
        """Test LandmarkExtractionError"""
        error = LandmarkExtractionError(
            message="Missing landmarks",
            missing_landmarks=["left_eye", "right_eye"],
            landmark_count=450
        )

        assert error.error_code == "LANDMARK_EXTRACTION_ERROR"
        assert error.details["missing_landmarks"] == ["left_eye", "right_eye"]
        assert error.details["landmark_count"] == 450


class TestGazeEstimationErrors:
    """Tests for gaze estimation errors"""

    def test_gaze_estimation_error(self):
        """Test GazeEstimationError"""
        error = GazeEstimationError("Estimation failed")

        assert error.status_code == 422
        assert error.error_code == "GAZE_ESTIMATION_ERROR"

    def test_invalid_gaze_vector_error(self):
        """Test InvalidGazeVectorError"""
        error = InvalidGazeVectorError(
            gaze_vector=(float('nan'), 0.5, 0.3),
            reason="NaN value in vector"
        )

        assert error.error_code == "INVALID_GAZE_VECTOR"
        assert error.details["reason"] == "NaN value in vector"


class TestCalibrationErrors:
    """Tests for calibration errors"""

    def test_calibration_error(self):
        """Test CalibrationError"""
        error = CalibrationError("Calibration failed")

        assert error.status_code == 422
        assert error.error_code == "CALIBRATION_ERROR"

    def test_insufficient_calibration_points(self):
        """Test InsufficientCalibrationPointsError"""
        error = InsufficientCalibrationPointsError(
            points_provided=3,
            points_required=9
        )

        assert error.error_code == "INSUFFICIENT_CALIBRATION_POINTS"
        assert error.details["points_provided"] == 3
        assert error.details["points_required"] == 9


class TestProcessingErrors:
    """Tests for processing errors (500 status code)"""

    def test_kalman_filter_error(self):
        """Test KalmanFilterError"""
        error = KalmanFilterError(
            message="Filter diverged",
            filter_state="diverged"
        )

        assert error.status_code == 500
        assert error.error_code == "KALMAN_FILTER_ERROR"
        assert error.details["filter_state"] == "diverged"

    def test_pattern_recognition_error(self):
        """Test PatternRecognitionError"""
        error = PatternRecognitionError(
            message="Pattern matching failed",
            pattern_type="reading"
        )

        assert error.status_code == 500
        assert error.error_code == "PATTERN_RECOGNITION_ERROR"
        assert error.details["pattern_type"] == "reading"

    def test_anomaly_detection_error(self):
        """Test AnomalyDetectionError"""
        error = AnomalyDetectionError(
            message="LSTM inference failed",
            anomaly_type="lstm",
            sequence_length=100
        )

        assert error.status_code == 500
        assert error.error_code == "ANOMALY_DETECTION_ERROR"
        assert error.details["anomaly_type"] == "lstm"
        assert error.details["sequence_length"] == 100


class TestModelErrors:
    """Tests for model loading errors (503 status code)"""

    def test_model_load_error(self):
        """Test ModelLoadError"""
        error = ModelLoadError(
            message="Failed to load LSTM model",
            model_name="lstm_anomaly_detector",
            model_path="/models/lstm_v1.h5"
        )

        assert error.status_code == 503
        assert error.error_code == "MODEL_LOAD_ERROR"
        assert error.details["model_name"] == "lstm_anomaly_detector"
        assert error.details["model_path"] == "/models/lstm_v1.h5"


class TestFrameProcessingErrors:
    """Tests for frame processing errors"""

    def test_frame_processing_error(self):
        """Test FrameProcessingError"""
        error = FrameProcessingError(
            message="Frame decode failed",
            frame_index=100
        )

        assert error.status_code == 422
        assert error.error_code == "FRAME_PROCESSING_ERROR"
        assert error.details["frame_index"] == 100

    def test_invalid_frame_error(self):
        """Test InvalidFrameError"""
        error = InvalidFrameError(
            expected_format="RGB888",
            received_format="JPEG",
            frame_shape=(480, 640, 3)
        )

        assert error.status_code == 400
        assert error.error_code == "INVALID_FRAME"
        assert error.details["expected_format"] == "RGB888"
        assert error.details["received_format"] == "JPEG"
        assert error.details["frame_shape"] == (480, 640, 3)


class TestResourceErrors:
    """Tests for resource errors (404 status code)"""

    def test_session_not_found_error(self):
        """Test SessionNotFoundError"""
        error = SessionNotFoundError(session_id="abc-123-def")

        assert error.status_code == 404
        assert error.error_code == "SESSION_NOT_FOUND"
        assert error.details["session_id"] == "abc-123-def"
        assert "abc-123-def" in error.message

    def test_session_not_found_custom_message(self):
        """Test SessionNotFoundError with custom message"""
        error = SessionNotFoundError(
            session_id="xyz-789",
            message="Session expired"
        )

        assert error.message == "Session expired"


class TestDatabaseErrors:
    """Tests for database errors"""

    def test_database_error(self):
        """Test DatabaseError"""
        error = DatabaseError(
            message="Connection timeout",
            operation="insert",
            table="gaze_events"
        )

        assert error.status_code == 500
        assert error.error_code == "DATABASE_ERROR"
        assert error.details["operation"] == "insert"
        assert error.details["table"] == "gaze_events"


class TestOutputErrors:
    """Tests for output generation errors"""

    def test_heatmap_generation_error(self):
        """Test HeatmapGenerationError"""
        error = HeatmapGenerationError(
            message="Insufficient data points",
            resolution=(1920, 1080),
            gaze_point_count=5
        )

        assert error.status_code == 500
        assert error.error_code == "HEATMAP_GENERATION_ERROR"
        assert error.details["resolution"] == (1920, 1080)
        assert error.details["gaze_point_count"] == 5


class TestConfigurationErrors:
    """Tests for configuration errors"""

    def test_configuration_error(self):
        """Test ConfigurationError"""
        error = ConfigurationError(
            message="Invalid threshold value",
            config_key="CONFIDENCE_THRESHOLD",
            config_value=1.5
        )

        assert error.status_code == 500
        assert error.error_code == "CONFIGURATION_ERROR"
        assert error.details["config_key"] == "CONFIDENCE_THRESHOLD"
        assert error.details["config_value"] == "1.5"


class TestValidationErrors:
    """Tests for validation errors (400 status code)"""

    def test_validation_error(self):
        """Test ValidationError"""
        error = ValidationError(
            message="Invalid gaze coordinates",
            field="gaze_x",
            value=-0.5,
            constraint="must be between 0 and 1"
        )

        assert error.status_code == 400
        assert error.error_code == "VALIDATION_ERROR"
        assert error.details["field"] == "gaze_x"
        assert error.details["constraint"] == "must be between 0 and 1"


class TestRateLimitErrors:
    """Tests for rate limit errors (429 status code)"""

    def test_rate_limit_error_default(self):
        """Test RateLimitError with defaults"""
        error = RateLimitError()

        assert error.status_code == 429
        assert error.error_code == "RATE_LIMIT_EXCEEDED"
        assert "Rate limit exceeded" in error.message

    def test_rate_limit_error_with_details(self):
        """Test RateLimitError with limit and reset time"""
        error = RateLimitError(
            message="Too many requests",
            limit=100,
            reset_time=60
        )

        assert error.details["limit"] == 100
        assert error.details["reset_time"] == 60


class TestWebSocketErrors:
    """Tests for WebSocket errors"""

    def test_websocket_error(self):
        """Test WebSocketError"""
        error = WebSocketError(
            message="Connection failed",
            connection_id="ws-123",
            reason="timeout"
        )

        assert error.status_code == 500
        assert error.error_code == "WEBSOCKET_ERROR"
        assert error.details["connection_id"] == "ws-123"
        assert error.details["reason"] == "timeout"

    def test_connection_closed_error(self):
        """Test ConnectionClosedError"""
        error = ConnectionClosedError(
            close_code=1006,
            close_reason="Abnormal closure"
        )

        assert error.error_code == "CONNECTION_CLOSED"
        assert error.details["close_code"] == 1006
        assert error.details["close_reason"] == "Abnormal closure"


class TestHTTPStatusCodeMapping:
    """Tests to verify correct HTTP status code mappings"""

    @pytest.mark.parametrize("error_class,expected_status", [
        (EyeTrackingError, 500),
        (FaceMeshError, 422),
        (NoFaceDetectedError, 422),
        (GazeEstimationError, 422),
        (CalibrationError, 422),
        (KalmanFilterError, 500),
        (PatternRecognitionError, 500),
        (AnomalyDetectionError, 500),
        (ModelLoadError, 503),
        (FrameProcessingError, 422),
        (InvalidFrameError, 400),
        (SessionNotFoundError, 404),
        (DatabaseError, 500),
        (HeatmapGenerationError, 500),
        (ConfigurationError, 500),
        (ValidationError, 400),
        (RateLimitError, 429),
        (WebSocketError, 500),
    ])
    def test_status_code_mapping(self, error_class, expected_status):
        """Test that each error class has correct status code"""
        # Create minimal error instance
        if error_class == SessionNotFoundError:
            error = error_class(session_id="test")
        else:
            error = error_class("Test message")

        assert error.status_code == expected_status
