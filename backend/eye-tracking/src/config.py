"""
Eye Tracking Service Configuration
Handles environment variables and application settings
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Service Info
    SERVICE_NAME: str = "eye-tracking-service"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8006
    WORKERS: int = 4

    # Database Configuration (TimescaleDB)
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/blockd"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    DB_POOL_TIMEOUT: int = 30

    # RabbitMQ Configuration
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672/"
    GAZE_QUEUE_NAME: str = "gaze_processing_queue"
    GAZE_EXCHANGE_NAME: str = "gaze_events"

    # WebSocket Configuration
    WEBSOCKET_URL: str = "ws://localhost:8005"
    WEBSOCKET_PATH: str = "/ws"

    # MediaPipe Configuration
    MEDIAPIPE_MAX_NUM_FACES: int = 1
    MEDIAPIPE_REFINE_LANDMARKS: bool = True
    MEDIAPIPE_MIN_DETECTION_CONFIDENCE: float = 0.5
    MEDIAPIPE_MIN_TRACKING_CONFIDENCE: float = 0.5
    MEDIAPIPE_STATIC_IMAGE_MODE: bool = False

    # Gaze Estimation Configuration
    GAZE_FRAME_WIDTH: int = 1920
    GAZE_FRAME_HEIGHT: int = 1080
    GAZE_FOCAL_LENGTH: float = 1000.0  # Pixels
    GAZE_CONFIDENCE_THRESHOLD: float = 0.7

    # Kalman Filter Configuration
    KALMAN_PROCESS_NOISE: float = 0.01
    KALMAN_MEASUREMENT_NOISE: float = 0.05
    KALMAN_DT: float = 0.033  # 30 FPS = 33ms

    # Pattern Recognition Configuration
    READING_SACCADE_VELOCITY_THRESHOLD: float = 500.0  # px/s
    READING_MIN_HORIZONTAL_SACCADES: int = 10
    READING_MIN_LINE_BREAKS: int = 2
    READING_TIME_WINDOW: float = 5.0  # seconds

    ATTENTION_DRIFT_THRESHOLD: float = 10.0  # seconds
    SHIFTY_EYES_DIRECTION_THRESHOLD: int = 5
    SHIFTY_EYES_TIME_WINDOW: float = 30.0  # seconds

    # LSTM Anomaly Detection Configuration
    LSTM_SEQUENCE_LENGTH: int = 30
    LSTM_FEATURES: int = 2
    LSTM_BATCH_SIZE: int = 32
    LSTM_EPOCHS: int = 50
    LSTM_ANOMALY_THRESHOLD: float = 0.05
    LSTM_MODEL_PATH: str = "/app/models/lstm_autoencoder.h5"

    # Heatmap Configuration
    HEATMAP_WIDTH: int = 1920
    HEATMAP_HEIGHT: int = 1080
    HEATMAP_GAUSSIAN_SIGMA: int = 50
    HEATMAP_KERNEL_SIZE: int = 101
    HEATMAP_OUTPUT_DIR: str = "/app/data/heatmaps"

    # Performance Configuration
    MAX_FPS: int = 30
    FRAME_PROCESSING_TIMEOUT: float = 0.050  # 50ms
    MAX_GAZE_BUFFER_SIZE: int = 1000
    DB_THREAD_POOL_WORKERS: int = 4  # Thread pool workers for async DB operations

    # Risk Score Weights
    RISK_OFFSCREEN_WEIGHT_SEVERE: float = 0.3  # <70% on-screen
    RISK_OFFSCREEN_WEIGHT_MODERATE: float = 0.1  # <85% on-screen
    RISK_READING_WEIGHT: float = 0.4
    RISK_DRIFT_WEIGHT: float = 0.2
    RISK_SHIFTY_WEIGHT: float = 0.3
    RISK_ANOMALY_WEIGHT_PER_EVENT: float = 0.05
    RISK_ANOMALY_MAX_WEIGHT: float = 0.3

    # Storage Configuration
    GAZE_DATA_RETENTION_DAYS: int = 90
    SESSION_SUMMARY_CACHE_HOURS: int = 24

    # CORS Configuration
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:8000",
        "https://blockd.io"
    ]

    # JWT Configuration (for authentication with other services)
    # Use RS256 with public key for verification (no private key needed for verification-only)
    JWT_PUBLIC_KEY_PATH: Optional[str] = None  # Path to public.pem for JWT verification
    JWT_ALGORITHM: str = "RS256"  # Use asymmetric RS256 for production security

    # Logging Configuration
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Dependency for FastAPI to inject settings"""
    return settings


# Eye landmark indices from MediaPipe FaceMesh
EYE_LANDMARKS = {
    "left_eye_outline": [33, 133, 160, 159, 158, 144, 145, 153],
    "right_eye_outline": [362, 263, 387, 386, 385, 373, 374, 380],
    "left_iris": [468, 469, 470, 471, 472],
    "right_iris": [473, 474, 475, 476, 477],
    "left_eye_top": 159,
    "left_eye_bottom": 145,
    "left_eye_left": 133,
    "left_eye_right": 33,
    "right_eye_top": 386,
    "right_eye_bottom": 374,
    "right_eye_left": 362,
    "right_eye_right": 263
}


# Head pose estimation landmark indices
HEAD_POSE_LANDMARKS = {
    "nose_tip": 1,
    "chin": 152,
    "left_eye_corner": 33,
    "right_eye_corner": 263,
    "left_mouth_corner": 61,
    "right_mouth_corner": 291
}
