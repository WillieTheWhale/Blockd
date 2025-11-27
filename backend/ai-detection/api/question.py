"""
Question analysis endpoint
Generates AI answers for questions
"""
import time
import logging
from fastapi import APIRouter, HTTPException
from ..schemas.question import QuestionAnalysisRequest, QuestionAnalysisResponse, AIAnswerData
from ..services.detection_service import get_detection_service
from ..lib.errors import AIDetectionError

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/question", response_model=QuestionAnalysisResponse)
async def analyze_question(request: QuestionAnalysisRequest):
    """
    Analyze a question and generate AI answers

    This endpoint:
    1. Hashes the question for caching
    2. Checks if AI answers are already cached
    3. If not cached, generates answers from multiple LLMs (GPT-4, Claude, Gemini)
    4. Generates embeddings for each answer
    5. Calculates perplexity scores
    6. Caches results in Redis and PostgreSQL

    Args:
        request: Question analysis request

    Returns:
        AI-generated answers with embeddings and metadata
    """
    start_time = time.time()

    try:
        detection_service = get_detection_service()

        # Analyze question
        result = await detection_service.analyze_question(
            question_text=request.question_text,
            question_id=None  # Would get from database
        )

        # Format response
        ai_answers = {}
        for model_name, answer_data in result["ai_answers"].items():
            ai_answers[model_name] = AIAnswerData(
                answer=answer_data["answer"],
                embedding=answer_data["embedding"],
                perplexity=answer_data["perplexity"],
                token_count=answer_data.get("token_count")
            )

        processing_time_ms = (time.time() - start_time) * 1000

        return QuestionAnalysisResponse(
            question_id=result.get("question_id"),
            question_hash=result["question_hash"],
            ai_answers=ai_answers,
            cached=result["cached"],
            processing_time_ms=processing_time_ms
        )

    except AIDetectionError as e:
        logger.error(f"AI Detection error: {e}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Unexpected error in question analysis: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
