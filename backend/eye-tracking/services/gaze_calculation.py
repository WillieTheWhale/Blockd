"""
Gaze Calculation Service
Converts landmarks to gaze coordinates
"""

import numpy as np
from typing import Dict, Tuple, Optional
import structlog

from ..models.gaze_estimator import GazeEstimator
from ..models.kalman_filter import DualKalmanFilter
from ..lib.errors import GazeEstimationError
from ..src.config import settings

logger = structlog.get_logger(__name__)


class GazeCalculationService:
    """
    Service for calculating gaze coordinates from eye landmarks
    """

    def __init__(
        self,
        screen_width: int = None,
        screen_height: int = None,
        use_kalman_filter: bool = True
    ):
        """
        Initialize gaze calculation service

        Args:
            screen_width: Screen width in pixels
            screen_height: Screen height in pixels
            use_kalman_filter: Enable Kalman filtering for smoothing
        """
        self.screen_width = screen_width or settings.GAZE_FRAME_WIDTH
        self.screen_height = screen_height or settings.GAZE_FRAME_HEIGHT
        self.use_kalman_filter = use_kalman_filter

        # Initialize gaze estimator
        self.gaze_estimator = GazeEstimator(
            screen_width=self.screen_width,
            screen_height=self.screen_height
        )

        # Initialize Kalman filter (for both eyes)
        if self.use_kalman_filter:
            self.kalman_filter = DualKalmanFilter()
        else:
            self.kalman_filter = None

        # State tracking
        self.is_calibrated = False
        self.frame_count = 0

        logger.info(
            "gaze_calculation_service_initialized",
            screen_width=self.screen_width,
            screen_height=self.screen_height,
            use_kalman=self.use_kalman_filter
        )

    def calculate_gaze(
        self,
        eye_data: Dict,
        head_pose: Optional[Dict[str, float]] = None
    ) -> Dict:
        """
        Calculate gaze coordinates from eye data

        Args:
            eye_data: Dictionary with eye centers and iris centers
            head_pose: Optional head pose {pitch, yaw, roll}

        Returns:
            Dictionary with gaze information

        Raises:
            GazeEstimationError: If calculation fails
        """
        try:
            # Extract data
            left_eye_center = eye_data["left_eye_center"]
            right_eye_center = eye_data["right_eye_center"]
            left_iris_center = eye_data["left_iris_center"]
            right_iris_center = eye_data["right_iris_center"]
            left_ear = eye_data["left_eye_aspect_ratio"]
            right_ear = eye_data["right_eye_aspect_ratio"]

            # Calculate confidence for each eye
            left_confidence = self.gaze_estimator.calculate_confidence(left_ear)
            right_confidence = self.gaze_estimator.calculate_confidence(right_ear)

            # Calculate binocular gaze vector
            gaze_vector = self.gaze_estimator.calculate_binocular_gaze_vector(
                left_eye_center=left_eye_center,
                left_iris_center=left_iris_center,
                right_eye_center=right_eye_center,
                right_iris_center=right_iris_center,
                left_confidence=left_confidence,
                right_confidence=right_confidence
            )

            # Convert to screen coordinates
            screen_x, screen_y, is_off_screen, off_screen_direction = \
                self.gaze_estimator.gaze_to_screen_coordinates(
                    gaze_vector=gaze_vector,
                    head_pose=head_pose
                )

            # Store raw coordinates (before filtering)
            raw_x, raw_y = screen_x, screen_y

            # Apply Kalman filtering
            if self.use_kalman_filter and self.kalman_filter is not None:
                # Calculate individual eye gaze for filtering
                left_gaze_vector = self.gaze_estimator.calculate_gaze_vector(
                    left_eye_center, left_iris_center
                )
                right_gaze_vector = self.gaze_estimator.calculate_gaze_vector(
                    right_eye_center, right_iris_center
                )

                left_screen = self.gaze_estimator.gaze_to_screen_coordinates(
                    left_gaze_vector, head_pose
                )
                right_screen = self.gaze_estimator.gaze_to_screen_coordinates(
                    right_gaze_vector, head_pose
                )

                # Filter
                screen_x, screen_y = self.kalman_filter.update(
                    left_measurement=(left_screen[0], left_screen[1]),
                    right_measurement=(right_screen[0], right_screen[1]),
                    left_confidence=left_confidence,
                    right_confidence=right_confidence
                )

            # Calculate overall confidence
            overall_confidence = (left_confidence + right_confidence) / 2

            # Increment frame count
            self.frame_count += 1

            return {
                "gaze_x": float(screen_x),
                "gaze_y": float(screen_y),
                "raw_gaze_x": float(raw_x),
                "raw_gaze_y": float(raw_y),
                "is_off_screen": is_off_screen,
                "off_screen_direction": off_screen_direction,
                "confidence": float(overall_confidence),
                "gaze_vector_x": float(gaze_vector[0]),
                "gaze_vector_y": float(gaze_vector[1]),
                "gaze_vector_z": float(gaze_vector[2]),
                "left_confidence": float(left_confidence),
                "right_confidence": float(right_confidence),
                "is_filtered": self.use_kalman_filter
            }

        except Exception as e:
            logger.error("gaze_calculation_error", error=str(e))
            raise GazeEstimationError(f"Gaze calculation failed: {e}")

    def calibrate(
        self,
        calibration_points: list,
        observed_points: list
    ):
        """
        Perform gaze calibration

        Args:
            calibration_points: List of (x, y) ground truth points
            observed_points: List of (x, y) observed gaze points

        Raises:
            GazeEstimationError: If calibration fails
        """
        try:
            self.gaze_estimator.apply_calibration(
                calibration_points=calibration_points,
                observed_points=observed_points
            )

            self.is_calibrated = True

            logger.info(
                "gaze_calibration_completed",
                num_points=len(calibration_points)
            )

        except Exception as e:
            logger.error("calibration_error", error=str(e))
            raise GazeEstimationError(f"Calibration failed: {e}")

    def reset_calibration(self):
        """Reset calibration to default"""
        self.gaze_estimator.reset_calibration()
        self.is_calibrated = False
        logger.info("calibration_reset")

    def reset_filter(self):
        """Reset Kalman filter state"""
        if self.kalman_filter is not None:
            self.kalman_filter.reset()
            logger.info("kalman_filter_reset")

    def set_screen_resolution(self, width: int, height: int):
        """
        Update screen resolution

        Args:
            width: Screen width in pixels
            height: Screen height in pixels
        """
        self.screen_width = width
        self.screen_height = height

        self.gaze_estimator = GazeEstimator(
            screen_width=width,
            screen_height=height
        )

        logger.info(
            "screen_resolution_updated",
            width=width,
            height=height
        )

    def get_statistics(self) -> Dict:
        """
        Get service statistics

        Returns:
            Dictionary with statistics
        """
        return {
            "frames_processed": self.frame_count,
            "is_calibrated": self.is_calibrated,
            "use_kalman_filter": self.use_kalman_filter,
            "screen_width": self.screen_width,
            "screen_height": self.screen_height
        }
