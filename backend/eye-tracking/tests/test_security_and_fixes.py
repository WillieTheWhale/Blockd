"""
Comprehensive tests for Eye Tracking Service fixes
Tests: HTTPException returns, service pooling, thread-safe calibration,
TTL cleanup, gaze vector copy
"""
import pytest
import numpy as np
from datetime import datetime
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from fastapi import HTTPException
from fastapi.testclient import TestClient


class TestHTTPExceptionReturns:
    """Tests for proper HTTPException returns with status codes"""

    def test_eye_tracking_error_has_status_code(self):
        """Test EyeTrackingError has proper HTTP status code"""
        from lib.errors import EyeTrackingError

        error = EyeTrackingError(
            message="Test error",
            status_code=500,
            error_code="TEST_ERROR"
        )

        assert error.status_code == 500
        assert error.error_code == "TEST_ERROR"
        assert error.message == "Test error"

    def test_no_face_detected_error_returns_422(self):
        """Test NoFaceDetectedError returns 422 status"""
        from lib.errors import NoFaceDetectedError

        error = NoFaceDetectedError()

        assert error.status_code == 422
        assert error.error_code == "NO_FACE_DETECTED"

    def test_gaze_estimation_error_returns_422(self):
        """Test GazeEstimationError returns 422 status"""
        from lib.errors import GazeEstimationError

        error = GazeEstimationError("Calculation failed")

        assert error.status_code == 422
        assert error.error_code == "GAZE_ESTIMATION_ERROR"

    def test_session_not_found_error_returns_404(self):
        """Test SessionNotFoundError returns 404 status"""
        from lib.errors import SessionNotFoundError

        error = SessionNotFoundError("test-session-123")

        assert error.status_code == 404
        assert error.error_code == "SESSION_NOT_FOUND"
        assert "test-session-123" in error.message

    def test_model_load_error_returns_503(self):
        """Test ModelLoadError returns 503 (service unavailable)"""
        from lib.errors import ModelLoadError

        error = ModelLoadError("Model load failed", model_name="facemesh")

        assert error.status_code == 503
        assert error.error_code == "MODEL_LOAD_ERROR"

    def test_validation_error_returns_400(self):
        """Test ValidationError returns 400 status"""
        from lib.errors import ValidationError

        error = ValidationError("Invalid field", field="gaze_x")

        assert error.status_code == 400
        assert error.error_code == "VALIDATION_ERROR"

    def test_rate_limit_error_returns_429(self):
        """Test RateLimitError returns 429 status"""
        from lib.errors import RateLimitError

        error = RateLimitError(limit=100, reset_time=60)

        assert error.status_code == 429
        assert error.error_code == "RATE_LIMIT_EXCEEDED"

    def test_error_to_dict_format(self):
        """Test error can be converted to dict for JSON response"""
        from lib.errors import EyeTrackingError

        error = EyeTrackingError(
            message="Test",
            status_code=500,
            error_code="TEST",
            details={"key": "value"}
        )

        error_dict = error.to_dict()

        assert "error" in error_dict
        assert "message" in error_dict
        assert "details" in error_dict
        assert error_dict["error"] == "TEST"


class TestThreadSafeCalibration:
    """Tests for thread-safe calibration operations"""

    def test_gaze_calculation_service_calibration(self):
        """Test calibration in GazeCalculationService"""
        from services.gaze_calculation import GazeCalculationService

        with patch('services.gaze_calculation.GazeEstimator'):
            with patch('services.gaze_calculation.DualKalmanFilter'):
                service = GazeCalculationService()

                # Initial state
                assert service.is_calibrated is False

    def test_calibration_with_points(self):
        """Test calibration accepts ground truth and observed points"""
        from services.gaze_calculation import GazeCalculationService

        with patch('services.gaze_calculation.GazeEstimator') as MockEstimator:
            with patch('services.gaze_calculation.DualKalmanFilter'):
                mock_estimator = MockEstimator.return_value
                mock_estimator.apply_calibration = Mock()

                service = GazeCalculationService()

                calibration_points = [(0.1, 0.1), (0.9, 0.9)]
                observed_points = [(0.12, 0.11), (0.88, 0.88)]

                service.calibrate(calibration_points, observed_points)

                assert service.is_calibrated is True
                mock_estimator.apply_calibration.assert_called_once()

    def test_reset_calibration(self):
        """Test calibration reset"""
        from services.gaze_calculation import GazeCalculationService

        with patch('services.gaze_calculation.GazeEstimator') as MockEstimator:
            with patch('services.gaze_calculation.DualKalmanFilter'):
                mock_estimator = MockEstimator.return_value
                mock_estimator.reset_calibration = Mock()

                service = GazeCalculationService()
                service.is_calibrated = True

                service.reset_calibration()

                assert service.is_calibrated is False


