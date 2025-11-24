"""
Tests for n-gram overlap service
"""
import pytest
from ..services.ngram_service import get_ngram_service


class TestNgramService:
    """Test n-gram service"""

    @pytest.fixture
    def ngram_service(self):
        """Get n-gram service instance"""
        return get_ngram_service()

    def test_calculate_ngram_overlap_identical(self, ngram_service):
        """Test n-gram overlap with identical texts"""
        text1 = "The quick brown fox jumps over the lazy dog"
        text2 = "The quick brown fox jumps over the lazy dog"
        overlap = ngram_service.calculate_ngram_overlap(text1, text2, n=3)
        assert overlap == pytest.approx(1.0, abs=0.01)

    def test_calculate_ngram_overlap_different(self, ngram_service):
        """Test n-gram overlap with completely different texts"""
        text1 = "The quick brown fox jumps"
        text2 = "Python is a programming language"
        overlap = ngram_service.calculate_ngram_overlap(text1, text2, n=3)
        assert overlap == pytest.approx(0.0, abs=0.01)

    def test_calculate_ngram_overlap_partial(self, ngram_service):
        """Test n-gram overlap with partial overlap"""
        text1 = "The quick brown fox jumps over the lazy dog"
        text2 = "The quick brown cat jumps over the lazy dog"
        overlap = ngram_service.calculate_ngram_overlap(text1, text2, n=3)
        assert 0.0 < overlap < 1.0

    def test_calculate_max_ngram_overlap(self, ngram_service):
        """Test max n-gram overlap calculation"""
        overlaps = {
            "gpt-4": {"trigram": 0.75, "fourgram": 0.60},
            "claude": {"trigram": 0.85, "fourgram": 0.70},
            "gemini": {"trigram": 0.65, "fourgram": 0.80}
        }
        max_overlaps = ngram_service.calculate_max_ngram_overlap(overlaps)
        assert max_overlaps["trigram"] == 0.85
        assert max_overlaps["fourgram"] == 0.80

    def test_calculate_max_ngram_overlap_empty(self, ngram_service):
        """Test with empty overlaps"""
        max_overlaps = ngram_service.calculate_max_ngram_overlap({})
        assert max_overlaps["trigram"] == 0.0
        assert max_overlaps["fourgram"] == 0.0
