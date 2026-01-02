"""Pydantic schemas for analysis requests and responses"""

from typing import List, Dict, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, HttpUrl


class AnalysisRequest(BaseModel):
    """Request schema for audio analysis"""

    question_id: UUID = Field(..., description="UUID of the question")
    audio_url: str = Field(..., description="S3 URL of audio file")
    question_asked_at: datetime = Field(..., description="Timestamp when question was asked")
    answer_start_timestamp: datetime = Field(..., description="Timestamp when answer started")
    difficulty: str = Field(
        ...,
        description="Question difficulty: simple, analytical, or complex"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "question_id": "550e8400-e29b-41d4-a716-446655440000",
                "audio_url": "s3://blockd-audio/sessions/session123/answer456.mp3",
                "question_asked_at": "2025-11-24T10:30:00Z",
                "answer_start_timestamp": "2025-11-24T10:30:05Z",
                "difficulty": "analytical"
            }
        }


class WordTimestamp(BaseModel):
    """Word-level timestamp from transcription"""

    word: str
    start: float
    end: float
    confidence: float = 1.0


class TranscriptionResult(BaseModel):
    """Transcription result with confidence"""

    text: str = Field(..., description="Transcribed text")
    confidence: float = Field(..., description="Overall transcription confidence (0-1)")
    words: List[WordTimestamp] = Field(
        default_factory=list,
        description="Word-level timestamps (limited to first 100 in response)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Well, I think the answer to this question involves...",
                "confidence": 0.95,
                "words": [
                    {"word": "Well", "start": 0.0, "end": 0.3, "confidence": 0.98},
                    {"word": "I", "start": 0.4, "end": 0.5, "confidence": 0.99}
                ]
            }
        }


class TimingMetrics(BaseModel):
    """Response timing metrics"""

    response_latency_ms: int = Field(..., description="Time from question to answer (ms)")
    speech_duration_seconds: float = Field(..., description="Actual speech duration (excluding pauses)")
    total_duration_seconds: float = Field(..., description="Total audio duration")
    speech_rate_wpm: float = Field(..., description="Speech rate in words per minute")
    pause_count: int = Field(..., description="Number of pauses detected")
    pause_percentage: float = Field(..., description="Percentage of time spent in pauses")
    avg_pause_duration_seconds: float = Field(..., description="Average pause duration")
    filler_word_count: int = Field(..., description="Number of filler words detected")
    filler_word_ratio: float = Field(..., description="Ratio of filler words to total words")

    class Config:
        json_schema_extra = {
            "example": {
                "response_latency_ms": 4500,
                "speech_duration_seconds": 45.2,
                "total_duration_seconds": 52.8,
                "speech_rate_wpm": 145.3,
                "pause_count": 8,
                "pause_percentage": 14.4,
                "avg_pause_duration_seconds": 0.95,
                "filler_word_count": 6,
                "filler_word_ratio": 0.035
            }
        }


class AnomalyResult(BaseModel):
    """Detected timing anomalies"""

    instant_response: bool = Field(..., description="Suspiciously fast response")
    unnatural_consistency: bool = Field(..., description="Unnatural consistency in timing")
    delayed_then_fluent: bool = Field(..., description="Long delay then fluent speech")
    robotic_speech_pattern: bool = Field(..., description="Robotic or TTS-like pattern")

    class Config:
        json_schema_extra = {
            "example": {
                "instant_response": False,
                "unnatural_consistency": False,
                "delayed_then_fluent": False,
                "robotic_speech_pattern": False
            }
        }


class AnalysisResponse(BaseModel):
    """Complete analysis response"""

    analysis_id: UUID = Field(..., description="Unique analysis ID")
    transcription: TranscriptionResult = Field(..., description="Transcription results")
    timing_metrics: TimingMetrics = Field(..., description="Timing analysis metrics")
    anomalies: AnomalyResult = Field(..., description="Detected anomalies")
    risk_score: float = Field(..., description="Overall risk score (0-1)")
    recommendation: str = Field(..., description="Recommended action")

    class Config:
        json_schema_extra = {
            "example": {
                "analysis_id": "660e8400-e29b-41d4-a716-446655440001",
                "transcription": {
                    "text": "Well, I think the answer involves...",
                    "confidence": 0.95,
                    "words": []
                },
                "timing_metrics": {
                    "response_latency_ms": 4500,
                    "speech_duration_seconds": 45.2,
                    "total_duration_seconds": 52.8,
                    "speech_rate_wpm": 145.3,
                    "pause_count": 8,
                    "pause_percentage": 14.4,
                    "avg_pause_duration_seconds": 0.95,
                    "filler_word_count": 6,
                    "filler_word_ratio": 0.035
                },
                "anomalies": {
                    "instant_response": False,
                    "unnatural_consistency": False,
                    "delayed_then_fluent": False,
                    "robotic_speech_pattern": False
                },
                "risk_score": 0.15,
                "recommendation": "Timing patterns appear natural"
            }
        }
