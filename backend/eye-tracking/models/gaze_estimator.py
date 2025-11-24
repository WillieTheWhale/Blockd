"""
Custom Gaze Estimation Model
Converts eye landmarks and iris position to screen coordinates
"""

import numpy as np
from typing import Tuple, Dict, Optional
import structlog

from ..src.config import settings
from ..lib.errors import GazeEstimationError, InvalidGazeVectorError

logger = structlog.get_logger(__name__)


class GazeEstimator:
    """
    Gaze estimation using geometric eye model
    Calculates 3D gaze vector and projects to screen coordinates
    """

    def __init__(
        self,
        screen_width: int = None,
        screen_height: int = None,
        focal_length: float = None
    ):
        """
        Initialize gaze estimator

        Args:
            screen_width: Screen width in pixels
            screen_height: Screen height in pixels
            focal_length: Camera focal length in pixels
        """
        self.screen_width = screen_width or settings.GAZE_FRAME_WIDTH
        self.screen_height = screen_height or settings.GAZE_FRAME_HEIGHT
        self.focal_length = focal_length or settings.GAZE_FOCAL_LENGTH

        # Camera center (assume centered)
        self.camera_center = np.array([
            self.screen_width / 2,
            self.screen_height / 2
        ])

        # Calibration offset (adjusted through calibration)
        self.calibration_offset_x = 0.0
        self.calibration_offset_y = 0.0
        self.calibration_scale_x = 1.0
        self.calibration_scale_y = 1.0

        logger.info(
            "gaze_estimator_initialized",
            screen_width=self.screen_width,
            screen_height=self.screen_height,
            focal_length=self.focal_length
        )

    def calculate_gaze_vector(
        self,
        eye_center: np.ndarray,
        iris_center: np.ndarray
    ) -> np.ndarray:
        """
        Calculate 3D gaze vector from eye and iris positions

        Args:
            eye_center: 3D position of eye center [x, y, z]
            iris_center: 3D position of iris center [x, y, z]

        Returns:
            Normalized 3D gaze vector

        Raises:
            InvalidGazeVectorError: If vector calculation fails
        """
        try:
            # Gaze vector points from eye center to iris center
            gaze_vector = iris_center - eye_center

            # Normalize
            magnitude = np.linalg.norm(gaze_vector)
            if magnitude < 1e-6:
                raise InvalidGazeVectorError("Gaze vector magnitude too small")

            gaze_vector = gaze_vector / magnitude

            return gaze_vector

        except Exception as e:
            logger.error("gaze_vector_calculation_error", error=str(e))
            raise InvalidGazeVectorError(f"Failed to calculate gaze vector: {e}")

    def calculate_binocular_gaze_vector(
        self,
        left_eye_center: np.ndarray,
        left_iris_center: np.ndarray,
        right_eye_center: np.ndarray,
        right_iris_center: np.ndarray,
        left_confidence: float = 1.0,
        right_confidence: float = 1.0
    ) -> np.ndarray:
        """
        Calculate fused gaze vector from both eyes

        Args:
            left_eye_center: Left eye center position
            left_iris_center: Left iris center position
            right_eye_center: Right eye center position
            right_iris_center: Right iris center position
            left_confidence: Left eye confidence
            right_confidence: Right eye confidence

        Returns:
            Fused normalized gaze vector
        """
        # Calculate individual gaze vectors
        left_gaze = self.calculate_gaze_vector(left_eye_center, left_iris_center)
        right_gaze = self.calculate_gaze_vector(right_eye_center, right_iris_center)

        # Weight by confidence
        total_confidence = left_confidence + right_confidence
        if total_confidence > 0:
            weight_left = left_confidence / total_confidence
            weight_right = right_confidence / total_confidence
        else:
            weight_left = 0.5
            weight_right = 0.5

        # Fuse vectors
        fused_gaze = weight_left * left_gaze + weight_right * right_gaze

        # Renormalize
        magnitude = np.linalg.norm(fused_gaze)
        if magnitude > 1e-6:
            fused_gaze = fused_gaze / magnitude

        return fused_gaze

    def gaze_to_screen_coordinates(
        self,
        gaze_vector: np.ndarray,
        head_pose: Optional[Dict[str, float]] = None
    ) -> Tuple[float, float, bool, Optional[str]]:
        """
        Convert 3D gaze vector to 2D screen coordinates

        Args:
            gaze_vector: Normalized 3D gaze vector [x, y, z]
            head_pose: Optional head pose {pitch, yaw, roll} in degrees

        Returns:
            Tuple of (screen_x, screen_y, is_off_screen, off_screen_direction)
            - screen_x, screen_y: normalized coordinates (0-1)
            - is_off_screen: boolean
            - off_screen_direction: 'left', 'right', 'up', 'down', or None

        Raises:
            GazeEstimationError: If conversion fails
        """
        try:
            # Apply head pose correction if available
            if head_pose:
                gaze_vector = self._apply_head_pose_correction(gaze_vector, head_pose)

            # Project to 2D screen using pinhole camera model
            # Avoid division by zero
            if abs(gaze_vector[2]) < 1e-6:
                gaze_vector[2] = 1e-6

            # Screen coordinates (centered at camera center)
            screen_x_px = (gaze_vector[0] / gaze_vector[2]) * self.focal_length
            screen_y_px = (gaze_vector[1] / gaze_vector[2]) * self.focal_length

            # Convert to screen space
            screen_x_px += self.camera_center[0]
            screen_y_px += self.camera_center[1]

            # Normalize to 0-1 range
            screen_x = screen_x_px / self.screen_width
            screen_y = screen_y_px / self.screen_height

            # Apply calibration
            screen_x = (screen_x - 0.5) * self.calibration_scale_x + 0.5 + self.calibration_offset_x
            screen_y = (screen_y - 0.5) * self.calibration_scale_y + 0.5 + self.calibration_offset_y

            # Determine if off-screen and direction
            is_off_screen = not (0 <= screen_x <= 1 and 0 <= screen_y <= 1)
            off_screen_direction = None

            if is_off_screen:
                off_screen_direction = self._determine_off_screen_direction(
                    screen_x, screen_y
                )

            # Clamp to valid range for on-screen display
            screen_x_clamped = np.clip(screen_x, 0, 1)
            screen_y_clamped = np.clip(screen_y, 0, 1)

            return (
                float(screen_x_clamped),
                float(screen_y_clamped),
                is_off_screen,
                off_screen_direction
            )

        except Exception as e:
            logger.error("screen_coordinate_conversion_error", error=str(e))
            raise GazeEstimationError(f"Failed to convert to screen coordinates: {e}")

    def _apply_head_pose_correction(
        self,
        gaze_vector: np.ndarray,
        head_pose: Dict[str, float]
    ) -> np.ndarray:
        """
        Apply head pose rotation to gaze vector

        Args:
            gaze_vector: 3D gaze vector
            head_pose: {pitch, yaw, roll} in degrees

        Returns:
            Corrected gaze vector
        """
        # Convert angles to radians
        pitch = np.radians(head_pose['pitch'])
        yaw = np.radians(head_pose['yaw'])
        roll = np.radians(head_pose['roll'])

        # Rotation matrices
        R_pitch = np.array([
            [1, 0, 0],
            [0, np.cos(pitch), -np.sin(pitch)],
            [0, np.sin(pitch), np.cos(pitch)]
        ])

        R_yaw = np.array([
            [np.cos(yaw), 0, np.sin(yaw)],
            [0, 1, 0],
            [-np.sin(yaw), 0, np.cos(yaw)]
        ])

        R_roll = np.array([
            [np.cos(roll), -np.sin(roll), 0],
            [np.sin(roll), np.cos(roll), 0],
            [0, 0, 1]
        ])

        # Combined rotation matrix
        R = R_yaw @ R_pitch @ R_roll

        # Apply rotation
        corrected_vector = R @ gaze_vector

        # Renormalize
        magnitude = np.linalg.norm(corrected_vector)
        if magnitude > 1e-6:
            corrected_vector = corrected_vector / magnitude

        return corrected_vector

    def _determine_off_screen_direction(
        self,
        screen_x: float,
        screen_y: float
    ) -> str:
        """
        Determine which direction the gaze is off-screen

        Args:
            screen_x: X coordinate (may be outside 0-1)
            screen_y: Y coordinate (may be outside 0-1)

        Returns:
            Direction string: 'left', 'right', 'up', 'down'
        """
        # Determine primary direction (largest deviation)
        dx_left = max(0, -screen_x)
        dx_right = max(0, screen_x - 1)
        dy_up = max(0, -screen_y)
        dy_down = max(0, screen_y - 1)

        deviations = {
            'left': dx_left,
            'right': dx_right,
            'up': dy_up,
            'down': dy_down
        }

        return max(deviations, key=deviations.get)

    def apply_calibration(
        self,
        calibration_points: list,
        observed_points: list
    ):
        """
        Apply calibration using known reference points

        Args:
            calibration_points: List of (x, y) ground truth points
            observed_points: List of (x, y) observed gaze points

        Raises:
            GazeEstimationError: If calibration fails
        """
        try:
            if len(calibration_points) != len(observed_points):
                raise GazeEstimationError("Mismatched calibration points")

            if len(calibration_points) < 4:
                raise GazeEstimationError("Need at least 4 calibration points")

            # Convert to numpy arrays
            cal_pts = np.array(calibration_points)
            obs_pts = np.array(observed_points)

            # Calculate offset and scale using least squares
            # Model: observed = scale * calibrated + offset

            # Calculate means
            cal_mean = np.mean(cal_pts, axis=0)
            obs_mean = np.mean(obs_pts, axis=0)

            # Calculate scale
            cal_centered = cal_pts - cal_mean
            obs_centered = obs_pts - obs_mean

            scale_x = np.sum(cal_centered[:, 0] * obs_centered[:, 0]) / np.sum(obs_centered[:, 0] ** 2)
            scale_y = np.sum(cal_centered[:, 1] * obs_centered[:, 1]) / np.sum(obs_centered[:, 1] ** 2)

            # Calculate offset
            offset_x = cal_mean[0] - scale_x * obs_mean[0]
            offset_y = cal_mean[1] - scale_y * obs_mean[1]

            # Store calibration parameters
            self.calibration_scale_x = scale_x
            self.calibration_scale_y = scale_y
            self.calibration_offset_x = offset_x
            self.calibration_offset_y = offset_y

            logger.info(
                "calibration_applied",
                scale_x=scale_x,
                scale_y=scale_y,
                offset_x=offset_x,
                offset_y=offset_y
            )

        except Exception as e:
            logger.error("calibration_error", error=str(e))
            raise GazeEstimationError(f"Calibration failed: {e}")

    def reset_calibration(self):
        """Reset calibration to default"""
        self.calibration_offset_x = 0.0
        self.calibration_offset_y = 0.0
        self.calibration_scale_x = 1.0
        self.calibration_scale_y = 1.0
        logger.info("calibration_reset")

    def calculate_confidence(
        self,
        eye_aspect_ratio: float,
        landmark_visibility: float = 1.0
    ) -> float:
        """
        Calculate gaze estimation confidence

        Args:
            eye_aspect_ratio: EAR value (lower means eye more closed)
            landmark_visibility: Visibility score of landmarks (0-1)

        Returns:
            Confidence score (0-1)
        """
        # Base confidence from landmark visibility
        confidence = landmark_visibility

        # Reduce confidence if eye is too closed (blinking or partially closed)
        # Typical EAR: open eye ~0.3, closed eye ~0.1
        if eye_aspect_ratio < 0.15:
            confidence *= 0.2  # Likely blinking
        elif eye_aspect_ratio < 0.2:
            confidence *= 0.5  # Partially closed

        return float(np.clip(confidence, 0, 1))
