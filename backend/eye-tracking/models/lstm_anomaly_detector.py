"""
LSTM Autoencoder for Gaze Anomaly Detection
Detects unusual gaze patterns that deviate from normal behavior

This module implements an LSTM autoencoder trained on normal gaze sequences.
Anomalies are detected when the reconstruction error exceeds a calibrated threshold.

Architecture:
    Encoder: LSTM(64) -> LSTM(32) -> LSTM(16) -> Latent Space
    Decoder: LSTM(16) -> LSTM(32) -> LSTM(64) -> Dense(features)

Training:
    - Input: Normal gaze sequences (N, sequence_length, features)
    - Output: Reconstructed sequences
    - Loss: Mean Squared Error (MSE)

Detection:
    - Calculate reconstruction error for new sequence
    - Compare against calibrated threshold (95th percentile of normal data)
    - Flag as anomaly if error exceeds threshold
"""

import numpy as np
from typing import List, Tuple, Optional, Dict, Any
import structlog
import os
import json
from dataclasses import dataclass, asdict
from datetime import datetime

# TensorFlow/Keras imports with comprehensive fallback
TENSORFLOW_AVAILABLE = False
KERAS_VERSION = None

try:
    # Try Keras 3.0+ (standalone package)
    import keras
    from keras import Sequential
    from keras.layers import LSTM, Dense, RepeatVector, TimeDistributed, Dropout, Input
    from keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
    from keras.optimizers import Adam
    from keras.regularizers import l2
    TENSORFLOW_AVAILABLE = True
    KERAS_VERSION = "3.x"
except ImportError:
    try:
        # Fallback to TensorFlow's built-in Keras (TensorFlow < 2.16)
        from tensorflow import keras
        from tensorflow.keras import Sequential
        from tensorflow.keras.layers import LSTM, Dense, RepeatVector, TimeDistributed, Dropout, Input
        from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
        from tensorflow.keras.optimizers import Adam
        from tensorflow.keras.regularizers import l2
        TENSORFLOW_AVAILABLE = True
        KERAS_VERSION = "tf.keras"
    except ImportError:
        pass

from src.config import settings
from lib.errors import AnomalyDetectionError, ModelLoadError

logger = structlog.get_logger(__name__)

# Log TensorFlow availability at module load
if TENSORFLOW_AVAILABLE:
    logger.info(
        "tensorflow_available",
        keras_version=KERAS_VERSION,
        message="LSTM anomaly detection is available"
    )
else:
    logger.warning(
        "tensorflow_not_available",
        message="LSTM anomaly detection disabled - install tensorflow>=2.16.0 and keras>=3.0.0"
    )


@dataclass
class ModelMetadata:
    """Metadata for trained LSTM model"""
    model_version: str = "1.0.0"
    sequence_length: int = 30
    features: int = 2
    created_at: str = ""
    trained_samples: int = 0
    final_loss: float = 0.0
    final_val_loss: Optional[float] = None
    anomaly_threshold: float = 0.05
    mean: Optional[List[float]] = None
    std: Optional[List[float]] = None
    training_epochs: int = 0
    keras_version: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ModelMetadata":
        """Create from dictionary"""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class AnomalyResult:
    """Result of anomaly detection"""
    is_anomaly: bool
    anomaly_score: float
    threshold: float
    confidence: float  # How confident we are in the detection (0-1)
    reconstruction_error: float
    sequence_stats: Dict[str, float]  # Mean, std, range of input sequence

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


