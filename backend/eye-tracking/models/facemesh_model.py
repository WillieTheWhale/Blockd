"""
MediaPipe FaceMesh Integration
Handles 468-point facial landmark detection with iris refinement
"""

import cv2
import numpy as np
import mediapipe as mp
from typing import Optional, Tuple, List, Dict
import structlog

from src.config import settings, EYE_LANDMARKS, HEAD_POSE_LANDMARKS
from lib.errors import FaceMeshError, NoFaceDetectedError, LandmarkExtractionError

logger = structlog.get_logger(__name__)


class FaceMeshModel:
    """
    MediaPipe FaceMesh wrapper for facial landmark detection
    Optimized for real-time eye tracking
    """

    def __init__(self):
        """Initialize MediaPipe FaceMesh"""
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=settings.MEDIAPIPE_STATIC_IMAGE_MODE,
            max_num_faces=settings.MEDIAPIPE_MAX_NUM_FACES,
            refine_landmarks=settings.MEDIAPIPE_REFINE_LANDMARKS,
            min_detection_confidence=settings.MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=settings.MEDIAPIPE_MIN_TRACKING_CONFIDENCE
        )

        logger.info(
            "mediapipe_facemesh_initialized",
            max_faces=settings.MEDIAPIPE_MAX_NUM_FACES,
            refine_landmarks=settings.MEDIAPIPE_REFINE_LANDMARKS
        )

    def process_frame(self, frame: np.ndarray) -> Optional[Dict]:
        """
        Process a single frame and extract facial landmarks

        Args:
            frame: BGR image from OpenCV (H x W x 3)

        Returns:
            Dictionary containing landmarks and metadata, or None if no face detected

        Raises:
            FaceMeshError: If processing fails
        """
        try:
            # Convert BGR to RGB (MediaPipe expects RGB)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Process frame
            results = self.face_mesh.process(rgb_frame)

            # Check if face detected
            if not results.multi_face_landmarks:
                logger.debug("no_face_detected_in_frame")
                return None

            # Extract first face (we only track one face)
            face_landmarks = results.multi_face_landmarks[0]

            # Convert to numpy array for easier processing
            h, w, _ = frame.shape
            landmarks_array = np.array([
                [lm.x * w, lm.y * h, lm.z * w]  # z is relative depth
                for lm in face_landmarks.landmark
            ])

            return {
                "landmarks": landmarks_array,
                "raw_landmarks": face_landmarks,
                "frame_width": w,
                "frame_height": h,
                "num_landmarks": len(landmarks_array)
            }

        except cv2.error as e:
            logger.error("opencv_error_processing_frame", error=str(e))
            raise FaceMeshError(f"OpenCV error: {e}")
        except Exception as e:
            logger.error("facemesh_processing_error", error=str(e))
            raise FaceMeshError(f"FaceMesh processing failed: {e}")

    def extract_eye_landmarks(self, landmarks: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Extract eye and iris landmarks from full face landmarks

        Args:
            landmarks: Full 468-point landmark array

        Returns:
            Dictionary with left/right eye and iris landmarks

        Raises:
            LandmarkExtractionError: If extraction fails
        """
        try:
            return {
                "left_eye_outline": landmarks[EYE_LANDMARKS["left_eye_outline"]],
                "right_eye_outline": landmarks[EYE_LANDMARKS["right_eye_outline"]],
                "left_iris": landmarks[EYE_LANDMARKS["left_iris"]],
                "right_iris": landmarks[EYE_LANDMARKS["right_iris"]]
            }
        except IndexError as e:
            logger.error("landmark_extraction_error", error=str(e))
            raise LandmarkExtractionError(f"Failed to extract eye landmarks: {e}")

    def extract_head_pose_landmarks(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Extract landmarks needed for head pose estimation

        Args:
            landmarks: Full 468-point landmark array

        Returns:
            Array of 6 key landmarks for pose estimation

        Raises:
            LandmarkExtractionError: If extraction fails
        """
        try:
            indices = [
                HEAD_POSE_LANDMARKS["nose_tip"],
                HEAD_POSE_LANDMARKS["chin"],
                HEAD_POSE_LANDMARKS["left_eye_corner"],
                HEAD_POSE_LANDMARKS["right_eye_corner"],
                HEAD_POSE_LANDMARKS["left_mouth_corner"],
                HEAD_POSE_LANDMARKS["right_mouth_corner"]
            ]
            return landmarks[indices]
        except IndexError as e:
            logger.error("head_pose_landmark_extraction_error", error=str(e))
            raise LandmarkExtractionError(f"Failed to extract head pose landmarks: {e}")

    def estimate_head_pose(self, landmarks: np.ndarray, frame_shape: Tuple[int, int]) -> Dict[str, float]:
        """
        Estimate head pose (pitch, yaw, roll) using solvePnP

        Args:
            landmarks: Full 468-point landmark array
            frame_shape: (height, width) of the frame

        Returns:
            Dictionary with pitch, yaw, roll in degrees

        Raises:
            FaceMeshError: If pose estimation fails
        """
        try:
            # 3D model points (standard face model in cm)
            model_points = np.array([
                [0.0, 0.0, 0.0],          # Nose tip
                [0.0, -6.5, -1.5],        # Chin
                [-4.0, 2.0, -1.5],        # Left eye corner
                [4.0, 2.0, -1.5],         # Right eye corner
                [-2.5, -3.0, -1.5],       # Left mouth corner
                [2.5, -3.0, -1.5]         # Right mouth corner
            ], dtype=np.float64)

            # 2D image points
            pose_landmarks = self.extract_head_pose_landmarks(landmarks)
            image_points = pose_landmarks[:, :2].astype(np.float64)

            # Camera internals
            h, w = frame_shape
            focal_length = w
            center = (w / 2, h / 2)
            camera_matrix = np.array([
                [focal_length, 0, center[0]],
                [0, focal_length, center[1]],
                [0, 0, 1]
            ], dtype=np.float64)

            # Distortion coefficients (assuming no distortion)
            dist_coeffs = np.zeros((4, 1))

            # Solve PnP
            success, rotation_vector, translation_vector = cv2.solvePnP(
                model_points,
                image_points,
                camera_matrix,
                dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )

            if not success:
                logger.warning("solvepnp_failed")
                return {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}

            # Convert rotation vector to Euler angles
            rotation_mat, _ = cv2.Rodrigues(rotation_vector)
            pose_mat = cv2.hconcat([rotation_mat, translation_vector])
            _, _, _, _, _, _, euler_angles = cv2.decomposeProjectionMatrix(pose_mat)

            pitch = euler_angles[0][0]
            yaw = euler_angles[1][0]
            roll = euler_angles[2][0]

            return {
                "pitch": float(pitch),
                "yaw": float(yaw),
                "roll": float(roll)
            }

        except Exception as e:
            logger.error("head_pose_estimation_error", error=str(e))
            raise FaceMeshError(f"Head pose estimation failed: {e}")

    def get_eye_centers(self, eye_landmarks: Dict[str, np.ndarray]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Calculate eye centers from outline landmarks

        Args:
            eye_landmarks: Dictionary with eye outline landmarks

        Returns:
            Tuple of (left_eye_center, right_eye_center)
        """
        left_center = np.mean(eye_landmarks["left_eye_outline"], axis=0)
        right_center = np.mean(eye_landmarks["right_eye_outline"], axis=0)
        return left_center, right_center

    def get_iris_centers(self, eye_landmarks: Dict[str, np.ndarray]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Calculate iris centers from iris landmarks

        Args:
            eye_landmarks: Dictionary with iris landmarks

        Returns:
            Tuple of (left_iris_center, right_iris_center)
        """
        left_center = np.mean(eye_landmarks["left_iris"], axis=0)
        right_center = np.mean(eye_landmarks["right_iris"], axis=0)
        return left_center, right_center

    def calculate_eye_aspect_ratio(self, eye_outline: np.ndarray) -> float:
        """
        Calculate Eye Aspect Ratio (EAR) for blink detection

        Args:
            eye_outline: Eye outline landmarks (8 points)

        Returns:
            EAR value (lower means more closed)
        """
        # Vertical eye distances
        v1 = np.linalg.norm(eye_outline[1] - eye_outline[5])
        v2 = np.linalg.norm(eye_outline[2] - eye_outline[4])

        # Horizontal eye distance
        h = np.linalg.norm(eye_outline[0] - eye_outline[3])

        # Eye aspect ratio
        ear = (v1 + v2) / (2.0 * h)
        return float(ear)

    def __del__(self):
        """Cleanup resources"""
        if hasattr(self, 'face_mesh'):
            self.face_mesh.close()
            logger.info("facemesh_model_closed")
