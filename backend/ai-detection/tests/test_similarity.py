"""
Tests for similarity calculation
"""
import pytest
from lib.vector_utils import cosine_similarity, batch_cosine_similarity
from services.similarity_service import get_similarity_service


class TestVectorUtils:
    """Test vector utility functions"""

    def test_cosine_similarity_identical(self):
        """Test cosine similarity with identical vectors"""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [1.0, 0.0, 0.0]
        similarity = cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(1.0, abs=0.001)

    def test_cosine_similarity_orthogonal(self):
        """Test cosine similarity with orthogonal vectors"""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [0.0, 1.0, 0.0]
        similarity = cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(0.0, abs=0.001)

    def test_cosine_similarity_opposite(self):
        """Test cosine similarity with opposite vectors"""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [-1.0, 0.0, 0.0]
        similarity = cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(-1.0, abs=0.001)

    def test_batch_cosine_similarity(self):
        """Test batch cosine similarity"""
        vec = [1.0, 0.0, 0.0]
        vectors = [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [-1.0, 0.0, 0.0]
        ]
        similarities = batch_cosine_similarity(vec, vectors)
        assert len(similarities) == 3
        assert similarities[0] == pytest.approx(1.0, abs=0.001)
        assert similarities[1] == pytest.approx(0.0, abs=0.001)
        assert similarities[2] == pytest.approx(-1.0, abs=0.001)


class TestSimilarityService:
    """Test similarity service"""

    @pytest.fixture
    def similarity_service(self):
        """Get similarity service instance"""
        return get_similarity_service()

    def test_calculate_max_and_avg_similarity_empty(self, similarity_service):
        """Test with empty similarity scores"""
        max_sim, avg_sim = similarity_service.calculate_max_and_avg_similarity({})
        assert max_sim == 0.0
        assert avg_sim == 0.0

    def test_calculate_max_and_avg_similarity(self, similarity_service):
        """Test max and avg similarity calculation"""
        scores = {
            "gpt-4": 0.85,
            "claude-3.5-sonnet": 0.75,
            "gemini-1.5-pro": 0.80
        }
        max_sim, avg_sim = similarity_service.calculate_max_and_avg_similarity(scores)
        assert max_sim == 0.85
        assert avg_sim == pytest.approx(0.8, abs=0.01)

    def test_calculate_max_and_avg_similarity_with_none(self, similarity_service):
        """Test with None values"""
        scores = {
            "gpt-4": 0.85,
            "claude-3.5-sonnet": None,
            "gemini-1.5-pro": 0.80
        }
        max_sim, avg_sim = similarity_service.calculate_max_and_avg_similarity(scores)
        assert max_sim == 0.85
        assert avg_sim == pytest.approx(0.825, abs=0.01)
