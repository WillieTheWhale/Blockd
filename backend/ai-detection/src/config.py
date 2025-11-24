"""
Configuration management for AI Detection Service
Handles environment variables and application settings
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings"""

    # Application
    APP_NAME: str = "Blockd AI Detection Service"
    APP_VERSION: str = "1.0.0"
    ENV: str = Field(default="development", env="ENV")
    DEBUG: bool = Field(default=False, env="DEBUG")
    HOST: str = Field(default="0.0.0.0", env="HOST")
    PORT: int = Field(default=8005, env="PORT")

    # Database
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/blockd",
        env="DATABASE_URL"
    )
    DB_POOL_SIZE: int = Field(default=10, env="DB_POOL_SIZE")
    DB_MAX_OVERFLOW: int = Field(default=20, env="DB_MAX_OVERFLOW")

    # Redis
    REDIS_HOST: str = Field(default="localhost", env="REDIS_HOST")
    REDIS_PORT: int = Field(default=6379, env="REDIS_PORT")
    REDIS_PASSWORD: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    REDIS_DB: int = Field(default=0, env="REDIS_DB")
    REDIS_CLUSTER_ENABLED: bool = Field(default=False, env="REDIS_CLUSTER_ENABLED")

    # RabbitMQ
    RABBITMQ_HOST: str = Field(default="localhost", env="RABBITMQ_HOST")
    RABBITMQ_PORT: int = Field(default=5672, env="RABBITMQ_PORT")
    RABBITMQ_USER: str = Field(default="guest", env="RABBITMQ_USER")
    RABBITMQ_PASSWORD: str = Field(default="guest", env="RABBITMQ_PASSWORD")
    RABBITMQ_VHOST: str = Field(default="/", env="RABBITMQ_VHOST")

    # OpenAI API
    OPENAI_API_KEY: Optional[str] = Field(default=None, env="OPENAI_API_KEY")
    OPENAI_MODEL: str = Field(default="gpt-4-turbo-2024-04-09", env="OPENAI_MODEL")
    OPENAI_MAX_TOKENS: int = Field(default=500, env="OPENAI_MAX_TOKENS")
    OPENAI_TEMPERATURE: float = Field(default=0.7, env="OPENAI_TEMPERATURE")

    # Anthropic API
    ANTHROPIC_API_KEY: Optional[str] = Field(default=None, env="ANTHROPIC_API_KEY")
    ANTHROPIC_MODEL: str = Field(default="claude-3-5-sonnet-20241022", env="ANTHROPIC_MODEL")
    ANTHROPIC_MAX_TOKENS: int = Field(default=500, env="ANTHROPIC_MAX_TOKENS")

    # Google Generative AI API
    GOOGLE_API_KEY: Optional[str] = Field(default=None, env="GOOGLE_API_KEY")
    GOOGLE_MODEL: str = Field(default="gemini-1.5-pro", env="GOOGLE_MODEL")

    # Model Configuration
    EMBEDDING_MODEL: str = Field(default="sentence-transformers/all-MiniLM-L6-v2", env="EMBEDDING_MODEL")
    EMBEDDING_DIM: int = Field(default=384, env="EMBEDDING_DIM")
    PERPLEXITY_MODEL: str = Field(default="gpt2", env="PERPLEXITY_MODEL")
    XGBOOST_MODEL_PATH: str = Field(
        default="/app/models/xgboost_classifier.json",
        env="XGBOOST_MODEL_PATH"
    )

    # Cache Configuration
    AI_ANSWER_CACHE_TTL: int = Field(default=86400, env="AI_ANSWER_CACHE_TTL")  # 24 hours
    ANALYSIS_CACHE_TTL: int = Field(default=604800, env="ANALYSIS_CACHE_TTL")  # 7 days
    CACHE_PREFIX: str = Field(default="ai_detection", env="CACHE_PREFIX")

    # Detection Thresholds
    RISK_THRESHOLD_CRITICAL: float = Field(default=0.90, env="RISK_THRESHOLD_CRITICAL")
    RISK_THRESHOLD_HIGH: float = Field(default=0.75, env="RISK_THRESHOLD_HIGH")
    RISK_THRESHOLD_MEDIUM: float = Field(default=0.50, env="RISK_THRESHOLD_MEDIUM")
    RISK_THRESHOLD_LOW: float = Field(default=0.30, env="RISK_THRESHOLD_LOW")

    # Similarity Thresholds
    SIMILARITY_THRESHOLD_HIGH: float = Field(default=0.85, env="SIMILARITY_THRESHOLD_HIGH")
    PERPLEXITY_THRESHOLD_LOW: float = Field(default=50.0, env="PERPLEXITY_THRESHOLD_LOW")
    NGRAM_OVERLAP_THRESHOLD: float = Field(default=0.70, env="NGRAM_OVERLAP_THRESHOLD")

    # Performance Configuration
    LLM_TIMEOUT: int = Field(default=30, env="LLM_TIMEOUT")  # seconds
    LLM_MAX_RETRIES: int = Field(default=3, env="LLM_MAX_RETRIES")
    PARALLEL_LLM_CALLS: bool = Field(default=True, env="PARALLEL_LLM_CALLS")

    # Monitoring
    ENABLE_METRICS: bool = Field(default=True, env="ENABLE_METRICS")
    METRICS_PORT: int = Field(default=9090, env="METRICS_PORT")

    # CORS
    CORS_ORIGINS: list = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        env="CORS_ORIGINS"
    )
    CORS_ALLOW_CREDENTIALS: bool = Field(default=True, env="CORS_ALLOW_CREDENTIALS")

    class Config:
        env_file = ".env"
        case_sensitive = True


# Singleton settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get settings singleton"""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# Export for convenience
settings = get_settings()