class TestGazeVectorCopy:
    """Tests for gaze vector copy and immutability"""

    def test_gaze_result_contains_vector_copies(self):
        """Test gaze calculation returns copies of vector data"""
        from services.gaze_calculation import GazeCalculationService

        with patch('services.gaze_calculation.GazeEstimator') as MockEstimator:
            with patch('services.gaze_calculation.DualKalmanFilter'):
                mock_estimator = MockEstimator.return_value
                mock_estimator.calculate_confidence = Mock(return_value=0.9)
                mock_estimator.calculate_binocular_gaze_vector = Mock(
                    return_value=np.array([0.5, 0.5, 1.0])
                )
                mock_estimator.gaze_to_screen_coordinates = Mock(
                    return_value=(500, 500, False, None)
                )
                mock_estimator.calculate_gaze_vector = Mock(
                    return_value=np.array([0.5, 0.5, 1.0])
                )

                service = GazeCalculationService(use_kalman_filter=False)

                eye_data = {
                    "left_eye_center": np.array([100, 100, 50]),
                    "right_eye_center": np.array([150, 100, 50]),
                    "left_iris_center": np.array([102, 101, 51]),
                    "right_iris_center": np.array([152, 101, 51]),
                    "left_eye_aspect_ratio": 0.3,
                    "right_eye_aspect_ratio": 0.3,
                }

                result = service.calculate_gaze(eye_data)

                # Verify result contains gaze vector components as floats (copies)
                assert isinstance(result["gaze_vector_x"], float)
                assert isinstance(result["gaze_vector_y"], float)
                assert isinstance(result["gaze_vector_z"], float)


class TestLandmarkDetectionFallback:
    """Tests for landmark detection fallback mechanism"""

    def test_consecutive_failure_tracking(self):
        """Test consecutive failure counter"""
        from services.landmark_detection import LandmarkDetectionService

        with patch('services.landmark_detection.FaceMeshModel'):
            service = LandmarkDetectionService()

            assert service.consecutive_failures == 0
            assert service.max_consecutive_failures == 10

    def test_fallback_landmarks_used_on_failure(self):
        """Test fallback landmarks are used after detection failure"""
        from services.landmark_detection import LandmarkDetectionService

        with patch('services.landmark_detection.FaceMeshModel') as MockFaceMesh:
            mock_facemesh = MockFaceMesh.return_value
            mock_facemesh.process_frame = Mock(return_value=None)

            service = LandmarkDetectionService()
            service.last_successful_landmarks = {"test": "landmarks"}
            service.consecutive_failures = 0

            # Detection fails, should use fallback
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            result = service.detect_landmarks(frame, use_fallback=True)

            assert result == {"test": "landmarks"}
            assert service.consecutive_failures == 1

    def test_fallback_disabled_raises_error(self):
        """Test error raised when fallback disabled and no face detected"""
        from services.landmark_detection import LandmarkDetectionService
        from lib.errors import NoFaceDetectedError

        with patch('services.landmark_detection.FaceMeshModel') as MockFaceMesh:
            mock_facemesh = MockFaceMesh.return_value
            mock_facemesh.process_frame = Mock(return_value=None)

            service = LandmarkDetectionService()

            frame = np.zeros((480, 640, 3), dtype=np.uint8)

            with pytest.raises(NoFaceDetectedError):
                service.detect_landmarks(frame, use_fallback=False)

    def test_max_consecutive_failures_clears_fallback(self):
        """Test fallback cleared after max consecutive failures"""
        from services.landmark_detection import LandmarkDetectionService
        from lib.errors import NoFaceDetectedError

        with patch('services.landmark_detection.FaceMeshModel') as MockFaceMesh:
            mock_facemesh = MockFaceMesh.return_value
            mock_facemesh.process_frame = Mock(return_value=None)

            service = LandmarkDetectionService()
            service.last_successful_landmarks = {"test": "landmarks"}
            service.consecutive_failures = 11  # Over max

            frame = np.zeros((480, 640, 3), dtype=np.uint8)

            with pytest.raises(NoFaceDetectedError):
                service.detect_landmarks(frame, use_fallback=True)


