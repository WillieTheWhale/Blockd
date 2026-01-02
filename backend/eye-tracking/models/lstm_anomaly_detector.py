"""
LSTM Autoencoder for Gaze Anomaly Detection
Detects unusual gaze patterns that deviate from normal behavior
"""

import numpy as np
from typing import List, Tuple, Optional
import structlog
import os

try:
    from tensorflow import keras
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import LSTM, Dense, RepeatVector, TimeDistributed, Dropout
    from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    logger = structlog.get_logger(__name__)
    logger.warning("tensorflow_not_available", message="LSTM anomaly detection will not work")

from src.config import settings
from lib.errors import AnomalyDetectionError, ModelLoadError

logger = structlog.get_logger(__name__)


class LSTMAnomalyDetector:
    """
    LSTM Autoencoder for detecting anomalous gaze patterns
    Trained on normal gaze sequences, flags deviations
    """

    def __init__(
        self,
        sequence_length: int = None,
        features: int = None,
        model_path: str = None
    ):
        """
        Initialize LSTM anomaly detector

        Args:
            sequence_length: Length of gaze sequences
            features: Number of features per time step (default 2: x, y)
            model_path: Path to saved model
        """
        if not TENSORFLOW_AVAILABLE:
            raise ModelLoadError("TensorFlow not available")

        self.sequence_length = sequence_length or settings.LSTM_SEQUENCE_LENGTH
        self.features = features or settings.LSTM_FEATURES
        self.model_path = model_path or settings.LSTM_MODEL_PATH
        self.anomaly_threshold = settings.LSTM_ANOMALY_THRESHOLD

        self.model = None
        self.is_trained = False

        # Statistics for normalization
        self.mean = None
        self.std = None

        logger.info(
            "lstm_anomaly_detector_initialized",
            sequence_length=self.sequence_length,
            features=self.features
        )

    def build_model(self) -> keras.Model:
        """
        Build LSTM autoencoder architecture

        Returns:
            Compiled Keras model
        """
        model = Sequential([
            # Encoder
            LSTM(
                64,
                activation='relu',
                input_shape=(self.sequence_length, self.features),
                return_sequences=True
            ),
            Dropout(0.2),
            LSTM(32, activation='relu', return_sequences=True),
            Dropout(0.2),
            LSTM(16, activation='relu', return_sequences=False),

            # Latent representation
            RepeatVector(self.sequence_length),

            # Decoder
            LSTM(16, activation='relu', return_sequences=True),
            Dropout(0.2),
            LSTM(32, activation='relu', return_sequences=True),
            Dropout(0.2),
            LSTM(64, activation='relu', return_sequences=True),

            # Output
            TimeDistributed(Dense(self.features))
        ])

        model.compile(
            optimizer='adam',
            loss='mse',
            metrics=['mae']
        )

        logger.info("lstm_model_built", summary=model.summary())
        return model

    def train(
        self,
        training_sequences: np.ndarray,
        validation_sequences: Optional[np.ndarray] = None,
        epochs: int = None,
        batch_size: int = None
    ):
        """
        Train the LSTM autoencoder on normal gaze sequences

        Args:
            training_sequences: Normal gaze sequences (N, sequence_length, features)
            validation_sequences: Optional validation data
            epochs: Number of training epochs
            batch_size: Batch size for training

        Raises:
            AnomalyDetectionError: If training fails
        """
        try:
            epochs = epochs or settings.LSTM_EPOCHS
            batch_size = batch_size or settings.LSTM_BATCH_SIZE

            # Normalize data
            self.mean = np.mean(training_sequences, axis=(0, 1))
            self.std = np.std(training_sequences, axis=(0, 1))
            training_sequences_norm = (training_sequences - self.mean) / (self.std + 1e-8)

            if validation_sequences is not None:
                validation_sequences_norm = (validation_sequences - self.mean) / (self.std + 1e-8)
                validation_data = (validation_sequences_norm, validation_sequences_norm)
            else:
                validation_data = None

            # Build model
            self.model = self.build_model()

            # Callbacks
            callbacks = [
                EarlyStopping(
                    monitor='val_loss' if validation_data else 'loss',
                    patience=10,
                    restore_best_weights=True
                )
            ]

            # Add model checkpoint if path provided
            if self.model_path:
                os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
                callbacks.append(
                    ModelCheckpoint(
                        self.model_path,
                        monitor='val_loss' if validation_data else 'loss',
                        save_best_only=True
                    )
                )

            # Train
            logger.info("starting_lstm_training", epochs=epochs, batch_size=batch_size)

            history = self.model.fit(
                training_sequences_norm,
                training_sequences_norm,  # Autoencoder: input = output
                epochs=epochs,
                batch_size=batch_size,
                validation_data=validation_data,
                callbacks=callbacks,
                verbose=1
            )

            self.is_trained = True

            logger.info(
                "lstm_training_completed",
                final_loss=history.history['loss'][-1],
                final_val_loss=history.history.get('val_loss', [None])[-1]
            )

        except Exception as e:
            logger.error("lstm_training_error", error=str(e))
            raise AnomalyDetectionError(f"LSTM training failed: {e}")

    def load_model(self, model_path: str = None):
        """
        Load pre-trained model from disk

        Args:
            model_path: Path to model file

        Raises:
            ModelLoadError: If loading fails
        """
        try:
            model_path = model_path or self.model_path

            if not os.path.exists(model_path):
                raise ModelLoadError(f"Model file not found: {model_path}")

            self.model = keras.models.load_model(model_path)
            self.is_trained = True

            logger.info("lstm_model_loaded", path=model_path)

        except Exception as e:
            logger.error("model_load_error", error=str(e))
            raise ModelLoadError(f"Failed to load model: {e}")

    def save_model(self, model_path: str = None):
        """
        Save trained model to disk

        Args:
            model_path: Path to save model

        Raises:
            AnomalyDetectionError: If saving fails
        """
        try:
            if not self.is_trained or self.model is None:
                raise AnomalyDetectionError("No trained model to save")

            model_path = model_path or self.model_path
            os.makedirs(os.path.dirname(model_path), exist_ok=True)

            self.model.save(model_path)

            logger.info("lstm_model_saved", path=model_path)

        except Exception as e:
            logger.error("model_save_error", error=str(e))
            raise AnomalyDetectionError(f"Failed to save model: {e}")

    def detect_anomaly(
        self,
        sequence: np.ndarray,
        return_reconstruction: bool = False
    ) -> Tuple[bool, float, Optional[np.ndarray]]:
        """
        Detect if a gaze sequence is anomalous

        Args:
            sequence: Gaze sequence (sequence_length, features)
            return_reconstruction: Whether to return reconstruction

        Returns:
            Tuple of (is_anomaly, anomaly_score, reconstruction)
            - is_anomaly: Boolean indicating if anomaly detected
            - anomaly_score: MSE reconstruction error
            - reconstruction: Reconstructed sequence (if requested)

        Raises:
            AnomalyDetectionError: If detection fails
        """
        try:
            if not self.is_trained or self.model is None:
                raise AnomalyDetectionError("Model not trained")

            # Validate sequence shape
            if sequence.shape != (self.sequence_length, self.features):
                raise AnomalyDetectionError(
                    f"Invalid sequence shape: {sequence.shape}, "
                    f"expected ({self.sequence_length}, {self.features})"
                )

            # Normalize
            if self.mean is not None and self.std is not None:
                sequence_norm = (sequence - self.mean) / (self.std + 1e-8)
            else:
                sequence_norm = sequence

            # Add batch dimension
            sequence_batch = np.expand_dims(sequence_norm, axis=0)

            # Get reconstruction
            reconstruction = self.model.predict(sequence_batch, verbose=0)

            # Calculate reconstruction error (MSE)
            mse = np.mean((sequence_norm - reconstruction[0]) ** 2)

            # Determine if anomaly
            is_anomaly = mse > self.anomaly_threshold

            # Denormalize reconstruction if needed
            if return_reconstruction:
                if self.mean is not None and self.std is not None:
                    reconstruction_denorm = reconstruction[0] * self.std + self.mean
                else:
                    reconstruction_denorm = reconstruction[0]
            else:
                reconstruction_denorm = None

            logger.debug(
                "anomaly_detection",
                mse=mse,
                threshold=self.anomaly_threshold,
                is_anomaly=is_anomaly
            )

            return is_anomaly, float(mse), reconstruction_denorm

        except Exception as e:
            logger.error("anomaly_detection_error", error=str(e))
            raise AnomalyDetectionError(f"Anomaly detection failed: {e}")

    def detect_batch(
        self,
        sequences: List[np.ndarray]
    ) -> List[Tuple[bool, float]]:
        """
        Detect anomalies in batch of sequences

        Args:
            sequences: List of gaze sequences

        Returns:
            List of (is_anomaly, anomaly_score) tuples
        """
        results = []
        for sequence in sequences:
            is_anomaly, score, _ = self.detect_anomaly(sequence)
            results.append((is_anomaly, score))
        return results

    def set_threshold(self, threshold: float):
        """
        Set anomaly detection threshold

        Args:
            threshold: MSE threshold for anomaly detection
        """
        self.anomaly_threshold = threshold
        logger.info("anomaly_threshold_updated", threshold=threshold)

    def calibrate_threshold(
        self,
        normal_sequences: np.ndarray,
        percentile: float = 95.0
    ):
        """
        Automatically calibrate threshold based on normal data

        Args:
            normal_sequences: Array of normal gaze sequences
            percentile: Percentile for threshold (default 95%)

        Raises:
            AnomalyDetectionError: If calibration fails
        """
        try:
            if not self.is_trained or self.model is None:
                raise AnomalyDetectionError("Model not trained")

            # Calculate reconstruction errors for normal sequences
            errors = []
            for sequence in normal_sequences:
                _, error, _ = self.detect_anomaly(sequence)
                errors.append(error)

            # Set threshold at specified percentile
            threshold = np.percentile(errors, percentile)
            self.set_threshold(threshold)

            logger.info(
                "threshold_calibrated",
                threshold=threshold,
                percentile=percentile,
                num_sequences=len(normal_sequences)
            )

        except Exception as e:
            logger.error("threshold_calibration_error", error=str(e))
            raise AnomalyDetectionError(f"Threshold calibration failed: {e}")
