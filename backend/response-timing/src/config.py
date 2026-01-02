"""Configuration management for Response Timing Service"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with environment variable support"""

    # Application
    APP_NAME: str = "Response Timing Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8006
    WORKERS: int = 4

    # Database
    DATABASE_URL: str = "postgresql://blockd_app:password@postgres:5432/blockd"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    # RabbitMQ
    RABBITMQ_URL: str = "amqp://guest:guest@rabbitmq:5672/"
    RABBITMQ_EXCHANGE: str = "blockd"
    RABBITMQ_QUEUE_TRANSCRIPTION: str = "transcription_queue"
    RABBITMQ_QUEUE_ANALYSIS: str = "timing_analysis_queue"

    # S3 Storage - Credentials must be provided via environment variables
    S3_ENDPOINT: str = "http://minio:9000"
    S3_ACCESS_KEY: Optional[str] = None  # Required: set S3_ACCESS_KEY env var
    S3_SECRET_KEY: Optional[str] = None  # Required: set S3_SECRET_KEY env var
    S3_BUCKET_AUDIO: str = "blockd-audio"
    S3_REGION: str = "us-east-1"

    # OpenAI Whisper
    OPENAI_API_KEY: Optional[str] = None
    WHISPER_MODEL: str = "whisper-1"
    WHISPER_MODE: str = "api"  # "api" or "local"
    LOCAL_WHISPER_MODEL: str = "base"  # tiny, base, small, medium, large

    # Audio Processing
    AUDIO_SAMPLE_RATE: int = 16000
    AUDIO_MAX_SIZE_MB: int = 25
    AUDIO_FORMATS: list = ["mp3", "wav", "m4a", "flac", "ogg", "webm"]

    # Timing Analysis
    SILENCE_THRESHOLD_DB: float = -40.0
    MIN_SILENCE_DURATION: float = 0.5  # seconds
    MIN_PAUSE_DURATION: float = 0.3  # seconds

    # Filler Words
    FILLER_WORDS: list = [
        "um", "uh", "er", "ah", "like", "you know", "i mean", "basically",
        "actually", "literally", "kind of", "sort of", "right", "okay",
        "well", "so", "hmm", "uhh", "umm", "yeah", "you see"
    ]

    # Expected Response Latencies (milliseconds)
    EXPECTED_LATENCY_SIMPLE: int = 3000
    EXPECTED_LATENCY_ANALYTICAL: int = 8000
    EXPECTED_LATENCY_COMPLEX: int = 15000

    # Normal Speech Rate (WPM)
    SPEECH_RATE_SLOW: int = 80
    SPEECH_RATE_NORMAL_MIN: int = 120
    SPEECH_RATE_NORMAL_MAX: int = 160
    SPEECH_RATE_FAST: int = 200

    # Anomaly Detection Thresholds
    INSTANT_RESPONSE_THRESHOLD: float = 0.5  # fraction of expected latency
    UNNATURAL_CONSISTENCY_THRESHOLD: float = 0.1  # pause duration std dev
    LOW_FILLER_THRESHOLD: float = 0.01  # <1% filler words
    HIGH_FILLER_THRESHOLD: float = 0.15  # >15% filler words
    PAUSE_PERCENTAGE_THRESHOLD: float = 10.0  # <10% pause time

    # Risk Scoring Weights
    RISK_WEIGHT_INSTANT_RESPONSE: float = 0.4
    RISK_WEIGHT_UNNATURAL_CONSISTENCY: float = 0.2
    RISK_WEIGHT_DELAYED_FLUENT: float = 0.3
    RISK_WEIGHT_ROBOTIC_PATTERN: float = 0.25
    RISK_WEIGHT_LOW_FILLER: float = 0.15
    RISK_WEIGHT_HIGH_SPEED: float = 0.2

    # Performance
    TRANSCRIPTION_TIMEOUT: int = 300  # 5 minutes
    ANALYSIS_TIMEOUT: int = 60  # 1 minute
    MAX_CONCURRENT_JOBS: int = 10

    # Caching
    REDIS_URL: Optional[str] = "redis://redis:6379/2"
    CACHE_TTL: int = 3600  # 1 hour

    # Monitoring
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    SENTRY_DSN: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Difficulty mapping
DIFFICULTY_MAP = {
    "simple": "simple",
    "easy": "simple",
    "analytical": "analytical",
    "medium": "analytical",
    "complex": "complex",
    "hard": "complex",
    "expert": "complex"
}


def get_expected_latency(difficulty: str) -> int:
    """Get expected response latency for difficulty level"""
    settings = get_settings()
    difficulty_normalized = DIFFICULTY_MAP.get(difficulty.lower(), "analytical")

    latency_map = {
        "simple": settings.EXPECTED_LATENCY_SIMPLE,
        "analytical": settings.EXPECTED_LATENCY_ANALYTICAL,
        "complex": settings.EXPECTED_LATENCY_COMPLEX
    }

    return latency_map.get(difficulty_normalized, settings.EXPECTED_LATENCY_ANALYTICAL)