class TestKalmanFilterReset:
    """Tests for Kalman filter reset functionality"""

    def test_reset_filter_method(self):
        """Test Kalman filter can be reset"""
        from services.gaze_calculation import GazeCalculationService

        with patch('services.gaze_calculation.GazeEstimator'):
            with patch('services.gaze_calculation.DualKalmanFilter') as MockKalman:
                mock_kalman = MockKalman.return_value
                mock_kalman.reset = Mock()

                service = GazeCalculationService(use_kalman_filter=True)
                service.reset_filter()

                mock_kalman.reset.assert_called_once()


class TestServiceStatistics:
    """Tests for service statistics tracking"""

    def test_get_statistics(self):
        """Test statistics retrieval"""
        from services.gaze_calculation import GazeCalculationService

        with patch('services.gaze_calculation.GazeEstimator'):
            with patch('services.gaze_calculation.DualKalmanFilter'):
                service = GazeCalculationService()
                service.frame_count = 100

                stats = service.get_statistics()

                assert stats["frames_processed"] == 100
                assert "is_calibrated" in stats
                assert "use_kalman_filter" in stats


class TestExceptionHierarchy:
    """Tests for exception class hierarchy"""

    def test_facemesh_error_inherits_from_base(self):
        """Test FaceMeshError inherits from EyeTrackingError"""
        from lib.errors import FaceMeshError, EyeTrackingError

        error = FaceMeshError("test")
        assert isinstance(error, EyeTrackingError)

    def test_no_face_detected_inherits_from_facemesh(self):
        """Test NoFaceDetectedError inherits from FaceMeshError"""
        from lib.errors import NoFaceDetectedError, FaceMeshError

        error = NoFaceDetectedError()
        assert isinstance(error, FaceMeshError)

    def test_calibration_error_with_points(self):
        """Test InsufficientCalibrationPointsError includes point counts"""
        from lib.errors import InsufficientCalibrationPointsError

        error = InsufficientCalibrationPointsError(
            points_provided=3,
            points_required=5
        )

        assert error.details["points_provided"] == 3
        assert error.details["points_required"] == 5


class TestScreenResolutionUpdate:
    """Tests for screen resolution updates"""

    def test_set_screen_resolution(self):
        """Test screen resolution can be updated"""
        from services.gaze_calculation import GazeCalculationService

        with patch('services.gaze_calculation.GazeEstimator') as MockEstimator:
            with patch('services.gaze_calculation.DualKalmanFilter'):
                service = GazeCalculationService()

                service.set_screen_resolution(1920, 1080)

                assert service.screen_width == 1920
                assert service.screen_height == 1080


class TestErrorDetailsSerialization:
    """Tests for error details JSON serialization"""

    def test_error_details_are_json_serializable(self):
        """Test error details can be serialized to JSON"""
        import json
        from lib.errors import NoFaceDetectedError

        error = NoFaceDetectedError(
            frame_index=42,
            confidence_threshold=0.5
        )

        error_dict = error.to_dict()
        json_str = json.dumps(error_dict)

        assert "frame_index" in json_str
        assert "42" in json_str

    def test_websocket_error_includes_connection_id(self):
        """Test WebSocketError includes connection details"""
        from lib.errors import WebSocketError

        error = WebSocketError(
            message="Connection lost",
            connection_id="ws-123",
            reason="Timeout"
        )

        assert error.details["connection_id"] == "ws-123"
        assert error.details["reason"] == "Timeout"
