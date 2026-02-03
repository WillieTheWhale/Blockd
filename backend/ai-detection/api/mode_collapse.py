"""
Mode Collapse Detection API Endpoints
Handles interviewer audio transcription processing and mode collapse analysis
"""
import logging
import time
from typing import Dict, List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from services.mode_collapse_service import (
    get_mode_collapse_service,
    ModeCollapseResult
)
from lib.errors import AIDetectionError

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Schemas
# =============================================================================

class InterviewerAudioRequest(BaseModel):
    """Request to process interviewer audio transcription"""
    session_id: UUID = Field(..., description="Interview session ID")
    transcription_text: str = Field(
        ...,
        min_length=1,
        max_length=50000,
        description="Transcribed text from interviewer audio"
    )
    audio_start_time: float = Field(
        default=0.0,
        ge=0,
        description="Start time of audio chunk in seconds"
    )
    audio_end_time: float = Field(
        default=0.0,
        ge=0,
        description="End time of audio chunk in seconds"
    )
    chunk_index: int = Field(
        default=0,
        ge=0,
        description="Index of this audio chunk in the session"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "123e4567-e89b-12d3-a456-426614174000",
                "transcription_text": "Tell me about a time when you had to work under pressure. How did you handle it?",
                "audio_start_time": 120.5,
                "audio_end_time": 135.2,
                "chunk_index": 5
            }
        }


class DetectedQuestion(BaseModel):
    """Information about a detected question"""
    question_id: str = Field(..., description="Unique question ID")
    question_text: str = Field(..., description="Detected question text")
    is_new: bool = Field(..., description="Whether this is a newly detected question")
    confidence: float = Field(..., description="Detection confidence (0-1)")
    ai_answers_available: bool = Field(..., description="Whether AI answers are cached")
    ai_models_used: Optional[List[str]] = Field(
        None,
        description="List of AI models used to generate answers (for new questions)"
    )


class InterviewerAudioResponse(BaseModel):
    """Response from processing interviewer audio"""
    session_id: str = Field(..., description="Interview session ID")
    transcription_length: int = Field(..., description="Length of transcription text")
    questions_detected: int = Field(..., description="Number of questions detected")
    questions: List[DetectedQuestion] = Field(
        ...,
        description="List of detected questions"
    )
    new_questions_count: int = Field(..., description="Number of new questions")
    ai_answers_generated: int = Field(
        ...,
        description="Total number of AI answers generated"
    )
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class ModeCollapseAnalysisRequest(BaseModel):
    """Request to analyze an answer for mode collapse"""
    session_id: UUID = Field(..., description="Interview session ID")
    question_text: str = Field(
        ...,
        min_length=10,
        max_length=5000,
        description="The interview question"
    )
    user_answer: str = Field(
        ...,
        min_length=10,
        max_length=20000,
        description="The user's answer to analyze"
    )
    question_id: Optional[str] = Field(
        None,
        description="Optional existing question ID for faster lookup"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "123e4567-e89b-12d3-a456-426614174000",
                "question_text": "Explain the difference between process and thread in operating systems.",
                "user_answer": "A process is an independent program in execution with its own memory space. A thread is a lightweight unit of execution within a process that shares the process's memory. Threads are more efficient for communication since they share memory, while processes are more isolated and secure."
            }
        }


class SimilarityScores(BaseModel):
    """Similarity scores to AI models"""
    scores: Dict[str, float] = Field(
        ...,
        description="Model name to similarity score mapping"
    )
    max_score: float = Field(..., description="Maximum similarity score")
    avg_score: float = Field(..., description="Average similarity score")
    most_similar_model: str = Field(..., description="Name of most similar model")


class ModeCollapseAnalysisResponse(BaseModel):
    """Response from mode collapse analysis"""
    question_id: str = Field(..., description="Question ID")
    question_text: str = Field(..., description="The analyzed question")
    similarity: SimilarityScores = Field(..., description="Similarity scores")
    risk_score: float = Field(..., ge=0, le=1, description="Risk score (0-1)")
    risk_level: str = Field(
        ...,
        description="Risk level: minimal, low, medium, high, critical"
    )
    is_mode_collapse_suspected: bool = Field(
        ...,
        description="Whether mode collapse is suspected"
    )
    flags: List[str] = Field(..., description="Warning flags")
    recommendation: str = Field(..., description="Recommendation text")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class ServiceStatsResponse(BaseModel):
    """Service statistics response"""
    cached_questions: int = Field(..., description="Number of cached questions")
    llm_circuit_status: Dict = Field(..., description="LLM circuit breaker status")


# =============================================================================
# API Endpoints
# =============================================================================

