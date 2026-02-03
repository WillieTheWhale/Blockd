"""
Mode Collapse Detection Service
Orchestrates the full pipeline for detecting AI-generated answers via mode collapse testing.

Flow:
1. Receive interviewer audio transcription
2. Extract questions using heuristics
3. For new questions, generate AI answers from multiple LLMs
4. Store questions and answers in global database
5. When analyzing user answers, compare against stored AI answers
"""
import logging
import uuid
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from .question_extraction_service import (
    get_question_extraction_service,
    ExtractedQuestion
)
from .llm_service import get_llm_service, LLMResultStatus
from .similarity_service import get_similarity_service
from .cache_service import get_cache_service
from src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Similarity threshold for question matching (0.85 = strict)
QUESTION_SIMILARITY_THRESHOLD = 0.85

# Similarity threshold for mode collapse detection
MODE_COLLAPSE_THRESHOLD_HIGH = 0.90  # High confidence of AI use
MODE_COLLAPSE_THRESHOLD_MEDIUM = 0.80  # Medium confidence
MODE_COLLAPSE_THRESHOLD_LOW = 0.70  # Low confidence


@dataclass
class GlobalQuestion:
    """Represents a question stored in the global questions database"""
    id: str
    question_hash: str
    question_text: str
    normalized_text: str
    embedding: Optional[List[float]] = None
    ai_answers: Dict[str, str] = field(default_factory=dict)
    times_asked: int = 1
    created_at: Optional[datetime] = None


@dataclass
class ModeCollapseResult:
    """Result of mode collapse analysis for a user's answer"""
    question_id: str
    question_text: str
    user_answer_text: str
    similarity_scores: Dict[str, float]  # model_name -> similarity
    max_similarity: float
    avg_similarity: float
    most_similar_model: str
    risk_score: float
    risk_level: str  # minimal, low, medium, high, critical
    is_mode_collapse_suspected: bool
    flags: List[str]
    recommendation: str


