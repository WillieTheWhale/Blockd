"""
Stylometric analysis service
Analyzes writing style features
"""
import logging
from typing import Dict
from lib.text_utils import (
    calculate_vocabulary_richness,
    calculate_avg_sentence_length,
    calculate_punctuation_density,
    calculate_capitalization_ratio,
    detect_filler_words,
    count_words
)

logger = logging.getLogger(__name__)


class StylometricService:
    """Stylometric analysis service"""

    def analyze(self, text: str) -> Dict[str, float]:
        """
        Perform comprehensive stylometric analysis

        Args:
            text: Input text

        Returns:
            Dictionary of stylometric features
        """
        # Calculate various metrics
        vocab_richness = calculate_vocabulary_richness(text)
        avg_sentence_length = calculate_avg_sentence_length(text)
        punctuation_density = calculate_punctuation_density(text)
        capitalization_ratio = calculate_capitalization_ratio(text)
        filler_count, filler_ratio = detect_filler_words(text)

        analysis = {
            "vocabulary_richness": vocab_richness,
            "avg_sentence_length": avg_sentence_length,
            "punctuation_density": punctuation_density,
            "capitalization_ratio": capitalization_ratio,
            "filler_word_ratio": filler_ratio,
            "filler_word_count": filler_count,
            "word_count": count_words(text)
        }

        logger.debug(f"Stylometric analysis: vocab={vocab_richness:.3f}, "
                    f"sent_len={avg_sentence_length:.1f}, "
                    f"punct={punctuation_density:.3f}")

        return analysis

    def is_vocabulary_unnatural(self, vocab_richness: float) -> bool:
        """
        Check if vocabulary richness is unnatural (too low or too high)

        Args:
            vocab_richness: Vocabulary richness score

        Returns:
            True if unnatural
        """
        # Very low or very high vocabulary richness is suspicious
        return vocab_richness < 0.3 or vocab_richness > 0.8

    def has_formal_tone(self, analysis: Dict[str, float]) -> bool:
        """
        Check if text has overly formal tone (typical of AI)

        Args:
            analysis: Stylometric analysis results

        Returns:
            True if formal tone detected
        """
        # AI text typically has:
        # - Low filler words
        # - Perfect punctuation
        # - Moderate sentence length
        filler_ratio = analysis.get("filler_word_ratio", 0.0)
        punct_density = analysis.get("punctuation_density", 0.0)
        sent_length = analysis.get("avg_sentence_length", 0.0)

        is_formal = (
            filler_ratio < 0.02 and  # Very few filler words
            punct_density > 0.05 and  # Good punctuation
            15 <= sent_length <= 25   # Moderate sentence length
        )

        return is_formal


# Singleton instance
_stylometric_service = None


def get_stylometric_service() -> StylometricService:
    """
    Get singleton stylometric service instance

    Returns:
        Stylometric service
    """
    global _stylometric_service
    if _stylometric_service is None:
        _stylometric_service = StylometricService()
    return _stylometric_service
