"""
Anomaly Detection Service
Uses LSTM autoencoder to detect unusual gaze patterns
"""

import numpy as np
from typing import List, Dict, Tuple, Optional
from datetime import datetime
import structlog

from models.lstm_anomaly_detector import LSTMAnomalyDetector
from services.pattern_recognition import GazePoint
from src.config import settings
from lib.errors import AnomalyDetectionError, ModelLoadError

logger = structlog.get_logger(__name__)


class AnomalyDetectionService:
    """
    Service for detecting anomalous gaze patterns using LSTM
    """

    def __init__(self, model_path: str = None):
        """
        Initialize anomaly detection service

        Args:
            model_path: Path to pre-trained LSTM model
        """
        self.sequence_length = settings.LSTM_SEQUENCE_LENGTH
        self.features = settings.LSTM_FEATURES

        # Initialize LSTM detector
        try:
            self.detector = LSTMAnomalyDetector(
                sequence_length=self.sequence_length,
                features=self.features,
                model_path=model_path
            )

            # Try to load pre-trained model
            if model_path:
                try:
                    self.detector.load_model(model_path)
                    logger.info("pretrained_model_loaded", path=model_path)
                except ModelLoadError:
                    logger.warning("pretrained_model_not_found", path=model_path)
        except Exception as e:
            logger.warning("lstm_detector_initialization_failed", error=str(e))
            self.detector = None

        # Gaze sequence buffer
        self.gaze_buffer: List[Tuple[float, float]] = []

        # Detected anomalies
        self.anomalies: List[Dict] = []

        logger.info("anomaly_detection_service_initialized")

    def add_gaze_point(
        self,
        x: float,
        y: float,
        timestamp: datetime,
        check_anomaly: bool = True
    ) -> Optional[Dict]:
        """
        Add gaze point to buffer and check for anomalies

        Args:
            x: Gaze x coordinate (0-1)
            y: Gaze y coordinate (0-1)
            timestamp: Timestamp of gaze point
            check_anomaly: Whether to check for anomalies

        Returns:
            Anomaly info if detected, None otherwise
        """
        try:
            # Add to buffer
            self.gaze_buffer.append((x, y))

            # Keep buffer at sequence length
            if len(self.gaze_buffer) > self.sequence_length:
                self.gaze_buffer.pop(0)

            # Check for anomalies if buffer is full
            if check_anomaly and len(self.gaze_buffer) == self.sequence_length:
                return self.check_sequence_anomaly(timestamp)

            return None

        except Exception as e:
            logger.error("gaze_point_addition_error", error=str(e))
            return None

    def check_sequence_anomaly(
        self,
        timestamp: datetime
    ) -> Optional[Dict]:
        """
        Check if current gaze sequence is anomalous

        Args:
            timestamp: Timestamp for anomaly

        Returns:
            Anomaly info if detected, None otherwise
        """
        try:
            if self.detector is None or not self.detector.is_trained:
                return None

            if len(self.gaze_buffer) < self.sequence_length:
                return None

            # Convert buffer to numpy array
            sequence = np.array(self.gaze_buffer)

            # Detect anomaly
            is_anomaly, anomaly_score, reconstruction = self.detector.detect_anomaly(
                sequence=sequence,
                return_reconstruction=False
            )

            if is_anomaly:
                anomaly_info = {
                    "timestamp": timestamp.isoformat(),
                    "anomaly_score": anomaly_score,
                    "anomaly_type": "lstm",
                    "description": f"Unusual gaze pattern detected (score: {anomaly_score:.4f})",
                    "sequence_data": sequence.tolist()
                }

                self.anomalies.append(anomaly_info)

                logger.warning(
                    "anomaly_detected",
                    timestamp=timestamp.isoformat(),
                    score=anomaly_score
                )

                return anomaly_info

            return None

        except Exception as e:
            logger.error("sequence_anomaly_check_error", error=str(e))
            return None

    def detect_batch_anomalies(
        self,
        gaze_points: List[GazePoint]
    ) -> List[Dict]:
        """
        Detect anomalies in a batch of gaze points

        Args:
            gaze_points: List of gaze points

        Returns:
            List of detected anomalies

        Raises:
            AnomalyDetectionError: If detection fails
        """
        try:
            if self.detector is None or not self.detector.is_trained:
                logger.warning("detector_not_trained")
                return []

            if len(gaze_points) < self.sequence_length:
                return []

            anomalies = []

            # Create sequences
            for i in range(len(gaze_points) - self.sequence_length + 1):
                sequence_points = gaze_points[i:i + self.sequence_length]

                # Convert to array
                sequence = np.array([
                    [p.x, p.y] for p in sequence_points
                ])

                # Detect anomaly
                is_anomaly, anomaly_score, _ = self.detector.detect_anomaly(
                    sequence=sequence,
                    return_reconstruction=False
                )

                if is_anomaly:
                    anomaly_info = {
                        "timestamp": sequence_points[-1].timestamp.isoformat(),
                        "anomaly_score": anomaly_score,
                        "anomaly_type": "lstm",
                        "description": f"Unusual gaze pattern detected (score: {anomaly_score:.4f})",
                        "start_index": i,
                        "end_index": i + self.sequence_length - 1
                    }

                    anomalies.append(anomaly_info)

            logger.info(
                "batch_anomaly_detection_completed",
                num_sequences=len(gaze_points) - self.sequence_length + 1,
                num_anomalies=len(anomalies)
            )

            return anomalies

        except Exception as e:
            logger.error("batch_anomaly_detection_error", error=str(e))
            raise AnomalyDetectionError(f"Batch anomaly detection failed: {e}")

    def detect_statistical_anomalies(
        self,
        gaze_points: List[GazePoint],
        z_threshold: float = 3.0
    ) -> List[Dict]:
        """
        Detect statistical anomalies using z-score method

        Args:
            gaze_points: List of gaze points
            z_threshold: Z-score threshold for anomalies

        Returns:
            List of detected anomalies
        """
        try:
            if len(gaze_points) < 10:
                return []

            # Extract positions
            positions = np.array([
                [p.x, p.y] for p in gaze_points if not p.is_off_screen
            ])

            if len(positions) < 10:
                return []

            # Calculate mean and std
            mean = np.mean(positions, axis=0)
            std = np.std(positions, axis=0)

            # Calculate z-scores
            z_scores = np.abs((positions - mean) / (std + 1e-8))
            max_z_scores = np.max(z_scores, axis=1)

            # Detect anomalies
            anomalies = []
            point_idx = 0

            for i, point in enumerate(gaze_points):
                if not point.is_off_screen:
                    if max_z_scores[point_idx] > z_threshold:
                        anomalies.append({
                            "timestamp": point.timestamp.isoformat(),
                            "anomaly_score": float(max_z_scores[point_idx]),
                            "anomaly_type": "statistical",
                            "description": f"Statistical outlier detected (z-score: {max_z_scores[point_idx]:.2f})",
                            "position": (point.x, point.y)
                        })
                    point_idx += 1

            logger.info(
                "statistical_anomaly_detection_completed",
                num_points=len(positions),
                num_anomalies=len(anomalies)
            )

            return anomalies

        except Exception as e:
            logger.error("statistical_anomaly_detection_error", error=str(e))
            return []

    def get_all_anomalies(self) -> List[Dict]:
        """Get all detected anomalies"""
        return self.anomalies.copy()

    def clear_anomalies(self):
        """Clear anomaly history"""
        self.anomalies.clear()
        logger.info("anomalies_cleared")

    def train_detector(
        self,
        training_data: List[GazePoint],
        validation_data: Optional[List[GazePoint]] = None
    ):
        """
        Train LSTM detector on normal gaze data

        Args:
            training_data: List of normal gaze points
            validation_data: Optional validation data

        Raises:
            AnomalyDetectionError: If training fails
        """
        try:
            if self.detector is None:
                raise AnomalyDetectionError("LSTM detector not initialized")

            # Convert to sequences
            training_sequences = self._create_sequences(training_data)

            if validation_data:
                validation_sequences = self._create_sequences(validation_data)
            else:
                validation_sequences = None

            # Train
            self.detector.train(
                training_sequences=training_sequences,
                validation_sequences=validation_sequences
            )

            # Calibrate threshold
            self.detector.calibrate_threshold(
                normal_sequences=training_sequences,
                percentile=95.0
            )

            logger.info("detector_training_completed")

        except Exception as e:
            logger.error("detector_training_error", error=str(e))
            raise AnomalyDetectionError(f"Detector training failed: {e}")

    def _create_sequences(
        self,
        gaze_points: List[GazePoint]
    ) -> np.ndarray:
        """
        Create sequences from gaze points

        Args:
            gaze_points: List of gaze points

        Returns:
            Array of sequences (N, sequence_length, features)
        """
        positions = np.array([
            [p.x, p.y] for p in gaze_points if not p.is_off_screen
        ])

        # Create overlapping sequences
        sequences = []
        for i in range(len(positions) - self.sequence_length + 1):
            sequence = positions[i:i + self.sequence_length]
            sequences.append(sequence)

        return np.array(sequences)

    def set_threshold(self, threshold: float):
        """
        Set anomaly detection threshold

        Args:
            threshold: New threshold value
        """
        if self.detector:
            self.detector.set_threshold(threshold)
            logger.info("anomaly_threshold_updated", threshold=threshold)

    def reset(self):
        """Reset service state"""
        self.gaze_buffer.clear()
        self.anomalies.clear()
        logger.info("anomaly_detection_service_reset")
