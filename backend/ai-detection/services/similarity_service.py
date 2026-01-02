"""
Semantic similarity service using embeddings
Calculates similarity between human answers and AI-generated answers
"""
import logging
from typing import List, Dict, Tuple
from models.model_manager import get_model_manager
from lib.vector_utils import cosine_similarity, batch_cosine_similarity

logger = logging.getLogger(__name__)


class SimilarityService:
    """Semantic similarity calculation service"""

    def __init__(self):
        """Initialize similarity service"""
        self.model_manager = get_model_manager()

    def calculate_similarity(
        self,
        answer1: str,
        answer2: str
    ) -> float:
        """
        Calculate semantic similarity between two answers

        Args:
            answer1: First answer text
            answer2: Second answer text

        Returns:
            Similarity score (0-1)
        """
        # Get embedding model
        embedding_model = self.model_manager.get_embedding_model()

        # Generate embeddings
        embeddings = embedding_model.encode([answer1, answer2])
        emb1, emb2 = embeddings[0], embeddings[1]

        # Calculate cosine similarity
        similarity = cosine_similarity(emb1, emb2)

        logger.debug(f"Similarity calculated: {similarity:.4f}")
        return similarity

    def calculate_similarity_to_ai_answers(
        self,
        human_answer: str,
        ai_answers: Dict[str, str]
    ) -> Dict[str, float]:
        """
        Calculate similarity between human answer and multiple AI answers

        Args:
            human_answer: Human-written answer
            ai_answers: Dictionary of model_name -> ai_answer

        Returns:
            Dictionary of model_name -> similarity_score
        """
        # Get embedding model
        embedding_model = self.model_manager.get_embedding_model()

        # Generate embedding for human answer
        human_embedding = embedding_model.encode(human_answer)

        # Generate embeddings for AI answers
        ai_texts = list(ai_answers.values())
        model_names = list(ai_answers.keys())

        if not ai_texts:
            return {}

        ai_embeddings = embedding_model.encode(ai_texts)

        # Calculate similarities
        similarities = batch_cosine_similarity(human_embedding, ai_embeddings)

        # Map back to model names
        similarity_scores = {}
        for model_name, similarity in zip(model_names, similarities):
            similarity_scores[model_name] = similarity
            logger.debug(f"Similarity to {model_name}: {similarity:.4f}")

        return similarity_scores

    def calculate_max_and_avg_similarity(
        self,
        similarity_scores: Dict[str, float]
    ) -> Tuple[float, float]:
        """
        Calculate maximum and average similarity scores

        Args:
            similarity_scores: Dictionary of model_name -> similarity_score

        Returns:
            Tuple of (max_similarity, avg_similarity)
        """
        if not similarity_scores:
            return 0.0, 0.0

        scores = [s for s in similarity_scores.values() if s is not None]

        if not scores:
            return 0.0, 0.0

        max_sim = max(scores)
        avg_sim = sum(scores) / len(scores)

        return max_sim, avg_sim


# Singleton instance
_similarity_service = None


def get_similarity_service() -> SimilarityService:
    """
    Get singleton similarity service instance

    Returns:
        Similarity service
    """
    global _similarity_service
    if _similarity_service is None:
        _similarity_service = SimilarityService()
    return _similarity_service