@router.post(
    "/interviewer-audio",
    response_model=InterviewerAudioResponse,
    summary="Process interviewer audio transcription",
    description="""
    Process transcribed interviewer audio to detect questions and generate AI answers.

    This endpoint:
    1. Extracts questions from the transcription using heuristic detection
    2. Checks if questions already exist in the global database
    3. For new questions, generates answers from multiple AI models (GPT-5.2, Claude Opus 4.5, Gemini 3 Pro)
    4. Caches questions and AI answers for later mode collapse analysis

    Use this endpoint to continuously feed interviewer audio transcriptions during an interview session.
    """
)
async def process_interviewer_audio(
    request: InterviewerAudioRequest,
    background_tasks: BackgroundTasks
) -> InterviewerAudioResponse:
    """Process interviewer audio transcription and detect questions"""
    start_time = time.time()

    try:
        service = get_mode_collapse_service()

        result = await service.process_interviewer_audio(
            session_id=str(request.session_id),
            transcription_text=request.transcription_text,
            audio_start_time=request.audio_start_time,
            audio_end_time=request.audio_end_time
        )

        processing_time_ms = (time.time() - start_time) * 1000

        # Convert questions to response model
        questions = [
            DetectedQuestion(
                question_id=q["question_id"],
                question_text=q["question_text"],
                is_new=q["is_new"],
                confidence=q["confidence"],
                ai_answers_available=q["ai_answers_available"],
                ai_models_used=q.get("ai_models_used")
            )
            for q in result["questions"]
        ]

        return InterviewerAudioResponse(
            session_id=result["session_id"],
            transcription_length=result["transcription_length"],
            questions_detected=result["questions_detected"],
            questions=questions,
            new_questions_count=result["new_questions_count"],
            ai_answers_generated=result["ai_answers_generated"],
            processing_time_ms=processing_time_ms
        )

    except AIDetectionError as e:
        logger.error(f"AI Detection error: {e}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Unexpected error processing interviewer audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/analyze",
    response_model=ModeCollapseAnalysisResponse,
    summary="Analyze answer for mode collapse",
    description="""
    Analyze a user's answer for mode collapse (high similarity to AI-generated answers).

    This endpoint:
    1. Retrieves or generates AI answers for the question
    2. Calculates semantic similarity between user answer and AI answers
    3. Determines risk level based on similarity scores
    4. Returns analysis with flags and recommendations

    Use this endpoint to check if an interviewee's answer appears to be AI-generated.
    """
)
async def analyze_mode_collapse(
    request: ModeCollapseAnalysisRequest
) -> ModeCollapseAnalysisResponse:
    """Analyze an answer for mode collapse detection"""
    start_time = time.time()

    try:
        service = get_mode_collapse_service()

        result: ModeCollapseResult = await service.analyze_user_answer(
            question_text=request.question_text,
            user_answer=request.user_answer,
            question_id=request.question_id
        )

        processing_time_ms = (time.time() - start_time) * 1000

        return ModeCollapseAnalysisResponse(
            question_id=result.question_id,
            question_text=result.question_text,
            similarity=SimilarityScores(
                scores=result.similarity_scores,
                max_score=result.max_similarity,
                avg_score=result.avg_similarity,
                most_similar_model=result.most_similar_model
            ),
            risk_score=result.risk_score,
            risk_level=result.risk_level,
            is_mode_collapse_suspected=result.is_mode_collapse_suspected,
            flags=result.flags,
            recommendation=result.recommendation,
            processing_time_ms=processing_time_ms
        )

    except AIDetectionError as e:
        logger.error(f"AI Detection error: {e}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Unexpected error in mode collapse analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/stats",
    response_model=ServiceStatsResponse,
    summary="Get mode collapse service statistics",
    description="Returns statistics about the mode collapse detection service"
)
async def get_stats() -> ServiceStatsResponse:
    """Get service statistics"""
    try:
        service = get_mode_collapse_service()
        stats = service.get_stats()

        return ServiceStatsResponse(
            cached_questions=stats["cached_questions"],
            llm_circuit_status=stats["llm_circuit_status"]
        )

    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/batch-analyze",
    response_model=List[ModeCollapseAnalysisResponse],
    summary="Batch analyze multiple answers for mode collapse",
    description="""
    Analyze multiple question-answer pairs for mode collapse in a single request.
    Useful for post-interview batch analysis.
    """
)
async def batch_analyze_mode_collapse(
    requests: List[ModeCollapseAnalysisRequest]
) -> List[ModeCollapseAnalysisResponse]:
    """Batch analyze multiple answers for mode collapse"""
    if len(requests) > 20:
        raise HTTPException(
            status_code=400,
            detail="Maximum 20 answers can be analyzed in a single batch"
        )

    results = []
    for req in requests:
        try:
            result = await analyze_mode_collapse(req)
            results.append(result)
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            logger.error(f"Error analyzing answer in batch: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")

    return results
