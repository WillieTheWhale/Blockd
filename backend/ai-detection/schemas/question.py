"""
Question analysis request and response schemas
"""
from typing import Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class QuestionAnalysisRequest(BaseModel):
    """Request to analyze a question and generate AI answers"""
    question_text: str = Field(..., min_length=10, max_length=5000, description="Interview question text")
    difficulty: str = Field(default="medium", description="Question difficulty: simple, analytical, complex")
    session_id: UUID = Field(..., description="Interview session ID")

    class Config:
        json_schema_extra = {
            "example": {
                "question_text": "Explain the difference between process and thread in operating systems.",
                "difficulty": "medium",
                "session_id": "123e4567-e89b-12d3-a456-426614174000"
            }
        }


class AIAnswerData(BaseModel):
    """AI-generated answer data"""
    answer: str = Field(..., description="Generated answer text")
    embedding: List[float] = Field(..., description="384-dimensional embedding vector")
    perplexity: float = Field(..., description="Perplexity score of the answer")
    token_count: Optional[int] = Field(None, description="Number of tokens in answer")


class QuestionAnalysisResponse(BaseModel):
    """Response containing AI-generated answers"""
    question_id: Optional[UUID] = Field(None, description="Question ID from database")
    question_hash: str = Field(..., description="SHA-256 hash of question")
    ai_answers: Dict[str, AIAnswerData] = Field(..., description="AI answers by model name")
    cached: bool = Field(..., description="Whether answers were retrieved from cache")
    processing_time_ms: Optional[float] = Field(None, description="Processing time in milliseconds")

    class Config:
        json_schema_extra = {
            "example": {
                "question_id": "123e4567-e89b-12d3-a456-426614174000",
                "question_hash": "a1b2c3d4e5f6...",
                "ai_answers": {
                    "gpt-4": {
                        "answer": "A process is an independent program in execution...",
                        "embedding": [0.123, -0.456, ...],
                        "perplexity": 45.6,
                        "token_count": 150
                    }
                },
                "cached": False,
                "processing_time_ms": 4523.45
            }
        }
