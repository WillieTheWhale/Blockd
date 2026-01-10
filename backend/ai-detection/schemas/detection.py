"""
Detection result schemas
"""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class DetectionFeatures(BaseModel):
    """Features used for detection"""
    max_similarity_score: float = Field(..., description="Maximum cosine similarity")
    avg_similarity_score: float = Field(..., description="Average similarity score")
    gpt4_similarity: Optional[float] = Field(None, description="GPT-4 similarity")
    claude_similarity: Optional[float] = Field(None, description="Claude similarity")
    gemini_similarity: Optional[float] = Field(None, description="Gemini similarity")
    perplexity_score: float = Field(..., description="Perplexity score")
    trigram_overlap: float = Field(..., description="Trigram overlap")
    fourgram_overlap: float = Field(..., description="4-gram overlap")
    vocabulary_richness: float = Field(..., description="Vocabulary richness")
    avg_sentence_length: float = Field(..., description="Average sentence length")
    punctuation_density: float = Field(..., description="Punctuation density")
    response_time_ms: Optional[float] = Field(None, description="Response time")
    gaze_off_screen_percentage: Optional[float] = Field(None, description="Off-screen percentage")
    security_event_count: Optional[int] = Field(None, description="Security events")
    answer_length: int = Field(..., description="Answer character count")

    def to_feature_vector(self) -> List[float]:
        """Convert to feature vector for XGBoost"""
        return [
            self.max_similarity_score,
            self.avg_similarity_score,
            self.gpt4_similarity or 0.0,
            self.claude_similarity or 0.0,
            self.gemini_similarity or 0.0,
            self.perplexity_score,
            self.trigram_overlap,
            self.fourgram_overlap,
            self.vocabulary_richness,
            self.avg_sentence_length,
            self.punctuation_density,
            self.response_time_ms or 0.0,
            self.gaze_off_screen_percentage or 0.0,
            float(self.security_event_count or 0),
            float(self.answer_length)
        ]


class CacheStatus(BaseModel):
    """Cache operation status"""
    cached: bool = Field(..., description="Whether result was cached")
    cache_key: Optional[str] = Field(None, description="Cache key used")
    ttl: Optional[int] = Field(None, description="Time to live in seconds")


class CircuitBreakerStats(BaseModel):
    """Circuit breaker statistics"""
    total_calls: int = Field(0, description="Total number of calls")
    successful_calls: int = Field(0, description="Number of successful calls")
    failed_calls: int = Field(0, description="Number of failed calls")
    rejected_calls: int = Field(0, description="Number of rejected calls (circuit open)")
    consecutive_failures: int = Field(0, description="Current consecutive failure count")
    consecutive_successes: int = Field(0, description="Current consecutive success count")
    last_failure_time: Optional[float] = Field(None, description="Unix timestamp of last failure")
    last_success_time: Optional[float] = Field(None, description="Unix timestamp of last success")


class CircuitBreakerStatus(BaseModel):
    """Circuit breaker status for an LLM provider"""
    name: str = Field(..., description="Circuit breaker name")
    state: str = Field(..., description="Current state: closed, open, half_open")
    stats: CircuitBreakerStats = Field(default_factory=CircuitBreakerStats, description="Statistics")
    config: Dict[str, Any] = Field(default_factory=dict, description="Configuration")


class HealthCheckResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Service version")
    timestamp: str = Field(..., description="Current timestamp")
    dependencies: Dict[str, str] = Field(default_factory=dict, description="Dependency statuses")
    models_loaded: Dict[str, bool] = Field(default_factory=dict, description="Model loading status")
    circuit_breakers: Dict[str, Any] = Field(default_factory=dict, description="LLM circuit breaker status")
