"""
Kalman Filter for Gaze Position Smoothing
Reduces noise and jitter in gaze estimates
"""

import numpy as np
from filterpy.kalman import KalmanFilter
from typing import Tuple
import structlog

from src.config import settings
from lib.errors import KalmanFilterError

logger = structlog.get_logger(__name__)


class GazeKalmanFilter:
    """
    Kalman filter for 2D gaze position smoothing
    Uses constant velocity model
    """

    def __init__(self, dt: float = None):
        """
        Initialize Kalman filter

        Args:
            dt: Time step in seconds (default from settings)
        """
        self.dt = dt or settings.KALMAN_DT

        # Initialize Kalman filter
        # State: [x, y, vx, vy] (position and velocity)
        # Measurement: [x, y] (position only)
        self.kf = KalmanFilter(dim_x=4, dim_z=2)

        # State transition matrix (constant velocity model)
        self.kf.F = np.array([
            [1, 0, self.dt, 0],
            [0, 1, 0, self.dt],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ])

        # Measurement function (observe x, y only)
        self.kf.H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0]
        ])

        # Process noise covariance
        q = settings.KALMAN_PROCESS_NOISE
        self.kf.Q = np.array([
            [q, 0, 0, 0],
            [0, q, 0, 0],
            [0, 0, q, 0],
            [0, 0, 0, q]
        ])

        # Measurement noise covariance
        r = settings.KALMAN_MEASUREMENT_NOISE
        self.kf.R = np.array([
            [r, 0],
            [0, r]
        ])

        # Initial state covariance
        self.kf.P *= 10

        # Initial state
        self.kf.x = np.array([0.5, 0.5, 0, 0])  # Start at screen center

        self.initialized = False
        self.measurement_count = 0

        logger.info(
            "kalman_filter_initialized",
            dt=self.dt,
            process_noise=q,
            measurement_noise=r
        )

    def update(self, measurement: Tuple[float, float], confidence: float = 1.0) -> Tuple[float, float]:
        """
        Update filter with new gaze measurement

        Args:
            measurement: (x, y) gaze coordinates (0-1 range)
            confidence: Measurement confidence (0-1), affects measurement noise

        Returns:
            Filtered (x, y) coordinates

        Raises:
            KalmanFilterError: If update fails
        """
        try:
            x, y = measurement

            # Validate input
            if not (0 <= x <= 1 and 0 <= y <= 1):
                logger.warning("invalid_gaze_measurement", x=x, y=y)
                # Clamp to valid range
                x = np.clip(x, 0, 1)
                y = np.clip(y, 0, 1)

            # Initialize filter with first measurement
            if not self.initialized:
                self.kf.x = np.array([x, y, 0, 0])
                self.initialized = True
                self.measurement_count += 1
                return x, y

            # Adjust measurement noise based on confidence
            # Lower confidence = higher noise
            r_adjusted = settings.KALMAN_MEASUREMENT_NOISE / max(confidence, 0.1)
            self.kf.R = np.array([
                [r_adjusted, 0],
                [0, r_adjusted]
            ])

            # Predict
            self.kf.predict()

            # Update with measurement
            z = np.array([x, y])
            self.kf.update(z)

            # Extract filtered position
            filtered_x = float(self.kf.x[0])
            filtered_y = float(self.kf.x[1])

            # Clamp to valid range
            filtered_x = np.clip(filtered_x, 0, 1)
            filtered_y = np.clip(filtered_y, 0, 1)

            self.measurement_count += 1

            return filtered_x, filtered_y

        except Exception as e:
            logger.error("kalman_filter_update_error", error=str(e))
            raise KalmanFilterError(f"Kalman filter update failed: {e}")

    def predict(self) -> Tuple[float, float]:
        """
        Predict next gaze position without measurement
        Useful for handling missed frames

        Returns:
            Predicted (x, y) coordinates
        """
        try:
            self.kf.predict()
            predicted_x = float(self.kf.x[0])
            predicted_y = float(self.kf.x[1])

            # Clamp to valid range
            predicted_x = np.clip(predicted_x, 0, 1)
            predicted_y = np.clip(predicted_y, 0, 1)

            return predicted_x, predicted_y

        except Exception as e:
            logger.error("kalman_filter_predict_error", error=str(e))
            raise KalmanFilterError(f"Kalman filter prediction failed: {e}")

    def get_velocity(self) -> Tuple[float, float]:
        """
        Get current estimated velocity

        Returns:
            (vx, vy) velocity in units per second
        """
        return float(self.kf.x[2]), float(self.kf.x[3])

    def get_state(self) -> np.ndarray:
        """Get full filter state"""
        return self.kf.x.copy()

    def reset(self):
        """Reset filter to initial state"""
        self.kf.x = np.array([0.5, 0.5, 0, 0])
        self.kf.P *= 10
        self.initialized = False
        self.measurement_count = 0
        logger.info("kalman_filter_reset")


class DualKalmanFilter:
    """
    Separate Kalman filters for left and right eye
    Provides independent smoothing and fusion
    """

    def __init__(self, dt: float = None):
        """Initialize dual filters"""
        self.left_filter = GazeKalmanFilter(dt)
        self.right_filter = GazeKalmanFilter(dt)
        self.fusion_weight_left = 0.5
        self.fusion_weight_right = 0.5

    def update(
        self,
        left_measurement: Tuple[float, float],
        right_measurement: Tuple[float, float],
        left_confidence: float = 1.0,
        right_confidence: float = 1.0
    ) -> Tuple[float, float]:
        """
        Update both filters and fuse results

        Args:
            left_measurement: Left eye gaze (x, y)
            right_measurement: Right eye gaze (x, y)
            left_confidence: Left eye confidence
            right_confidence: Right eye confidence

        Returns:
            Fused (x, y) coordinates
        """
        # Update individual filters
        left_filtered = self.left_filter.update(left_measurement, left_confidence)
        right_filtered = self.right_filter.update(right_measurement, right_confidence)

        # Adjust fusion weights based on confidence
        total_confidence = left_confidence + right_confidence
        if total_confidence > 0:
            self.fusion_weight_left = left_confidence / total_confidence
            self.fusion_weight_right = right_confidence / total_confidence
        else:
            self.fusion_weight_left = 0.5
            self.fusion_weight_right = 0.5

        # Fuse results
        fused_x = (
            self.fusion_weight_left * left_filtered[0] +
            self.fusion_weight_right * right_filtered[0]
        )
        fused_y = (
            self.fusion_weight_left * left_filtered[1] +
            self.fusion_weight_right * right_filtered[1]
        )

        return fused_x, fused_y

    def reset(self):
        """Reset both filters"""
        self.left_filter.reset()
        self.right_filter.reset()
        self.fusion_weight_left = 0.5
        self.fusion_weight_right = 0.5