class LSTMAnomalyDetector:
    """
    LSTM Autoencoder for detecting anomalous gaze patterns.

    This detector is trained on normal gaze sequences and flags deviations
    based on reconstruction error. It uses a symmetric autoencoder architecture
    with LSTM layers for temporal sequence modeling.

    Features:
        - Automatic normalization of input sequences
        - Configurable architecture parameters
        - Model metadata persistence
        - Confidence scoring for detections
        - Batch processing support
        - Statistical fallback when model unavailable

    Example:
        detector = LSTMAnomalyDetector(sequence_length=30, features=2)
        detector.train(normal_sequences)
        result = detector.detect_anomaly_detailed(new_sequence)
        if result.is_anomaly:
            print(f"Anomaly detected with confidence {result.confidence}")
    """

    MODEL_VERSION = "1.0.0"

    def __init__(
        self,
        sequence_length: int = None,
        features: int = None,
        model_path: str = None,
        anomaly_threshold: float = None,
        use_regularization: bool = True,
        learning_rate: float = 0.001
    ):
        """
        Initialize LSTM anomaly detector.

        Args:
            sequence_length: Length of gaze sequences (default from settings)
            features: Number of features per time step (default 2: x, y)
            model_path: Path to saved model
            anomaly_threshold: MSE threshold for anomaly detection
            use_regularization: Whether to use L2 regularization
            learning_rate: Learning rate for Adam optimizer

        Raises:
            ModelLoadError: If TensorFlow is not available
        """
        if not TENSORFLOW_AVAILABLE:
            raise ModelLoadError(
                "TensorFlow/Keras not available. Install with: "
                "pip install tensorflow>=2.16.0 keras>=3.0.0"
            )

        self.sequence_length = sequence_length or getattr(settings, 'LSTM_SEQUENCE_LENGTH', 30)
        self.features = features or getattr(settings, 'LSTM_FEATURES', 2)
        self.model_path = model_path or getattr(settings, 'LSTM_MODEL_PATH', './models/lstm_gaze_anomaly.keras')
        self.anomaly_threshold = anomaly_threshold or getattr(settings, 'LSTM_ANOMALY_THRESHOLD', 0.05)
        self.use_regularization = use_regularization
        self.learning_rate = learning_rate

        self.model = None
        self.is_trained = False

        # Statistics for normalization
        self.mean: Optional[np.ndarray] = None
        self.std: Optional[np.ndarray] = None

        # Model metadata
        self.metadata = ModelMetadata(
            model_version=self.MODEL_VERSION,
            sequence_length=self.sequence_length,
            features=self.features,
            anomaly_threshold=self.anomaly_threshold,
            keras_version=KERAS_VERSION or "unknown"
        )

        # Training history
        self.training_history: Optional[Dict[str, List[float]]] = None

        logger.info(
            "lstm_anomaly_detector_initialized",
            sequence_length=self.sequence_length,
            features=self.features,
            model_path=self.model_path,
            anomaly_threshold=self.anomaly_threshold,
            keras_version=KERAS_VERSION
        )

    def build_model(self, latent_dim: int = 16) -> "keras.Model":
        """
        Build LSTM autoencoder architecture with configurable parameters.

        Architecture:
            Encoder: Input -> LSTM(64) -> Dropout -> LSTM(32) -> Dropout -> LSTM(latent_dim)
            Bridge: RepeatVector(sequence_length)
            Decoder: LSTM(latent_dim) -> Dropout -> LSTM(32) -> Dropout -> LSTM(64) -> Dense(features)

        Args:
            latent_dim: Dimension of the latent representation (default 16)

        Returns:
            Compiled Keras model
        """
        # Regularization settings
        reg = l2(0.001) if self.use_regularization else None

        model = Sequential([
            # Input layer (explicit for Keras 3.0 compatibility)
            Input(shape=(self.sequence_length, self.features)),

            # Encoder
            LSTM(
                64,
                activation='tanh',
                recurrent_activation='sigmoid',
                return_sequences=True,
                kernel_regularizer=reg,
                name='encoder_lstm_1'
            ),
            Dropout(0.2, name='encoder_dropout_1'),

            LSTM(
                32,
                activation='tanh',
                recurrent_activation='sigmoid',
                return_sequences=True,
                kernel_regularizer=reg,
                name='encoder_lstm_2'
            ),
            Dropout(0.2, name='encoder_dropout_2'),

            LSTM(
                latent_dim,
                activation='tanh',
                recurrent_activation='sigmoid',
                return_sequences=False,
                kernel_regularizer=reg,
                name='encoder_lstm_3'
            ),

            # Latent representation - bridge between encoder and decoder
            RepeatVector(self.sequence_length, name='latent_bridge'),

            # Decoder (mirror of encoder)
            LSTM(
                latent_dim,
                activation='tanh',
                recurrent_activation='sigmoid',
                return_sequences=True,
                kernel_regularizer=reg,
                name='decoder_lstm_1'
            ),
            Dropout(0.2, name='decoder_dropout_1'),

            LSTM(
                32,
                activation='tanh',
                recurrent_activation='sigmoid',
                return_sequences=True,
                kernel_regularizer=reg,
                name='decoder_lstm_2'
            ),
            Dropout(0.2, name='decoder_dropout_2'),

            LSTM(
                64,
                activation='tanh',
                recurrent_activation='sigmoid',
                return_sequences=True,
                kernel_regularizer=reg,
                name='decoder_lstm_3'
            ),

            # Output layer - reconstruct input features
            TimeDistributed(
                Dense(self.features, activation='linear'),
                name='output'
            )
        ])

        # Compile with Adam optimizer
        optimizer = Adam(learning_rate=self.learning_rate)
        model.compile(
            optimizer=optimizer,
            loss='mse',
            metrics=['mae']
        )

        # Log model summary
        model_params = model.count_params()
        logger.info(
            "lstm_model_built",
            total_params=model_params,
            latent_dim=latent_dim,
            sequence_length=self.sequence_length,
            features=self.features
        )

        return model

    def train(
        self,
        training_sequences: np.ndarray,
        validation_sequences: Optional[np.ndarray] = None,
        epochs: int = None,
        batch_size: int = None,
        latent_dim: int = 16,
        auto_calibrate_threshold: bool = True
    ) -> Dict[str, Any]:
        """
        Train the LSTM autoencoder on normal gaze sequences.

        The model learns to reconstruct normal gaze patterns. During inference,
        anomalies are detected when the reconstruction error exceeds the threshold.

        Args:
            training_sequences: Normal gaze sequences (N, sequence_length, features)
            validation_sequences: Optional validation data for early stopping
            epochs: Number of training epochs (default from settings)
            batch_size: Batch size for training (default from settings)
            latent_dim: Dimension of latent space (default 16)
            auto_calibrate_threshold: Whether to auto-calibrate threshold after training

        Returns:
            Dictionary containing training history and final metrics

        Raises:
            AnomalyDetectionError: If training fails
        """
        try:
            epochs = epochs or getattr(settings, 'LSTM_EPOCHS', 100)
            batch_size = batch_size or getattr(settings, 'LSTM_BATCH_SIZE', 32)

            # Validate input shape
            if len(training_sequences.shape) != 3:
                raise AnomalyDetectionError(
                    f"Expected 3D array (samples, sequence_length, features), "
                    f"got shape {training_sequences.shape}"
                )

            if training_sequences.shape[1] != self.sequence_length:
                raise AnomalyDetectionError(
                    f"Sequence length mismatch: expected {self.sequence_length}, "
                    f"got {training_sequences.shape[1]}"
                )

            if training_sequences.shape[2] != self.features:
                raise AnomalyDetectionError(
                    f"Features mismatch: expected {self.features}, "
                    f"got {training_sequences.shape[2]}"
                )

            # Calculate normalization statistics
            self.mean = np.mean(training_sequences, axis=(0, 1))
            self.std = np.std(training_sequences, axis=(0, 1))

            # Prevent division by zero
            self.std = np.where(self.std < 1e-8, 1.0, self.std)

            # Normalize training data
            training_sequences_norm = (training_sequences - self.mean) / self.std

            # Prepare validation data if provided
            validation_data = None
            if validation_sequences is not None:
                if validation_sequences.shape[1:] != training_sequences.shape[1:]:
                    raise AnomalyDetectionError(
                        f"Validation shape mismatch: expected {training_sequences.shape[1:]}, "
                        f"got {validation_sequences.shape[1:]}"
                    )
                validation_sequences_norm = (validation_sequences - self.mean) / self.std
                validation_data = (validation_sequences_norm, validation_sequences_norm)

            # Build model
            self.model = self.build_model(latent_dim=latent_dim)

            # Callbacks
            monitor_metric = 'val_loss' if validation_data else 'loss'
            callbacks = [
                EarlyStopping(
                    monitor=monitor_metric,
                    patience=15,
                    restore_best_weights=True,
                    min_delta=1e-6,
                    verbose=1
                ),
                ReduceLROnPlateau(
                    monitor=monitor_metric,
                    factor=0.5,
                    patience=5,
                    min_lr=1e-6,
                    verbose=1
                )
            ]

            # Add model checkpoint if path provided
            if self.model_path:
                model_dir = os.path.dirname(self.model_path)
                if model_dir:
                    os.makedirs(model_dir, exist_ok=True)
                callbacks.append(
                    ModelCheckpoint(
                        self.model_path,
                        monitor=monitor_metric,
                        save_best_only=True,
                        verbose=1
                    )
                )

            # Log training start
            logger.info(
                "starting_lstm_training",
                epochs=epochs,
                batch_size=batch_size,
                training_samples=len(training_sequences),
                validation_samples=len(validation_sequences) if validation_sequences is not None else 0,
                latent_dim=latent_dim
            )

            # Train
            history = self.model.fit(
                training_sequences_norm,
                training_sequences_norm,  # Autoencoder: input = output
                epochs=epochs,
                batch_size=batch_size,
                validation_data=validation_data,
                callbacks=callbacks,
                verbose=1,
                shuffle=True
            )

            self.is_trained = True
            self.training_history = history.history

            # Update metadata
            final_loss = float(history.history['loss'][-1])
            final_val_loss = history.history.get('val_loss', [None])[-1]
            if final_val_loss is not None:
                final_val_loss = float(final_val_loss)

            self.metadata.created_at = datetime.utcnow().isoformat()
            self.metadata.trained_samples = len(training_sequences)
            self.metadata.final_loss = final_loss
            self.metadata.final_val_loss = final_val_loss
            self.metadata.training_epochs = len(history.history['loss'])
            self.metadata.mean = self.mean.tolist()
            self.metadata.std = self.std.tolist()

            logger.info(
                "lstm_training_completed",
                final_loss=final_loss,
                final_val_loss=final_val_loss,
                epochs_run=self.metadata.training_epochs
            )

            # Auto-calibrate threshold if requested
            if auto_calibrate_threshold:
                self.calibrate_threshold(training_sequences, percentile=95.0)

            # Save model metadata
            self._save_metadata()

            return {
                "final_loss": final_loss,
                "final_val_loss": final_val_loss,
                "epochs_run": self.metadata.training_epochs,
                "threshold": self.anomaly_threshold,
                "model_path": self.model_path
            }

        except Exception as e:
            logger.error("lstm_training_error", error=str(e), exc_info=True)
            raise AnomalyDetectionError(f"LSTM training failed: {e}")

    def _save_metadata(self):
        """Save model metadata to JSON file alongside the model"""
        if not self.model_path:
            return

        metadata_path = self.model_path.rsplit('.', 1)[0] + '_metadata.json'
        try:
            with open(metadata_path, 'w') as f:
                json.dump(self.metadata.to_dict(), f, indent=2)
            logger.info("model_metadata_saved", path=metadata_path)
        except Exception as e:
            logger.warning("metadata_save_failed", error=str(e))

    def _load_metadata(self):
        """Load model metadata from JSON file"""
        if not self.model_path:
            return

        metadata_path = self.model_path.rsplit('.', 1)[0] + '_metadata.json'
        try:
            if os.path.exists(metadata_path):
                with open(metadata_path, 'r') as f:
                    data = json.load(f)
                self.metadata = ModelMetadata.from_dict(data)

                # Restore normalization stats
                if self.metadata.mean:
                    self.mean = np.array(self.metadata.mean)
                if self.metadata.std:
                    self.std = np.array(self.metadata.std)
                if self.metadata.anomaly_threshold:
                    self.anomaly_threshold = self.metadata.anomaly_threshold

                logger.info("model_metadata_loaded", path=metadata_path)
        except Exception as e:
            logger.warning("metadata_load_failed", error=str(e))

    def load_model(self, model_path: str = None):
        """
        Load pre-trained model from disk.

        Also loads associated metadata including normalization statistics
        and anomaly threshold.

        Args:
            model_path: Path to model file (default from settings)

        Raises:
            ModelLoadError: If loading fails
        """
        try:
            model_path = model_path or self.model_path

            if not os.path.exists(model_path):
                raise ModelLoadError(f"Model file not found: {model_path}")

            # Load model
            self.model = keras.models.load_model(model_path)
            self.is_trained = True
            self.model_path = model_path

            # Load metadata
            self._load_metadata()

            logger.info(
                "lstm_model_loaded",
                path=model_path,
                threshold=self.anomaly_threshold,
                has_normalization_stats=self.mean is not None
            )

        except Exception as e:
            logger.error("model_load_error", error=str(e), exc_info=True)
            raise ModelLoadError(f"Failed to load model: {e}")

    def detect_anomaly_detailed(
        self,
        sequence: np.ndarray
    ) -> AnomalyResult:
        """
        Detect if a gaze sequence is anomalous with detailed results.

        This method returns a comprehensive AnomalyResult object containing
        the detection outcome, confidence score, and supporting statistics.

        Args:
            sequence: Gaze sequence (sequence_length, features)

        Returns:
            AnomalyResult with detection details

        Raises:
            AnomalyDetectionError: If detection fails
        """
        try:
            if not self.is_trained or self.model is None:
                raise AnomalyDetectionError("Model not trained or loaded")

            # Validate sequence shape
            if sequence.shape != (self.sequence_length, self.features):
                raise AnomalyDetectionError(
                    f"Invalid sequence shape: {sequence.shape}, "
                    f"expected ({self.sequence_length}, {self.features})"
                )

            # Calculate sequence statistics before normalization
            sequence_stats = {
                "mean_x": float(np.mean(sequence[:, 0])),
                "mean_y": float(np.mean(sequence[:, 1])) if self.features > 1 else 0.0,
                "std_x": float(np.std(sequence[:, 0])),
                "std_y": float(np.std(sequence[:, 1])) if self.features > 1 else 0.0,
                "range_x": float(np.ptp(sequence[:, 0])),
                "range_y": float(np.ptp(sequence[:, 1])) if self.features > 1 else 0.0,
            }

            # Normalize
            if self.mean is not None and self.std is not None:
                sequence_norm = (sequence - self.mean) / self.std
            else:
                sequence_norm = sequence

            # Add batch dimension
            sequence_batch = np.expand_dims(sequence_norm, axis=0)

            # Get reconstruction
            reconstruction = self.model.predict(sequence_batch, verbose=0)

            # Calculate reconstruction error (MSE per feature, then average)
            mse_per_feature = np.mean((sequence_norm - reconstruction[0]) ** 2, axis=0)
            mse = float(np.mean(mse_per_feature))

            # Calculate confidence based on how far the error is from threshold
            # High confidence when error is much higher or lower than threshold
            error_ratio = mse / self.anomaly_threshold
            if error_ratio > 1:
                # Anomaly detected - confidence increases with error ratio
                confidence = min(1.0, 0.5 + 0.5 * (1 - 1 / error_ratio))
            else:
                # Normal - confidence increases as error ratio decreases
                confidence = min(1.0, 0.5 + 0.5 * (1 - error_ratio))

            # Determine if anomaly
            is_anomaly = mse > self.anomaly_threshold

            result = AnomalyResult(
                is_anomaly=is_anomaly,
                anomaly_score=mse,
                threshold=self.anomaly_threshold,
                confidence=confidence,
                reconstruction_error=mse,
                sequence_stats=sequence_stats
            )

            logger.debug(
                "anomaly_detection_detailed",
                is_anomaly=is_anomaly,
                mse=mse,
                threshold=self.anomaly_threshold,
                confidence=confidence
            )

            return result

        except Exception as e:
            logger.error("anomaly_detection_error", error=str(e), exc_info=True)
            raise AnomalyDetectionError(f"Anomaly detection failed: {e}")

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
