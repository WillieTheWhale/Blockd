"""
Main Gaze Processing Service
Orchestrates landmark detection, gaze calculation, and pattern recognition
"""

import cv2
import numpy as np
import base64
from typing import Dict, Optional
from datetime import datetime
import structlog

from ..services.landmark_detection import LandmarkDetectionService
from ..services.gaze_calculation import GazeCalculationService
from ..services.pattern_recognition import PatternRecognitionService, GazePoint
from ..services.anomaly_detection import AnomalyDetectionService
from ..lib.errors import FrameProcessingError, InvalidFrameError
from ..src.config import settings

logger = structlog.get_logger(__name__)


class GazeProcessingService:
    """
    Main service for processing video frames and extracting gaze data
    """

    def __init__(
        self,
        screen_width: int = None,
        screen_height: int = None,
        use_kalman_filter: bool = True
    ):
        """
        Initialize gaze processing service

        Args:
            screen_width: Screen width in pixels
            screen_height: Screen height in pixels
            use_kalman_filter: Enable Kalman filtering
        """
        # Initialize sub-services
        self.landmark_service = LandmarkDetectionService()
        self.gaze_service = GazeCalculationService(
            screen_width=screen_width,
            screen_height=screen_height,
            use_kalman_filter=use_kalman_filter
        )
        self.pattern_service = PatternRecognitionService()
        self.anomaly_service = AnomalyDetectionService()

        # Processing statistics
        self.frames_processed = 0
        self.frames_failed = 0
        self.total_processing_time = 0.0

        logger.info(
            "gaze_processing_service_initialized",
            screen_width=screen_width,
            screen_height=screen_height,
            kalman_enabled=use_kalman_filter
        )

    def process_frame(
        self,
        frame: np.ndarray,
        timestamp: Optional[datetime] = None,
        detect_anomalies: bool = True
    ) -> Dict:
        """
        Process a single video frame and extract gaze data

        Args:
            frame: BGR image from OpenCV
            timestamp: Frame timestamp (defaults to now)
            detect_anomalies: Whether to check for anomalies

        Returns:
            Dictionary with gaze data and metadata

        Raises:
            FrameProcessingError: If processing fails
        """
        start_time = datetime.now()
        timestamp = timestamp or datetime.now()

        try:
            # Detect landmarks
            landmarks = self.landmark_service.detect_landmarks(
                frame=frame,
                use_fallback=True
            )

            if landmarks is None:
                self.frames_failed += 1
                raise FrameProcessingError("No face detected")

            # Extract eye data
            eye_data = self.landmark_service.get_eye_centers_and_iris(landmarks)

            # Estimate head pose
            head_pose = self.landmark_service.estimate_head_pose(
                landmarks=landmarks,
                frame_shape=frame.shape[:2]
            )

            # Calculate gaze
            gaze_data = self.gaze_service.calculate_gaze(
                eye_data=eye_data,
                head_pose=head_pose
            )

            # Add head pose to result
            gaze_data.update({
                "head_pitch": head_pose["pitch"],
                "head_yaw": head_pose["yaw"],
                "head_roll": head_pose["roll"]
            })

            # Check for anomalies
            anomaly = None
            if detect_anomalies:
                anomaly = self.anomaly_service.add_gaze_point(
                    x=gaze_data["gaze_x"],
                    y=gaze_data["gaze_y"],
                    timestamp=timestamp,
                    check_anomaly=True
                )

            # Update statistics
            self.frames_processed += 1
            processing_time = (datetime.now() - start_time).total_seconds()
            self.total_processing_time += processing_time

            result = {
                **gaze_data,
                "timestamp": timestamp.isoformat(),
                "frame_number": self.frames_processed,
                "processing_time_ms": processing_time * 1000,
                "has_anomaly": anomaly is not None
            }

            if anomaly:
                result["anomaly"] = anomaly

            logger.debug(
                "frame_processed",
                frame_number=self.frames_processed,
                processing_time_ms=processing_time * 1000,
                gaze_x=gaze_data["gaze_x"],
                gaze_y=gaze_data["gaze_y"]
            )

            return result

        except FrameProcessingError:
            raise
        except Exception as e:
            self.frames_failed += 1
            logger.error("frame_processing_error", error=str(e))
            raise FrameProcessingError(f"Frame processing failed: {e}")

    def process_base64_frame(
        self,
        base64_frame: str,
        timestamp: Optional[datetime] = None,
        detect_anomalies: bool = True
    ) -> Dict:
        """
        Process base64-encoded video frame

        Args:
            base64_frame: Base64-encoded image data
            timestamp: Frame timestamp
            detect_anomalies: Whether to check for anomalies

        Returns:
            Dictionary with gaze data

        Raises:
            InvalidFrameError: If frame decoding fails
            FrameProcessingError: If processing fails
        """
        try:
            # Decode base64
            frame_data = base64.b64decode(base64_frame)

            # Convert to numpy array
            nparr = np.frombuffer(frame_data, np.uint8)

            # Decode image
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                raise InvalidFrameError("Failed to decode frame")

            # Process frame
            return self.process_frame(
                frame=frame,
                timestamp=timestamp,
                detect_anomalies=detect_anomalies
            )

        except InvalidFrameError:
            raise
        except Exception as e:
            logger.error("base64_frame_processing_error", error=str(e))
            raise InvalidFrameError(f"Base64 frame processing failed: {e}")

    def calibrate_gaze(
        self,
        calibration_points: list,
        observed_points: list
    ):
        """
        Calibrate gaze estimation

        Args:
            calibration_points: Ground truth calibration points
            observed_points: Observed gaze points
        """
        self.gaze_service.calibrate(
            calibration_points=calibration_points,
            observed_points=observed_points
        )

        logger.info("gaze_calibration_applied")

    def reset_calibration(self):
        """Reset gaze calibration"""
        self.gaze_service.reset_calibration()
        logger.info("gaze_calibration_reset")

    def reset_filters(self):
        """Reset all filters"""
        self.gaze_service.reset_filter()
        self.landmark_service.reset_fallback()
        self.anomaly_service.reset()
        logger.info("filters_reset")

    def get_statistics(self) -> Dict:
        """
        Get processing statistics

        Returns:
            Dictionary with statistics
        """
        avg_processing_time = (
            self.total_processing_time / self.frames_processed
            if self.frames_processed > 0 else 0
        )

        return {
            "frames_processed": self.frames_processed,
            "frames_failed": self.frames_failed,
            "success_rate": (
                self.frames_processed / (self.frames_processed + self.frames_failed)
                if (self.frames_processed + self.frames_failed) > 0 else 0
            ),
            "avg_processing_time_ms": avg_processing_time * 1000,
            "fps": 1.0 / avg_processing_time if avg_processing_time > 0 else 0,
            "gaze_service_stats": self.gaze_service.get_statistics()
        }
