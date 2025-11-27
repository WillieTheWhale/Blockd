"""
Test Suite for Gaze Calculation
"""

import pytest
import numpy as np
from datetime import datetime

from ..services.gaze_calculation import GazeCalculationService
from ..models.gaze_estimator import GazeEstimator
from ..models.kalman_filter import GazeKalmanFilter
from ..lib.errors import GazeEstimationError


class TestGazeEstimator:
    """Test cases for GazeEstimator"""

    def setup_method(self):
        """Setup test fixtures"""
        self.estimator = GazeEstimator(
            screen_width=1920,
            screen_height=1080
        )

    def test_calculate_gaze_vector(self):
        """Test gaze vector calculation"""
        eye_center = np.array([100, 100, 50])
        iris_center = np.array([102, 101, 51])

        gaze_vector = self.estimator.calculate_gaze_vector(
            eye_center=eye_center,
            iris_center=iris_center
        )

        # Check vector is normalized
        magnitude = np.linalg.norm(gaze_vector)
        assert abs(magnitude - 1.0) < 0.001, "Gaze vector should be normalized"

        # Check direction is roughly correct
        assert gaze_vector[0] > 0, "X component should be positive"
        assert gaze_vector[1] > 0, "Y component should be positive"

    def test_calculate_binocular_gaze_vector(self):
        """Test binocular gaze vector calculation"""
        left_eye_center = np.array([100, 100, 50])
        left_iris_center = np.array([102, 101, 51])
        right_eye_center = np.array([150, 100, 50])
        right_iris_center = np.array([152, 101, 51])

        gaze_vector = self.estimator.calculate_binocular_gaze_vector(
            left_eye_center=left_eye_center,
            left_iris_center=left_iris_center,
            right_eye_center=right_eye_center,
            right_iris_center=right_iris_center
        )

        # Check vector is normalized
        magnitude = np.linalg.norm(gaze_vector)
        assert abs(magnitude - 1.0) < 0.001

    def test_gaze_to_screen_coordinates(self):
        """Test screen coordinate conversion"""
        # Forward-looking gaze (should be near center)
        gaze_vector = np.array([0, 0, 1])

        screen_x, screen_y, is_off_screen, direction = \
            self.estimator.gaze_to_screen_coordinates(gaze_vector)

        # Should be near center
        assert 0.4 < screen_x < 0.6, f"Expected center X, got {screen_x}"
        assert 0.4 < screen_y < 0.6, f"Expected center Y, got {screen_y}"
        assert not is_off_screen, "Forward gaze should be on-screen"
        assert direction is None, "On-screen gaze should have no direction"

    def test_off_screen_detection(self):
        """Test off-screen gaze detection"""
        # Far left gaze
        gaze_vector = np.array([-1, 0, 0.5])

        screen_x, screen_y, is_off_screen, direction = \
            self.estimator.gaze_to_screen_coordinates(gaze_vector)

        assert is_off_screen, "Far left gaze should be off-screen"
        assert direction == "left", f"Expected 'left', got {direction}"

    def test_calibration(self):
        """Test gaze calibration"""
        # Simulated calibration data (4 corners)
        ground_truth = [
            (0.1, 0.1),  # Top-left
            (0.9, 0.1),  # Top-right
            (0.1, 0.9),  # Bottom-left
            (0.9, 0.9)   # Bottom-right
        ]

        # Simulated observed points (with systematic error)
        observed = [
            (0.12, 0.11),
            (0.88, 0.12),
            (0.11, 0.89),
            (0.87, 0.88)
        ]

        # Apply calibration
        self.estimator.apply_calibration(ground_truth, observed)

        # Check calibration parameters were updated
        assert self.estimator.calibration_scale_x != 1.0
        assert self.estimator.calibration_scale_y != 1.0

    def test_confidence_calculation(self):
        """Test confidence score calculation"""
        # Open eye
        confidence = self.estimator.calculate_confidence(
            eye_aspect_ratio=0.3,
            landmark_visibility=1.0
        )
        assert confidence > 0.9, "Open eye should have high confidence"

        # Partially closed eye
        confidence = self.estimator.calculate_confidence(
            eye_aspect_ratio=0.18,
            landmark_visibility=1.0
        )
        assert 0.4 < confidence < 0.6, "Partially closed eye should have medium confidence"

        # Closed eye (blinking)
        confidence = self.estimator.calculate_confidence(
            eye_aspect_ratio=0.12,
            landmark_visibility=1.0
        )
        assert confidence < 0.3, "Closed eye should have low confidence"