class ModeCollapseService:
    """
    Service for detecting mode collapse in interview answers.

    Mode collapse occurs when an interviewee's answer is semantically
    very similar to what AI models would generate, suggesting potential
    use of AI assistance.
    """

    def __init__(self):
        """Initialize mode collapse service"""
        self.question_extractor = get_question_extraction_service()
        self.llm_service = get_llm_service()
        self.similarity_service = get_similarity_service()
        self._global_questions_cache: Dict[str, GlobalQuestion] = {}

        logger.info("Mode collapse service initialized")

    async def process_interviewer_audio(
        self,
        session_id: str,
        transcription_text: str,
        audio_start_time: float = 0.0,
        audio_end_time: float = 0.0
    ) -> Dict:
        """
        Process transcribed interviewer audio to detect and store questions.

        Args:
            session_id: Interview session ID
            transcription_text: Transcribed text from interviewer audio
            audio_start_time: Start time of audio chunk
            audio_end_time: End time of audio chunk

        Returns:
            Dict with processing results including detected questions
        """
        logger.info(f"Processing interviewer audio for session {session_id}")

        # Extract questions from transcription
        extracted_questions = self.question_extractor.extract_questions(
            transcription_text,
            min_length=15,
            min_confidence=0.5
        )

        if not extracted_questions:
            logger.debug("No questions detected in transcription")
            return {
                "session_id": session_id,
                "transcription_length": len(transcription_text),
                "questions_detected": 0,
                "questions": [],
                "new_questions_count": 0,
                "ai_answers_generated": 0
            }

        # Process each detected question
        processed_questions = []
        new_questions_count = 0
        ai_answers_generated = 0

        for eq in extracted_questions:
            # Check if question already exists in global database
            existing = await self._find_existing_question(eq.question_hash)

            if existing:
                # Question already exists - check for missing model answers
                missing_models = await self._find_missing_model_answers(existing)

                if missing_models:
                    logger.info(
                        f"Existing question missing answers from {len(missing_models)} models"
                    )
                    # Generate answers for missing models
                    new_answers = await self._generate_ai_answers_for_models(
                        eq.text, missing_models
                    )
                    if new_answers:
                        existing.ai_answers.update(new_answers)
                        await self._save_global_question(existing)
                        ai_answers_generated += len(new_answers)

                logger.debug(f"Question already exists: {eq.text[:50]}...")
                processed_questions.append({
                    "question_id": existing.id,
                    "question_text": eq.text,
                    "is_new": False,
                    "confidence": eq.confidence,
                    "ai_answers_available": len(existing.ai_answers) > 0,
                    "ai_answers_filled": len(missing_models) > 0 if missing_models else False
                })
            else:
                # New question - generate AI answers
                logger.info(f"New question detected: {eq.text[:50]}...")
                new_questions_count += 1

                # Create global question
                global_question = await self._create_global_question(eq)

                # Generate AI answers
                ai_answers = await self._generate_ai_answers_for_question(eq.text)

                if ai_answers:
                    global_question.ai_answers = ai_answers
                    ai_answers_generated += len(ai_answers)

                    # Save to cache/database
                    await self._save_global_question(global_question)

                processed_questions.append({
                    "question_id": global_question.id,
                    "question_text": eq.text,
                    "is_new": True,
                    "confidence": eq.confidence,
                    "ai_answers_available": len(ai_answers) > 0,
                    "ai_models_used": list(ai_answers.keys())
                })

        result = {
            "session_id": session_id,
            "transcription_length": len(transcription_text),
            "questions_detected": len(extracted_questions),
            "questions": processed_questions,
            "new_questions_count": new_questions_count,
            "ai_answers_generated": ai_answers_generated
        }

        logger.info(
            f"Processed interviewer audio: {len(extracted_questions)} questions, "
            f"{new_questions_count} new, {ai_answers_generated} AI answers generated"
        )

        return result

    async def analyze_user_answer(
        self,
        question_text: str,
        user_answer: str,
        question_id: Optional[str] = None
    ) -> ModeCollapseResult:
        """
        Analyze a user's answer for mode collapse (similarity to AI answers).

        Args:
            question_text: The interview question
            user_answer: The user's answer to analyze
            question_id: Optional existing question ID

        Returns:
            ModeCollapseResult with analysis details
        """
        logger.info(f"Analyzing user answer for mode collapse: {question_text[:50]}...")

        # Get or create question hash
        normalized = self.question_extractor._normalize_question(question_text)
        question_hash = self.question_extractor._hash_question(normalized)

        # Find existing question with AI answers
        global_question = await self._find_existing_question(question_hash)

        if not global_question:
            # Question not found - create it and generate all AI answers
            logger.info("Question not found in cache, creating new entry...")

            extracted = ExtractedQuestion(
                text=question_text,
                normalized_text=normalized,
                question_hash=question_hash,
                start_index=0,
                end_index=len(question_text),
                confidence=1.0,
                question_type='direct'
            )
            global_question = await self._create_global_question(extracted)

            # Generate AI answers from all models
            ai_answers = await self._generate_ai_answers_for_question(question_text)
            global_question.ai_answers = ai_answers

            # Save to cache
            await self._save_global_question(global_question)
        else:
            # Question exists - check for missing model answers
            missing_models = await self._find_missing_model_answers(global_question)

            if missing_models:
                logger.info(
                    f"Question found but missing answers from {len(missing_models)} models: "
                    f"{', '.join(missing_models)}"
                )

                # Generate answers for missing models only
                new_answers = await self._generate_ai_answers_for_models(
                    question_text, missing_models
                )

                # Merge new answers with existing ones
                if new_answers:
                    global_question.ai_answers.update(new_answers)
                    # Save updated answers to cache
                    await self._save_global_question(global_question)
                    logger.info(f"Generated {len(new_answers)} missing AI answers")

        # Calculate similarity between user answer and AI answers
        similarity_scores = self.similarity_service.calculate_similarity_to_ai_answers(
            human_answer=user_answer,
            ai_answers=global_question.ai_answers
        )

        # Calculate aggregate scores
        max_sim, avg_sim = self.similarity_service.calculate_max_and_avg_similarity(
            similarity_scores
        )

        # Find most similar model
        most_similar_model = max(
            similarity_scores.keys(),
            key=lambda k: similarity_scores[k],
            default="unknown"
        ) if similarity_scores else "unknown"

        # Determine risk level and score
        risk_score, risk_level = self._calculate_risk(max_sim, avg_sim)

        # Check for mode collapse
        is_mode_collapse = max_sim >= MODE_COLLAPSE_THRESHOLD_MEDIUM

        # Generate flags
        flags = self._generate_flags(similarity_scores, max_sim, avg_sim)

        # Generate recommendation
        recommendation = self._generate_recommendation(risk_level, flags)

        result = ModeCollapseResult(
            question_id=global_question.id,
            question_text=question_text,
            user_answer_text=user_answer,
            similarity_scores=similarity_scores,
            max_similarity=max_sim,
            avg_similarity=avg_sim,
            most_similar_model=most_similar_model,
            risk_score=risk_score,
            risk_level=risk_level,
            is_mode_collapse_suspected=is_mode_collapse,
            flags=flags,
            recommendation=recommendation
        )

        logger.info(
            f"Mode collapse analysis complete: risk={risk_score:.3f} ({risk_level}), "
            f"max_similarity={max_sim:.3f} to {most_similar_model}"
        )

        return result

    async def _find_existing_question(
        self,
        question_hash: str
    ) -> Optional[GlobalQuestion]:
        """
        Find an existing question by hash in cache or database.

        Args:
            question_hash: SHA-256 hash of normalized question

        Returns:
            GlobalQuestion if found, None otherwise
        """
        # Check local cache first
        if question_hash in self._global_questions_cache:
            return self._global_questions_cache[question_hash]

        # Check Redis cache
        try:
            cache_service = await get_cache_service()
            cached = await cache_service.get_ai_answers(question_hash)
        except Exception as e:
            logger.warning(f"Cache lookup failed for question {question_hash}: {e}")
            cached = None

        if cached:
            # Reconstruct GlobalQuestion from cache
            question = GlobalQuestion(
                id=cached.get('question_id', str(uuid.uuid4())),
                question_hash=question_hash,
                question_text=cached.get('question_text', ''),
                normalized_text=cached.get('normalized_text', ''),
                ai_answers={
                    model: data.get('answer', '')
                    for model, data in cached.items()
                    if isinstance(data, dict) and 'answer' in data
                }
            )
            self._global_questions_cache[question_hash] = question
            return question

        return None

    async def _create_global_question(
        self,
        extracted: ExtractedQuestion
    ) -> GlobalQuestion:
        """
        Create a new GlobalQuestion from an extracted question.

        Args:
            extracted: ExtractedQuestion from question extractor

        Returns:
            New GlobalQuestion instance
        """
        question = GlobalQuestion(
            id=str(uuid.uuid4()),
            question_hash=extracted.question_hash,
            question_text=extracted.text,
            normalized_text=extracted.normalized_text,
            ai_answers={},
            times_asked=1,
            created_at=datetime.utcnow()
        )

        self._global_questions_cache[extracted.question_hash] = question
        return question

    async def _find_missing_model_answers(
        self,
        global_question: GlobalQuestion
    ) -> List[str]:
        """
        Find which expected models are missing answers for a question.

        Args:
            global_question: The question to check

        Returns:
            List of model names that are missing answers
        """
        expected_models = self.llm_service.get_expected_models()
        existing_models = set(global_question.ai_answers.keys()) if global_question.ai_answers else set()

        missing = [model for model in expected_models if model not in existing_models]

        if missing:
            logger.debug(
                f"Question {global_question.id} has answers from {len(existing_models)} models, "
                f"missing {len(missing)}: {missing}"
            )

        return missing

    async def _generate_ai_answers_for_models(
        self,
        question_text: str,
        models: List[str]
    ) -> Dict[str, str]:
        """
        Generate AI answers for a question from specific models only.

        Args:
            question_text: The question to answer
            models: List of model names to generate answers from

        Returns:
            Dict of model_name -> answer_text for successful generations
        """
        logger.info(f"Generating AI answers from {len(models)} models: {', '.join(models)}")

        # Generate answers from specified models only
        llm_results = await self.llm_service.generate_answers_for_models(question_text, models)

        # Extract successful answers
        ai_answers = {}
        for model_name, result in llm_results.items():
            if result.status == LLMResultStatus.SUCCESS and result.answer:
                ai_answers[model_name] = result.answer
                logger.debug(f"Got answer from {model_name}: {len(result.answer)} chars")
            else:
                logger.warning(
                    f"Failed to get answer from {model_name}: "
                    f"{result.status.value} - {result.error}"
                )

        logger.info(f"Generated {len(ai_answers)}/{len(models)} AI answers")
        return ai_answers

    async def _generate_ai_answers_for_question(
        self,
        question_text: str
    ) -> Dict[str, str]:
        """
        Generate AI answers for a question using all available LLMs.

        Args:
            question_text: The question to answer

        Returns:
            Dict of model_name -> answer_text
        """
        logger.info(f"Generating AI answers for: {question_text[:50]}...")

        # Generate answers from all available LLMs
        llm_results = await self.llm_service.generate_all_answers(question_text)

        # Extract successful answers
        ai_answers = {}
        for model_name, result in llm_results.items():
            if result.status == LLMResultStatus.SUCCESS and result.answer:
                ai_answers[model_name] = result.answer
                logger.debug(f"Got answer from {model_name}: {len(result.answer)} chars")
            else:
                logger.warning(
                    f"Failed to get answer from {model_name}: "
                    f"{result.status.value} - {result.error}"
                )

        logger.info(f"Generated {len(ai_answers)} AI answers")
        return ai_answers

    async def _save_global_question(self, question: GlobalQuestion) -> None:
        """
        Save a global question and its AI answers to cache.

        Args:
            question: GlobalQuestion to save
        """
        try:
            cache_service = await get_cache_service()

            # Prepare cache data with proper structure
            cache_data = {
                'question_id': question.id,
                'question_text': question.question_text,
                'normalized_text': question.normalized_text,
            }

            # Add AI answers with embeddings
            for model_name, answer_text in question.ai_answers.items():
                cache_data[model_name] = {
                    'answer': answer_text,
                    'embedding': [],  # Would be populated by detection service
                    'perplexity': None,
                    'token_count': len(answer_text.split())
                }

            await cache_service.save_ai_answers(
                question_hash=question.question_hash,
                question_text=question.question_text,
                ai_answers=cache_data
            )

            logger.debug(f"Saved global question {question.id} to cache")
        except Exception as e:
            logger.error(f"Failed to save global question {question.id} to cache: {e}")

    def _calculate_risk(
        self,
        max_similarity: float,
        avg_similarity: float
    ) -> Tuple[float, str]:
        """
        Calculate risk score and level based on similarity metrics.

        Args:
            max_similarity: Maximum similarity to any AI answer
            avg_similarity: Average similarity across all AI answers

        Returns:
            Tuple of (risk_score, risk_level)
        """
        # Weighted combination of max and average
        risk_score = (0.7 * max_similarity) + (0.3 * avg_similarity)

        # Determine risk level
        if risk_score >= 0.90:
            risk_level = "critical"
        elif risk_score >= 0.80:
            risk_level = "high"
        elif risk_score >= 0.70:
            risk_level = "medium"
        elif risk_score >= 0.50:
            risk_level = "low"
        else:
            risk_level = "minimal"

        return risk_score, risk_level

    def _generate_flags(
        self,
        similarity_scores: Dict[str, float],
        max_sim: float,
        avg_sim: float
    ) -> List[str]:
        """
        Generate warning flags based on analysis results.

        Args:
            similarity_scores: Per-model similarity scores
            max_sim: Maximum similarity
            avg_sim: Average similarity

        Returns:
            List of flag strings
        """
        flags = []

        # Check for high similarity to specific models
        for model_name, score in similarity_scores.items():
            if score >= MODE_COLLAPSE_THRESHOLD_HIGH:
                flags.append(f"very_high_similarity_{model_name.replace('-', '_')}")
            elif score >= MODE_COLLAPSE_THRESHOLD_MEDIUM:
                flags.append(f"high_similarity_{model_name.replace('-', '_')}")

        # Check for consistent similarity across models (mode collapse indicator)
        if len(similarity_scores) >= 2:
            scores = list(similarity_scores.values())
            score_range = max(scores) - min(scores)
            if score_range < 0.1 and avg_sim >= 0.7:
                flags.append("consistent_ai_similarity")

        # Check for very high max similarity
        if max_sim >= MODE_COLLAPSE_THRESHOLD_HIGH:
            flags.append("probable_ai_generated")
        elif max_sim >= MODE_COLLAPSE_THRESHOLD_MEDIUM:
            flags.append("possible_ai_assistance")

        return flags

    def _generate_recommendation(
        self,
        risk_level: str,
        flags: List[str]
    ) -> str:
        """
        Generate a recommendation based on analysis results.

        Args:
            risk_level: Calculated risk level
            flags: Generated flags

        Returns:
            Recommendation string
        """
        if risk_level == "critical":
            return (
                "CRITICAL: Answer shows extremely high similarity to AI-generated responses. "
                "Strong evidence of potential AI assistance. Manual review and follow-up "
                "questions strongly recommended."
            )
        elif risk_level == "high":
            return (
                "HIGH RISK: Answer closely matches patterns from AI language models. "
                "Consider asking follow-up questions to verify understanding. "
                "Manual review recommended."
            )
        elif risk_level == "medium":
            return (
                "MEDIUM RISK: Answer shows moderate similarity to AI responses. "
                "This could indicate AI assistance or naturally similar phrasing. "
                "Consider additional verification if patterns persist."
            )
        elif risk_level == "low":
            return (
                "LOW RISK: Minor similarities detected with AI patterns. "
                "Likely within normal variation. Continue monitoring."
            )
        else:
            return (
                "MINIMAL RISK: Answer appears to be authentically human-generated. "
                "No significant AI pattern similarities detected."
            )

    def get_stats(self) -> Dict:
        """
        Get service statistics.

        Returns:
            Dict with service statistics
        """
        return {
            "cached_questions": len(self._global_questions_cache),
            "llm_circuit_status": self.llm_service.get_circuit_status()
        }


# Singleton instance
_mode_collapse_service: Optional[ModeCollapseService] = None


def get_mode_collapse_service() -> ModeCollapseService:
    """
    Get singleton mode collapse service instance.

    Returns:
        ModeCollapseService instance
    """
    global _mode_collapse_service
    if _mode_collapse_service is None:
        _mode_collapse_service = ModeCollapseService()
    return _mode_collapse_service
