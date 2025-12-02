"""
Video Processing Service Configuration
Manages all configuration settings for WebRTC, FFmpeg, and S3
"""

import os
from typing import List, Dict, Any
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings with environment variable support"""

    # Service Configuration
    SERVICE_NAME: str = "video-processing-service"
    SERVICE_VERSION: str = "1.0.0"
    ENVIRONMENT: str = Field(default="development", env="ENVIRONMENT")
    DEBUG: bool = Field(default=False, env="DEBUG")

    # API Configuration
    API_HOST: str = Field(default="0.0.0.0", env="API_HOST")
    API_PORT: int = Field(default=8003, env="API_PORT")
    API_PREFIX: str = "/api/v1"

    # mediasoup Node.js Bridge
    MEDIASOUP_HOST: str = Field(default="localhost", env="MEDIASOUP_HOST")
    MEDIASOUP_PORT: int = Field(default=3000, env="MEDIASOUP_PORT")
    MEDIASOUP_URL: str = Field(default="http://localhost:3000", env="MEDIASOUP_URL")

    # WebRTC Configuration
    RTC_MIN_PORT: int = Field(default=10000, env="RTC_MIN_PORT")
    RTC_MAX_PORT: int = Field(default=10100, env="RTC_MAX_PORT")
    ANNOUNCED_IP: str = Field(default="127.0.0.1", env="ANNOUNCED_IP")

    # FFmpeg Configuration
    FFMPEG_PATH: str = Field(default="/usr/bin/ffmpeg", env="FFMPEG_PATH")
    RECORDING_PATH: str = Field(default="/tmp/recordings", env="RECORDING_PATH")
    FFMPEG_LOG_LEVEL: str = Field(default="error", env="FFMPEG_LOG_LEVEL")

    # Video Encoding Settings
    DEFAULT_VIDEO_CODEC: str = "libx264"
    DEFAULT_AUDIO_CODEC: str = "aac"
    DEFAULT_VIDEO_BITRATE: str = "2000k"
    DEFAULT_AUDIO_BITRATE: str = "128k"
    DEFAULT_PRESET: str = "veryfast"

    # Adaptive Bitrate Resolutions
    ABR_RESOLUTIONS: List[Dict[str, Any]] = [
        {"name": "240p", "height": 240, "bitrate": "400k", "maxrate": "500k"},
        {"name": "360p", "height": 360, "bitrate": "800k", "maxrate": "1000k"},
        {"name": "480p", "height": 480, "bitrate": "1200k", "maxrate": "1500k"},
        {"name": "720p", "height": 720, "bitrate": "2500k", "maxrate": "3000k"},
    ]

    # S3 Configuration
    S3_ENDPOINT: str = Field(default="", env="S3_ENDPOINT")
    S3_ACCESS_KEY: str = Field(default="", env="S3_ACCESS_KEY")
    S3_SECRET_KEY: str = Field(default="", env="S3_SECRET_KEY")
    S3_BUCKET: str = Field(default="blockd-recordings", env="S3_BUCKET")
    S3_REGION: str = Field(default="us-east-1", env="S3_REGION")
    S3_USE_SSL: bool = Field(default=True, env="S3_USE_SSL")
    SIGNED_URL_EXPIRY: int = Field(default=604800, env="SIGNED_URL_EXPIRY")  # 7 days
    S3_ENABLED: bool = Field(default=False, env="S3_ENABLED")  # Set to True when S3 is configured

    # RabbitMQ Configuration
    RABBITMQ_HOST: str = Field(default="localhost", env="RABBITMQ_HOST")
    RABBITMQ_PORT: int = Field(default=5672, env="RABBITMQ_PORT")
    RABBITMQ_USER: str = Field(default="guest", env="RABBITMQ_USER")
    RABBITMQ_PASSWORD: str = Field(default="guest", env="RABBITMQ_PASSWORD")
    RABBITMQ_VHOST: str = Field(default="/", env="RABBITMQ_VHOST")
    VIDEO_PROCESSING_EXCHANGE: str = "video_processing"
    VIDEO_PROCESSING_QUEUE: str = "video_processing_queue"

    # Database Configuration (for session metadata)
    DATABASE_URL: str = Field(
        default="postgresql://blockd:blockd@localhost:5432/blockd",
        env="DATABASE_URL"
    )

    # Redis Configuration (for session state)
    REDIS_HOST: str = Field(default="localhost", env="REDIS_HOST")
    REDIS_PORT: int = Field(default=6379, env="REDIS_PORT")
    REDIS_DB: int = Field(default=0, env="REDIS_DB")
    REDIS_PASSWORD: str = Field(default="", env="REDIS_PASSWORD")

    # Performance Settings
    MAX_CONCURRENT_STREAMS: int = Field(default=100, env="MAX_CONCURRENT_STREAMS")
    MAX_RECORDING_DURATION: int = Field(default=7200, env="MAX_RECORDING_DURATION")  # 2 hours
    RECORDING_BUFFER_SIZE: int = Field(default=5000, env="RECORDING_BUFFER_SIZE")  # KB

    # Cleanup Settings
    TEMP_FILE_RETENTION: int = Field(default=3600, env="TEMP_FILE_RETENTION")  # 1 hour
    AUTO_CLEANUP_ENABLED: bool = Field(default=True, env="AUTO_CLEANUP_ENABLED")

    # Monitoring
    ENABLE_METRICS: bool = Field(default=True, env="ENABLE_METRICS")
    METRICS_PORT: int = Field(default=9090, env="METRICS_PORT")

    # CORS Settings
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080"
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def rabbitmq_url(self) -> str:
        """Construct RabbitMQ connection URL"""
        return (
            f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}@"
            f"{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}/{self.RABBITMQ_VHOST}"
        )

    @property
    def redis_url(self) -> str:
        """Construct Redis connection URL"""
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"


# Global settings instance
settings = Settings()
