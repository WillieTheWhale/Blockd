"""Configuration management for authentication service.

This module handles environment-based configuration for the auth service,
including security settings, database connections, and service parameters.
"""

import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class AuthConfig(BaseSettings):
    """Authentication service configuration."""

    # Service Configuration
    service_name: str = "blockd-auth-service"
    service_host: str = Field(default="0.0.0.0", env="AUTH_SERVICE_HOST")
    service_port: int = Field(default=8001, env="AUTH_SERVICE_PORT")
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")

    # JWT Configuration
    jwt_secret: str = Field(
        default="change-this-in-production-use-strong-random-secret",
        env="JWT_SECRET"
    )
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(
        default=60,
        env="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    jwt_refresh_token_expire_days: int = Field(
        default=7,
        env="JWT_REFRESH_TOKEN_EXPIRE_DAYS"
    )

    # Database Configuration
    db_host: str = Field(default="localhost", env="DB_HOST")
    db_port: int = Field(default=5432, env="DB_PORT")
    db_name: str = Field(default="blockd_db", env="DB_NAME")
    db_user: str = Field(default="blockd", env="DB_USER")
    db_password: str = Field(default="password", env="DB_PASSWORD")
    db_min_connections: int = Field(default=1, env="DB_MIN_CONNECTIONS")
    db_max_connections: int = Field(default=20, env="DB_MAX_CONNECTIONS")

    # CORS Configuration
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        env="CORS_ORIGINS"
    )
    cors_allow_credentials: bool = Field(default=True, env="CORS_ALLOW_CREDENTIALS")
    cors_allow_methods: List[str] = Field(
        default=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        env="CORS_ALLOW_METHODS"
    )
    cors_allow_headers: List[str] = Field(
        default=["*"],
        env="CORS_ALLOW_HEADERS"
    )

    # Security Configuration
    password_min_length: int = Field(default=8, env="PASSWORD_MIN_LENGTH")
    password_max_length: int = Field(default=100, env="PASSWORD_MAX_LENGTH")
    bcrypt_rounds: int = Field(default=12, env="BCRYPT_ROUNDS")
    session_token_length: int = Field(default=32, env="SESSION_TOKEN_LENGTH")

    # Rate Limiting
    rate_limit_enabled: bool = Field(default=True, env="RATE_LIMIT_ENABLED")
    rate_limit_requests: int = Field(default=100, env="RATE_LIMIT_REQUESTS")
    rate_limit_window: int = Field(default=60, env="RATE_LIMIT_WINDOW")

    # Logging
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    log_format: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        env="LOG_FORMAT"
    )

    class Config:
        """Pydantic configuration."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment.lower() in ["production", "prod"]

    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.environment.lower() in ["development", "dev"]

    def get_database_url(self) -> str:
        """Get PostgreSQL connection URL."""
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


# Global configuration instance
config = AuthConfig()
