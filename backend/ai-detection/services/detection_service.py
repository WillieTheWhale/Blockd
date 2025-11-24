"""
Main AI detection service
Orchestrates all detection components and generates risk scores
"""
import logging
import uuid
from typing import Dict, List, Optional, Tuple
from ..models.model_manager import get_model_manager
from ..lib.hash_utils import hash_question
from ..lib.text_utils import count_words
from ..src.config import get_settings
from ..schemas.detection import DetectionFeatures
from ..schemas.answer import (
    AnswerAnalysisRequest,
    AnswerAnalysisResponse,
    SimilarityScores,
    NgramOverlap,
    StylometricAnalysis
)
from .llm_service import get_llm_service
from .similarity_service import get_similarity_service
from .perplexity_service import get_perplexity_service
from .ngram_service import get_ngram_service
from .stylometric_service import get_stylometric_service
from .cache_service import get_cache_service

logger = logging.getLogger(__name__)
settings = get_settings()


class DetectionService:
    """Main AI detection orchestration service"""

    def __init__(self):
        """Initialize detection service"""
        self.model_manager = get_model_manager()
        self.llm_service = get_llm_service()
        self.similarity_service = get_similarity_service()
        self.perplexity_service = get_perplexity_service()
        self.ngram_service = get_ngram_service()
        self.stylometric_service = get_stylometric_service()

    async def analyze_question(
        self,
        question_text: str,
        question_id: Optional[uuid.UUID] = None
    ) -> Dict:
        """
        Analyze question and generate AI answers

        Args:
            question_text: Question text
            question_id: Optional question ID

        Returns:
            Dictionary with question hash and AI answers
        """
        # Generate question hash
        question_hash = hash_question(question_text)

        # Check cache
        cache_service = await get_cache_service()
        cached_answers = await cache_service.get_ai_answers(question_hash)

        if cached_answers:
            logger.info("Using cached AI answers")
            return {
                "question_hash": question_hash,
                "question_id": question_id,
                "ai_answers": cached_answers,
                "cached": True
            }

        # Generate AI answers
        logger.info("Generating new AI answers...")
        ai_answers_raw = await self.llm_service.generate_all_answers(question_text)

        # Get embedding model
        embedding_model = self.model_manager.get_embedding_model()
        perplexity_model = self.model_manager.get_perplexity_model()

        # Process each AI answer
        ai_answers = {}
        for model_name, answer_text in ai_answers_raw.items():
            if answer_text is None:
                continue

            # Generate embedding
            embedding = embedding_model.encode(answer_text)

            # Calculate perplexity
            perplexity = perplexity_model.calculate_perplexity(answer_text)

            # Token count
            token_count = len(answer_text.split())

            ai_answers[model_name] = {
                "answer": answer_text,
                "embedding": embedding,
                "perplexity": perplexity,
                "token_count": token_count
            }

        # Save to cache
        await cache_service.save_ai_answers(
            question_hash=question_hash,
            question_text=question_text,
            ai_answers=ai_answers
        )

        return {
            "question_hash": question_hash,
            "question_id": question_id,
            "ai_answers": ai_answers,
            "cached": False
        }

    async def analyze_answer(
        self,
        question_hash: str,
        answer_text: str,
        response_time_ms: Optional[int] = None,
        gaze_off_screen_percentage: Optional[float] = None,
        security_event_count: Optional[int] = None
    ) -> AnswerAnalysisResponse:
        """
        Analyze answer for AI detection

        Args:
            question_hash: Question hash
            answer_text: User's answer
            response_time_ms: Response time in milliseconds
            gaze_off_screen_percentage: Off-screen percentage from eye tracking
            security_event_count: Number of security events

        Returns:
            Analysis result with risk score
        """
        analysis_id = uuid.uuid4()
        logger.info(f"Starting answer analysis: {analysis_id}")

        # Get cached AI answers
        cache_service = await get_cache_service()
        ai_answers_cached = await cache_service.get_ai_answers(question_hash)

        if not ai_answers_cached:
            raise ValueError(f"No AI answers found for question hash: {question_hash}")

        # Extract AI answer texts
        ai_answers = {
            model: data["answer"]
            for model, data in ai_answers_cached.items()
            if data.get("answer")
        }

        # 1. Calculate semantic similarity
        similarity_scores = self.similarity_service.calculate_similarity_to_ai_answers(
            human_answer=answer_text,
            ai_answers=ai_answers
        )

        max_sim, avg_sim = self.similarity_service.calculate_max_and_avg_similarity(
            similarity_scores
        )

        # 2. Calculate perplexity
        perplexity_score = self.perplexity_service.calculate_perplexity(answer_text)

        # 3. Calculate n-gram overlap
        ngram_overlaps = self.ngram_service.calculate_multiple_ngram_overlaps(
            human_answer=answer_text,
            ai_answers=ai_answers
        )
        max_ngrams = self.ngram_service.calculate_max_ngram_overlap(ngram_overlaps)

        # 4. Stylometric analysis
        stylometric = self.stylometric_service.analyze(answer_text)

        # 5. Build feature vector
        features = DetectionFeatures(
            max_similarity_score=max_sim,
            avg_similarity_score=avg_sim,
            gpt4_similarity=similarity_scores.get("gpt-4"),
            claude_similarity=similarity_scores.get("claude-3.5-sonnet"),
            gemini_similarity=similarity_scores.get("gemini-1.5-pro"),
            perplexity_score=perplexity_score,
            trigram_overlap=max_ngrams["trigram"],
            fourgram_overlap=max_ngrams["fourgram"],
            vocabulary_richness=stylometric["vocabulary_richness"],
            avg_sentence_length=stylometric["avg_sentence_length"],
            punctuation_density=stylometric["punctuation_density"],
            response_time_ms=float(response_time_ms) if response_time_ms else None,
            gaze_off_screen_percentage=gaze_off_screen_percentage,
            security_event_count=security_event_count,
            answer_length=len(answer_text)
        )

        # 6. XGBoost prediction
        xgboost_classifier = self.model_manager.get_xgboost_classifier()
        feature_vector = features.to_feature_vector()
        risk_score, confidence = xgboost_classifier.predict(feature_vector)

        # 7. Determine risk level
        risk_level = self._determine_risk_level(risk_score)

        # 8. Generate flags
        flags = self._generate_flags(
            similarity_scores=similarity_scores,
            max_sim=max_sim,
            perplexity_score=perplexity_score,
            ngram_overlaps=max_ngrams,
            stylometric=stylometric,
            response_time_ms=response_time_ms
        )

        # 9. Generate recommendation
        recommendation = self._generate_recommendation(risk_level, flags)

        # Build response
        response = AnswerAnalysisResponse(
            analysis_id=analysis_id,
            risk_score=risk_score,
            risk_level=risk_level,
            confidence=confidence,
            similarity_scores=SimilarityScores(
                gpt4=similarity_scores.get("gpt-4"),
                claude=similarity_scores.get("claude-3.5-sonnet"),
                gemini=similarity_scores.get("gemini-1.5-pro"),
                max=max_sim,
                avg=avg_sim
            ),
            perplexity_score=perplexity_score,
            ngram_overlap=NgramOverlap(
                trigram=max_ngrams["trigram"],
                fourgram=max_ngrams["fourgram"]
            ),
            stylometric_analysis=StylometricAnalysis(
                vocabulary_richness=stylometric["vocabulary_richness"],
                avg_sentence_length=stylometric["avg_sentence_length"],
                punctuation_density=stylometric["punctuation_density"],
                capitalization_ratio=stylometric.get("capitalization_ratio"),
                filler_word_ratio=stylometric.get("filler_word_ratio")
            ),
            flags=flags,
            recommendation=recommendation
        )

        # Cache result
        await cache_service.save_analysis_result(
            str(analysis_id),
            response.model_dump()
        )

        logger.info(f"Analysis complete: risk_score={risk_score:.3f}, risk_level={risk_level}")
        return response

    def _determine_risk_level(self, risk_score: float) -> str:
        """Determine risk level from score"""
        if risk_score >= settings.RISK_THRESHOLD_CRITICAL:
            return "critical"
        elif risk_score >= settings.RISK_THRESHOLD_HIGH:
            return "high"
        elif risk_score >= settings.RISK_THRESHOLD_MEDIUM:
            return "medium"
        elif risk_score >= settings.RISK_THRESHOLD_LOW:
            return "low"
        else:
            return "minimal"

    def _generate_flags(
        self,
        similarity_scores: Dict[str, float],
        max_sim: float,
        perplexity_score: float,
        ngram_overlaps: Dict[str, float],
        stylometric: Dict[str, float],
        response_time_ms: Optional[int]
    ) -> List[str]:
        """Generate warning flags based on analysis"""
        flags = []

        # High similarity flags
        if similarity_scores.get("gpt-4", 0) > settings.SIMILARITY_THRESHOLD_HIGH:
            flags.append("high_similarity_gpt4")

        if similarity_scores.get("claude-3.5-sonnet", 0) > settings.SIMILARITY_THRESHOLD_HIGH:
            flags.append("high_similarity_claude")

        if similarity_scores.get("gemini-1.5-pro", 0) > settings.SIMILARITY_THRESHOLD_HIGH:
            flags.append("high_similarity_gemini")

        # Low perplexity flag
        if perplexity_score < settings.PERPLEXITY_THRESHOLD_LOW:
            flags.append("low_perplexity")

        # High n-gram overlap flag
        if (ngram_overlaps["trigram"] > settings.NGRAM_OVERLAP_THRESHOLD or
            ngram_overlaps["fourgram"] > settings.NGRAM_OVERLAP_THRESHOLD):
            flags.append("high_ngram_overlap")

        # Unnatural vocabulary
        vocab_richness = stylometric["vocabulary_richness"]
        if vocab_richness < 0.3 or vocab_richness > 0.8:
            flags.append("unnatural_vocabulary")

        # Instant response (if response time provided)
        if response_time_ms and response_time_ms < 2000:
            flags.append("instant_response")

        # Formal tone (robotic)
        if self.stylometric_service.has_formal_tone(stylometric):
            flags.append("robotic_tone")

        return flags

    def _generate_recommendation(self, risk_level: str, flags: List[str]) -> str:
        """Generate recommendation based on risk level"""
        if risk_level == "critical":
            return "CRITICAL: Strong evidence of AI usage. Manual review and investigation required."
        elif risk_level == "high":
            return "HIGH RISK: Likely AI-generated content. Manual review strongly recommended."
        elif risk_level == "medium":
            return "MEDIUM RISK: Possible AI assistance detected. Consider additional verification."
        elif risk_level == "low":
            return "LOW RISK: Minor concerns detected. Continue monitoring."
        else:
            return "MINIMAL RISK: Answer appears to be human-generated."


# Singleton instance
_detection_service = None


def get_detection_service() -> DetectionService:
    """
    Get singleton detection service instance

    Returns:
        Detection service
    """
    global _detection_service
    if _detection_service is None:
        _detection_service = DetectionService()
    return _detection_service
