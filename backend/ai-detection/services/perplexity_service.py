"""
Perplexity scoring service
Lower perplexity indicates more AI-like text
"""
import logging
from ..models.model_manager import get_model_manager

logger = logging.getLogger(__name__)


class PerplexityService:
    """Perplexity calculation service"""

    def __init__(self):
        """Initialize perplexity service"""
        self.model_manager = get_model_manager()

    def calculate_perplexity(self, text: str) -> float:
        """
        Calculate perplexity score for text

        Args:
            text: Input text

        Returns:
            Perplexity score
        """
        # Get perplexity model
        perplexity_model = self.model_manager.get_perplexity_model()

        # Calculate perplexity
        # Use sliding window for longer texts
        if len(text) > 1000:
            perplexity = perplexity_model.calculate_perplexity_sliding_window(text)
        else:
            perplexity = perplexity_model.calculate_perplexity(text)

        logger.debug(f"Perplexity calculated: {perplexity:.2f}")
        return perplexity


# Singleton instance
_perplexity_service = None


def get_perplexity_service() -> PerplexityService:
    """
    Get singleton perplexity service instance

    Returns:
        Perplexity service
    """
    global _perplexity_service
    if _perplexity_service is None:
        _perplexity_service = PerplexityService()
    return _perplexity_service
