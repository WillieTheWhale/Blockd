"""
Answer analysis endpoint
Detects AI-generated content in user answers
"""
import time
import logging
from fastapi import APIRouter, HTTPException
from schemas.answer import AnswerAnalysisRequest, AnswerAnalysisResponse
from services.detection_service import get_detection_service
from lib.hash_utils import hash_question
from lib.errors import AIDetectionError
from src.database import DatabaseManager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/answer", response_model=AnswerAnalysisResponse)
async def analyze_answer(request: AnswerAnalysisRequest):
    """
    Analyze an answer for AI detection

    This endpoint:
    1. Retrieves cached AI answers for the question
    2. Calculates semantic similarity between user answer and AI answers
    3. Calculates perplexity score of user answer
    4. Analyzes n-gram overlap
    5. Performs stylometric analysis
    6. Runs XGBoost ensemble classifier
    7. Generates risk score and flags
    8. Provides recommendation

    Args:
        request: Answer analysis request

    Returns:
        Comprehensive AI detection analysis with risk score
    """
    start_time = time.time()

    try:
        # Get question to generate hash
        with DatabaseManager() as db:
            question = db.get_question(request.question_id)

            if not question:
                raise HTTPException(
                    status_code=404,
                    detail=f"Question not found: {request.question_id}"
                )

            question_hash = hash_question(question.question_text)

        # Get detection service
        detection_service = get_detection_service()

        # Extract gaze data
        gaze_off_screen_percentage = None
        if request.gaze_data:
            gaze_off_screen_percentage = request.gaze_data.off_screen_percentage

        # Analyze answer
        result = await detection_service.analyze_answer(
            question_hash=question_hash,
            answer_text=request.answer_text,
            response_time_ms=request.response_time_ms,
            gaze_off_screen_percentage=gaze_off_screen_percentage,
            security_event_count=None  # Would get from security service
        )

        # Add processing time
        processing_time_ms = (time.time() - start_time) * 1000
        result.processing_time_ms = processing_time_ms

        # Save to database
        with DatabaseManager() as db:
            db.save_answer_analysis(
                question_id=request.question_id,
                answer_text=request.answer_text,
                risk_score=result.risk_score,
                similarity_scores=result.similarity_scores.model_dump(),
                perplexity_score=result.perplexity_score,
                is_ai_generated=(result.risk_level in ["high", "critical"]),
                confidence_score=result.confidence,
                response_timing={"response_time_ms": request.response_time_ms} if request.response_time_ms else None,
                metadata={
                    "flags": result.flags,
                    "risk_level": result.risk_level,
                    "recommendation": result.recommendation
                }
            )

        return result

    except AIDetectionError as e:
        logger.error(f"AI Detection error: {e}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in answer analysis: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
