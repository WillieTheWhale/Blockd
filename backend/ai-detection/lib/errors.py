"""
Custom exceptions for AI Detection Service
"""
from typing import Any, Dict, Optional


class AIDetectionError(Exception):
    """Base exception for AI Detection Service"""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_code: str = "INTERNAL_ERROR",
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


class LLMServiceError(AIDetectionError):
    """LLM service communication error"""

    def __init__(self, message: str, model: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"LLM Service Error ({model}): {message}",
            status_code=503,
            error_code="LLM_SERVICE_ERROR",
            details={**(details or {}), "model": model},
        )


class ModelLoadError(AIDetectionError):
    """ML model loading error"""

    def __init__(self, message: str, model_name: str):
        super().__init__(
            message=f"Model Load Error: {message}",
            status_code=500,
            error_code="MODEL_LOAD_ERROR",
            details={"model_name": model_name},
        )


class CacheError(AIDetectionError):
    """Cache operation error"""

    def __init__(self, message: str, operation: str):
        super().__init__(
            message=f"Cache Error ({operation}): {message}",
            status_code=500,
            error_code="CACHE_ERROR",
            details={"operation": operation},
        )


class DatabaseError(AIDetectionError):
    """Database operation error"""

    def __init__(self, message: str, operation: str):
        super().__init__(
            message=f"Database Error ({operation}): {message}",
            status_code=500,
            error_code="DATABASE_ERROR",
            details={"operation": operation},
        )


class ValidationError(AIDetectionError):
    """Request validation error"""

    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="VALIDATION_ERROR",
            details={"field": field} if field else {},
        )


class NotFoundError(AIDetectionError):
    """Resource not found error"""

    def __init__(self, resource: str, identifier: str):
        super().__init__(
            message=f"{resource} not found: {identifier}",
            status_code=404,
            error_code="NOT_FOUND",
            details={"resource": resource, "identifier": identifier},
        )


class RateLimitError(AIDetectionError):
    """Rate limit exceeded error"""

    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(
            message=message,
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
        )


class EmbeddingError(AIDetectionError):
    """Embedding generation error"""

    def __init__(self, message: str):
        super().__init__(
            message=f"Embedding Error: {message}",
            status_code=500,
            error_code="EMBEDDING_ERROR",
        )


class PerplexityError(AIDetectionError):
    """Perplexity calculation error"""

    def __init__(self, message: str):
        super().__init__(
            message=f"Perplexity Error: {message}",
            status_code=500,
            error_code="PERPLEXITY_ERROR",
        )


class XGBoostError(AIDetectionError):
    """XGBoost prediction error"""

    def __init__(self, message: str):
        super().__init__(
            message=f"XGBoost Error: {message}",
            status_code=500,
            error_code="XGBOOST_ERROR",
        )
