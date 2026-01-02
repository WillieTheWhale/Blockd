"""
Facial Landmark Detection Service
Wrapper around FaceMesh model with caching and error handling
"""

import cv2
import numpy as np
from typing import Optional, Dict
import structlog

from models.facemesh_model import FaceMeshModel
from lib.errors import NoFaceDetectedError, LandmarkExtractionError
from src.config import settings

logger = structlog.get_logger(__name__)


class LandmarkDetectionService:
    """
    Service for detecting and extracting facial landmarks
    """

    def __init__(self):
        """Initialize landmark detection service"""
        self.facemesh = FaceMeshModel()
        self.last_successful_landmarks = None
        self.consecutive_failures = 0
        self.max_consecutive_failures = 10

        logger.info("landmark_detection_service_initialized")

    def detect_landmarks(
        self,
        frame: np.ndarray,
        use_fallback: bool = True
    ) -> Optional[Dict]:
        """
        Detect facial landmarks in frame

        Args:
            frame: BGR image from OpenCV
            use_fallback: Use last successful landmarks if detection fails

        Returns:
            Dictionary with landmarks and metadata, or None

        Raises:
            NoFaceDetectedError: If no face detected and no fallback
        """
        try:
            # Process frame
            result = self.facemesh.process_frame(frame)

            if result is not None:
                # Success - reset failure counter
                self.consecutive_failures = 0
                self.last_successful_landmarks = result
                return result
            else:
                # No face detected
                self.consecutive_failures += 1

                logger.debug(
                    "no_face_detected",
                    consecutive_failures=self.consecutive_failures
                )

                # Use fallback if enabled and available
                if use_fallback and self.last_successful_landmarks is not None:
                    if self.consecutive_failures <= self.max_consecutive_failures:
                        logger.debug("using_fallback_landmarks")
                        return self.last_successful_landmarks
                    else:
                        logger.warning("max_consecutive_failures_exceeded")
                        self.last_successful_landmarks = None
                        raise NoFaceDetectedError("Too many consecutive detection failures")

                raise NoFaceDetectedError("No face detected in frame")

        except NoFaceDetectedError:
            raise
        except Exception as e:
            logger.error("landmark_detection_error", error=str(e))
            raise LandmarkExtractionError(f"Landmark detection failed: {e}")

    def extract_eye_regions(
        self,
        frame: np.ndarray,
        landmarks: Dict
    ) -> Dict[str, np.ndarray]:
        """
        Extract cropped eye regions from frame

        Args:
            frame: Original frame
            landmarks: Landmark detection results

        Returns:
            Dictionary with left and right eye images
        """
        try:
            landmarks_array = landmarks["landmarks"]
            eye_landmarks = self.facemesh.extract_eye_landmarks(landmarks_array)

            # Get bounding boxes for eyes
            left_bbox = self._get_eye_bounding_box(eye_landmarks["left_eye_outline"])
            right_bbox = self._get_eye_bounding_box(eye_landmarks["right_eye_outline"])

            # Crop eye regions with padding
            padding = 10
            h, w = frame.shape[:2]

            left_x1 = max(0, int(left_bbox[0] - padding))
            left_y1 = max(0, int(left_bbox[1] - padding))
            left_x2 = min(w, int(left_bbox[2] + padding))
            left_y2 = min(h, int(left_bbox[3] + padding))

            right_x1 = max(0, int(right_bbox[0] - padding))
            right_y1 = max(0, int(right_bbox[1] - padding))
            right_x2 = min(w, int(right_bbox[2] + padding))
            right_y2 = min(h, int(right_bbox[3] + padding))

            left_eye_img = frame[left_y1:left_y2, left_x1:left_x2]
            right_eye_img = frame[right_y1:right_y2, right_x1:right_x2]

            return {
                "left_eye": left_eye_img,
                "right_eye": right_eye_img,
                "left_bbox": (left_x1, left_y1, left_x2, left_y2),
                "right_bbox": (right_x1, right_y1, right_x2, right_y2)
            }

        except Exception as e:
            logger.error("eye_region_extraction_error", error=str(e))
            raise LandmarkExtractionError(f"Failed to extract eye regions: {e}")

    def _get_eye_bounding_box(self, eye_landmarks: np.ndarray) -> tuple:
        """
        Calculate bounding box for eye landmarks

        Args:
            eye_landmarks: Eye outline landmarks

        Returns:
            Tuple of (x1, y1, x2, y2)
        """
        x_coords = eye_landmarks[:, 0]
        y_coords = eye_landmarks[:, 1]

        x1 = np.min(x_coords)
        y1 = np.min(y_coords)
        x2 = np.max(x_coords)
        y2 = np.max(y_coords)

        return (x1, y1, x2, y2)

    def get_eye_centers_and_iris(
        self,
        landmarks: Dict
    ) -> Dict:
        """
        Extract eye centers and iris centers from landmarks

        Args:
            landmarks: Landmark detection results

        Returns:
            Dictionary with eye and iris centers

        Raises:
            LandmarkExtractionError: If extraction fails
        """
        try:
            landmarks_array = landmarks["landmarks"]
            eye_landmarks = self.facemesh.extract_eye_landmarks(landmarks_array)

            # Get centers
            left_eye_center, right_eye_center = self.facemesh.get_eye_centers(eye_landmarks)
            left_iris_center, right_iris_center = self.facemesh.get_iris_centers(eye_landmarks)

            # Calculate eye aspect ratios
            left_ear = self.facemesh.calculate_eye_aspect_ratio(
                eye_landmarks["left_eye_outline"]
            )
            right_ear = self.facemesh.calculate_eye_aspect_ratio(
                eye_landmarks["right_eye_outline"]
            )

            return {
                "left_eye_center": left_eye_center,
                "right_eye_center": right_eye_center,
                "left_iris_center": left_iris_center,
                "right_iris_center": right_iris_center,
                "left_eye_aspect_ratio": left_ear,
                "right_eye_aspect_ratio": right_ear
            }

        except Exception as e:
            logger.error("eye_centers_extraction_error", error=str(e))
            raise LandmarkExtractionError(f"Failed to extract eye centers: {e}")

    def estimate_head_pose(
        self,
        landmarks: Dict,
        frame_shape: tuple
    ) -> Dict[str, float]:
        """
        Estimate head pose from landmarks

        Args:
            landmarks: Landmark detection results
            frame_shape: (height, width) of frame

        Returns:
            Dictionary with pitch, yaw, roll
        """
        try:
            landmarks_array = landmarks["landmarks"]
            head_pose = self.facemesh.estimate_head_pose(landmarks_array, frame_shape)
            return head_pose

        except Exception as e:
            logger.error("head_pose_estimation_error", error=str(e))
            return {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}

    def reset_fallback(self):
        """Reset fallback landmarks"""
        self.last_successful_landmarks = None
        self.consecutive_failures = 0
        logger.info("fallback_landmarks_reset")

    def __del__(self):
        """Cleanup"""
        if hasattr(self, 'facemesh'):
            del self.facemesh
