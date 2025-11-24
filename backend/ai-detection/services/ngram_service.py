"""
N-gram overlap service
Calculates Jaccard similarity for n-grams
"""
import logging
from typing import Dict, Set
from ..lib.text_utils import tokenize, extract_ngrams, calculate_jaccard_similarity

logger = logging.getLogger(__name__)


class NgramService:
    """N-gram overlap calculation service"""

    def calculate_ngram_overlap(
        self,
        text1: str,
        text2: str,
        n: int = 3
    ) -> float:
        """
        Calculate n-gram overlap between two texts

        Args:
            text1: First text
            text2: Second text
            n: N-gram size

        Returns:
            Jaccard similarity score (0-1)
        """
        # Tokenize
        tokens1 = tokenize(text1)
        tokens2 = tokenize(text2)

        # Extract n-grams
        ngrams1 = extract_ngrams(tokens1, n)
        ngrams2 = extract_ngrams(tokens2, n)

        # Convert to sets
        ngram_set1 = set(ngrams1)
        ngram_set2 = set(ngrams2)

        # Calculate Jaccard similarity
        similarity = calculate_jaccard_similarity(ngram_set1, ngram_set2)

        return similarity

    def calculate_multiple_ngram_overlaps(
        self,
        human_answer: str,
        ai_answers: Dict[str, str]
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate n-gram overlaps between human answer and multiple AI answers

        Args:
            human_answer: Human-written answer
            ai_answers: Dictionary of model_name -> ai_answer

        Returns:
            Dictionary of model_name -> {ngram_size -> overlap_score}
        """
        results = {}

        for model_name, ai_answer in ai_answers.items():
            overlaps = {
                "trigram": self.calculate_ngram_overlap(human_answer, ai_answer, n=3),
                "fourgram": self.calculate_ngram_overlap(human_answer, ai_answer, n=4)
            }
            results[model_name] = overlaps
            logger.debug(f"N-gram overlap with {model_name}: 3-gram={overlaps['trigram']:.4f}, 4-gram={overlaps['fourgram']:.4f}")

        return results

    def calculate_max_ngram_overlap(
        self,
        ngram_overlaps: Dict[str, Dict[str, float]]
    ) -> Dict[str, float]:
        """
        Calculate maximum n-gram overlaps across all models

        Args:
            ngram_overlaps: Dictionary of model_name -> {ngram_size -> overlap_score}

        Returns:
            Dictionary of ngram_size -> max_overlap_score
        """
        if not ngram_overlaps:
            return {"trigram": 0.0, "fourgram": 0.0}

        max_trigram = max(
            (overlaps.get("trigram", 0.0) for overlaps in ngram_overlaps.values()),
            default=0.0
        )

        max_fourgram = max(
            (overlaps.get("fourgram", 0.0) for overlaps in ngram_overlaps.values()),
            default=0.0
        )

        return {
            "trigram": max_trigram,
            "fourgram": max_fourgram
        }


# Singleton instance
_ngram_service = None


def get_ngram_service() -> NgramService:
    """
    Get singleton n-gram service instance

    Returns:
        N-gram service
    """
    global _ngram_service
    if _ngram_service is None:
        _ngram_service = NgramService()
    return _ngram_service
