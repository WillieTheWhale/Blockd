"""
Answer analysis request and response schemas
"""
from typing import Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class GazeData(BaseModel):
    """Gaze tracking data"""
    off_screen_percentage: Optional[float] = Field(None, ge=0, le=100, description="Percentage of time off-screen")
    off_screen_events: Optional[int] = Field(None, ge=0, description="Number of off-screen events")
    avg_confidence: Optional[float] = Field(None, ge=0, le=1, description="Average gaze tracking confidence")


class AnswerAnalysisRequest(BaseModel):
    """Request to analyze an answer for AI detection"""
    question_id: UUID = Field(..., description="Question ID")
    answer_text: str = Field(..., min_length=1, max_length=10000, description="User's answer text")
    response_time_ms: Optional[int] = Field(None, ge=0, description="Response time in milliseconds")
    gaze_data: Optional[GazeData] = Field(None, description="Eye tracking data")
    audio_url: Optional[str] = Field(None, description="Audio recording URL")

    class Config:
        json_schema_extra = {
            "example": {
                "question_id": "123e4567-e89b-12d3-a456-426614174000",
                "answer_text": "A process is a program in execution with its own memory space...",
                "response_time_ms": 45000,
                "gaze_data": {
                    "off_screen_percentage": 15.5,
                    "off_screen_events": 3,
                    "avg_confidence": 0.92
                },
                "audio_url": "https://storage.example.com/audio/session123.wav"
            }
        }


class SimilarityScores(BaseModel):
    """Similarity scores to AI models"""
    gpt4: Optional[float] = Field(None, alias="gpt-4", ge=0, le=1)
    claude: Optional[float] = Field(None, alias="claude-3.5-sonnet", ge=0, le=1)
    gemini: Optional[float] = Field(None, alias="gemini-1.5-pro", ge=0, le=1)
    max: float = Field(..., ge=0, le=1, description="Maximum similarity score")
    avg: float = Field(..., ge=0, le=1, description="Average similarity score")

    class Config:
        populate_by_name = True


class NgramOverlap(BaseModel):
    """N-gram overlap scores"""
    trigram: float = Field(..., ge=0, le=1, description="Trigram overlap score")
    fourgram: float = Field(..., ge=0, le=1, description="4-gram overlap score")


class StylometricAnalysis(BaseModel):
    """Stylometric analysis results"""
    vocabulary_richness: float = Field(..., ge=0, le=1, description="Vocabulary richness score")
    avg_sentence_length: float = Field(..., ge=0, description="Average sentence length in words")
    punctuation_density: float = Field(..., ge=0, le=1, description="Punctuation density")
    capitalization_ratio: Optional[float] = Field(None, ge=0, le=1, description="Capitalization ratio")
    filler_word_ratio: Optional[float] = Field(None, ge=0, le=1, description="Filler word ratio")


class AnswerAnalysisResponse(BaseModel):
    """Response containing AI detection analysis"""
    analysis_id: UUID = Field(..., description="Analysis result ID")
    risk_score: float = Field(..., ge=0, le=1, description="Overall risk score (0-1)")
    risk_level: str = Field(..., description="Risk level: minimal, low, medium, high, critical")
    confidence: float = Field(..., ge=0, le=1, description="Confidence in detection")
    similarity_scores: SimilarityScores = Field(..., description="Similarity to AI models")
    perplexity_score: float = Field(..., ge=0, description="Perplexity score of answer")
    ngram_overlap: NgramOverlap = Field(..., description="N-gram overlap with AI answers")
    stylometric_analysis: StylometricAnalysis = Field(..., description="Stylometric features")
    flags: List[str] = Field(default_factory=list, description="Detected warning flags")
    recommendation: str = Field(..., description="Action recommendation")
    processing_time_ms: Optional[float] = Field(None, description="Processing time in milliseconds")

    class Config:
        json_schema_extra = {
            "example": {
                "analysis_id": "456e7890-e89b-12d3-a456-426614174000",
                "risk_score": 0.78,
                "risk_level": "high",
                "confidence": 0.89,
                "similarity_scores": {
                    "gpt-4": 0.87,
                    "claude-3.5-sonnet": 0.82,
                    "gemini-1.5-pro": 0.75,
                    "max": 0.87,
                    "avg": 0.813
                },
                "perplexity_score": 32.5,
                "ngram_overlap": {
                    "trigram": 0.68,
                    "fourgram": 0.52
                },
                "stylometric_analysis": {
                    "vocabulary_richness": 0.45,
                    "avg_sentence_length": 18.5,
                    "punctuation_density": 0.08,
                    "capitalization_ratio": 0.12,
                    "filler_word_ratio": 0.02
                },
                "flags": [
                    "high_similarity_gpt4",
                    "low_perplexity",
                    "high_ngram_overlap"
                ],
                "recommendation": "Manual review recommended - high likelihood of AI assistance",
                "processing_time_ms": 2345.67
            }
        }