class TestKalmanFilter:
    """Test cases for Kalman filter"""

    def setup_method(self):
        """Setup test fixtures"""
        self.filter = GazeKalmanFilter(dt=0.033)

    def test_initialization(self):
        """Test filter initialization"""
        assert self.filter.kf.x[0] == 0.5, "Initial X should be 0.5 (center)"
        assert self.filter.kf.x[1] == 0.5, "Initial Y should be 0.5 (center)"
        assert not self.filter.initialized, "Filter should not be initialized"

    def test_update(self):
        """Test filter update"""
        # First measurement
        filtered_x, filtered_y = self.filter.update((0.6, 0.4), confidence=1.0)

        assert self.filter.initialized, "Filter should be initialized after first update"
        assert filtered_x == 0.6, "First measurement should pass through"
        assert filtered_y == 0.4, "First measurement should pass through"

        # Second measurement (should be smoothed)
        filtered_x2, filtered_y2 = self.filter.update((0.65, 0.45), confidence=1.0)

        # Filtered values should be between previous and new measurement
        assert 0.6 <= filtered_x2 <= 0.65
        assert 0.4 <= filtered_y2 <= 0.45

    def test_noise_reduction(self):
        """Test noise reduction"""
        # Generate noisy measurements around (0.5, 0.5)
        np.random.seed(42)
        true_position = (0.5, 0.5)
        noise_level = 0.02

        measurements = []
        filtered = []

        for _ in range(20):
            noisy_x = true_position[0] + np.random.normal(0, noise_level)
            noisy_y = true_position[1] + np.random.normal(0, noise_level)

            fx, fy = self.filter.update((noisy_x, noisy_y), confidence=1.0)

            measurements.append((noisy_x, noisy_y))
            filtered.append((fx, fy))

        # Calculate variance of measurements vs filtered
        meas_var = np.var([m[0] for m in measurements])
        filt_var = np.var([f[0] for f in filtered[5:]])  # Skip first few for convergence

        # Filtered should have lower variance
        assert filt_var < meas_var, "Filtered data should have lower variance"

    def test_predict(self):
        """Test prediction without measurement"""
        # Initialize with measurements
        self.filter.update((0.5, 0.5), confidence=1.0)
        self.filter.update((0.52, 0.51), confidence=1.0)

        # Predict next position
        pred_x, pred_y = self.filter.predict()

        # Prediction should be reasonable
        assert 0.5 <= pred_x <= 0.6
        assert 0.5 <= pred_y <= 0.6

    def test_confidence_weighting(self):
        """Test measurement noise adjustment based on confidence"""
        # High confidence measurement
        self.filter.update((0.5, 0.5), confidence=1.0)
        self.filter.update((0.6, 0.6), confidence=1.0)

        # Low confidence measurement (should have less influence)
        fx1, fy1 = self.filter.update((0.4, 0.4), confidence=0.2)

        # Should be closer to previous position than low-confidence measurement
        assert fx1 > 0.5, "Low confidence measurement should have reduced influence"


class TestGazeCalculationService:
    """Test cases for GazeCalculationService"""

    def setup_method(self):
        """Setup test fixtures"""
        self.service = GazeCalculationService(
            screen_width=1920,
            screen_height=1080,
            use_kalman_filter=True
        )

    def test_calculate_gaze(self):
        """Test full gaze calculation pipeline"""
        # Mock eye data
        eye_data = {
            "left_eye_center": np.array([100, 100, 50]),
            "right_eye_center": np.array([150, 100, 50]),
            "left_iris_center": np.array([102, 101, 51]),
            "right_iris_center": np.array([152, 101, 51]),
            "left_eye_aspect_ratio": 0.3,
            "right_eye_aspect_ratio": 0.3
        }

        # Calculate gaze
        result = self.service.calculate_gaze(eye_data)

        # Check result structure
        assert "gaze_x" in result
        assert "gaze_y" in result
        assert "confidence" in result
        assert "is_off_screen" in result

        # Check value ranges
        assert 0 <= result["gaze_x"] <= 1
        assert 0 <= result["gaze_y"] <= 1
        assert 0 <= result["confidence"] <= 1

    def test_calibration_integration(self):
        """Test calibration in full service"""
        ground_truth = [(0.1, 0.1), (0.9, 0.9)]
        observed = [(0.12, 0.11), (0.88, 0.89)]

        self.service.calibrate(ground_truth, observed)

        assert self.service.is_calibrated, "Service should be calibrated"

    def test_statistics(self):
        """Test service statistics"""
        stats = self.service.get_statistics()

        assert "frames_processed" in stats
        assert "is_calibrated" in stats
        assert "use_kalman_filter" in stats


@pytest.mark.performance
class TestPerformance:
    """Performance tests"""

    def test_gaze_calculation_performance(self):
        """Test gaze calculation latency"""
        service = GazeCalculationService()

        eye_data = {
            "left_eye_center": np.array([100, 100, 50]),
            "right_eye_center": np.array([150, 100, 50]),
            "left_iris_center": np.array([102, 101, 51]),
            "right_iris_center": np.array([152, 101, 51]),
            "left_eye_aspect_ratio": 0.3,
            "right_eye_aspect_ratio": 0.3
        }

        import time
        start = time.time()

        for _ in range(100):
            service.calculate_gaze(eye_data)

        elapsed = time.time() - start
        avg_time = elapsed / 100

        # Should be < 5ms per calculation
        assert avg_time < 0.005, f"Average calculation time: {avg_time*1000:.2f}ms (should be <5ms)"

        print(f"\nGaze calculation performance: {avg_time*1000:.2f}ms per frame")
