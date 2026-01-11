"""
API endpoint tests for AI Detection service
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock

# Import the FastAPI app
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.main import app


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestHealthEndpoint:
    """Test health check endpoint"""

    def test_health_check(self, client):
        """Test health endpoint returns OK"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "uptime" in data


class TestQuestionEndpoint:
    """Test question-related endpoints"""

    @patch('services.llm_service.LLMService.generate_ai_answers')
    def test_generate_ai_answers_success(self, mock_generate, client, sample_question):
        """Test generating AI answers for a question"""
        mock_generate.return_value = {
            "gpt-4": "A process is an independent unit of execution...",
            "claude-3.5-sonnet": "In operating systems, a process represents...",
            "gemini-1.5-pro": "The key difference between processes and threads..."
        }

        response = client.post("/api/v1/questions/generate", json={
            "question_text": sample_question,
            "session_id": "test-session-123",
            "models": ["gpt-4", "claude-3.5-sonnet", "gemini-1.5-pro"]
        })

        assert response.status_code == 200
        data = response.json()
        assert "answers" in data
        assert len(data["answers"]) == 3

    def test_generate_ai_answers_missing_question(self, client):
        """Test error when question text is missing"""
        response = client.post("/api/v1/questions/generate", json={
            "session_id": "test-session-123"
        })

        assert response.status_code == 422  # Validation error


class TestAnswerAnalysisEndpoint:
    """Test answer analysis endpoints"""

    @patch('services.detection_service.DetectionService.analyze_answer')
    def test_analyze_answer_success(self, mock_analyze, client, sample_human_answer):
        """Test analyzing an answer for AI detection"""
        mock_analyze.return_value = {
            "risk_score": 0.25,
            "risk_level": "low",
            "similarity_scores": {
                "gpt-4": 0.35,
                "claude-3.5-sonnet": 0.28,
                "gemini-1.5-pro": 0.32
            },
            "perplexity_score": 145.2,
            "is_ai_generated": False,
            "confidence": 0.85,
            "flags": []
        }

        response = client.post("/api/v1/answers/analyze", json={
            "session_id": "test-session-123",
            "question_id": "question-456",
            "answer_text": sample_human_answer,
            "question_text": "Explain processes vs threads"
        })

        assert response.status_code == 200
        data = response.json()
        assert "risk_score" in data
        assert "similarity_scores" in data
        assert data["risk_score"] < 0.5

    @patch('services.detection_service.DetectionService.analyze_answer')
    def test_analyze_answer_high_risk(self, mock_analyze, client, sample_ai_answer_gpt4):
        """Test detecting high-risk AI-generated answer"""
        mock_analyze.return_value = {
            "risk_score": 0.92,
            "risk_level": "high",
            "similarity_scores": {
                "gpt-4": 0.95,
                "claude-3.5-sonnet": 0.88,
                "gemini-1.5-pro": 0.91
            },
            "perplexity_score": 45.3,
            "is_ai_generated": True,
            "confidence": 0.95,
            "flags": ["high_similarity_gpt4", "low_perplexity"]
        }

        response = client.post("/api/v1/answers/analyze", json={
            "session_id": "test-session-123",
            "question_id": "question-456",
            "answer_text": sample_ai_answer_gpt4,
            "question_text": "Explain processes vs threads"
        })

        assert response.status_code == 200
        data = response.json()
        assert data["risk_score"] > 0.8
        assert data["is_ai_generated"] == True
        assert "high_similarity_gpt4" in data["flags"]

    def test_analyze_answer_empty_text(self, client):
        """Test error when answer text is empty"""
        response = client.post("/api/v1/answers/analyze", json={
            "session_id": "test-session-123",
            "question_id": "question-456",
            "answer_text": "",
            "question_text": "Test question"
        })

        assert response.status_code == 422


class TestCacheEndpoint:
    """Test cache management endpoints"""

    @patch('services.cache_service.CacheService.get_cached_answer')
    def test_get_cached_answer_hit(self, mock_cache, client):
        """Test cache hit for AI answer"""
        mock_cache.return_value = {
            "question_hash": "abc123",
            "model": "gpt-4",
            "answer_text": "Cached answer...",
            "embedding": [0.1] * 384,
            "cached_at": "2025-01-10T10:00:00Z"
        }

        response = client.get("/api/v1/cache/answers", params={
            "question_hash": "abc123",
            "model": "gpt-4"
        })

        assert response.status_code == 200
        data = response.json()
        assert data["answer_text"] == "Cached answer..."

    @patch('services.cache_service.CacheService.get_cached_answer')
    def test_get_cached_answer_miss(self, mock_cache, client):
        """Test cache miss"""
        mock_cache.return_value = None

        response = client.get("/api/v1/cache/answers", params={
            "question_hash": "nonexistent",
            "model": "gpt-4"
        })

        assert response.status_code == 404

    @patch('services.cache_service.CacheService.clear_cache')
    def test_clear_cache(self, mock_clear, client):
        """Test cache clearing endpoint"""
        mock_clear.return_value = {"cleared_entries": 150}

        response = client.delete("/api/v1/cache/answers", params={
            "model": "gpt-4"
        })

        assert response.status_code == 200
        data = response.json()
        assert "cleared_entries" in data


class TestBatchAnalysis:
    """Test batch analysis endpoints"""

    @patch('services.detection_service.DetectionService.analyze_batch')
    def test_batch_analyze_success(self, mock_batch, client):
        """Test batch answer analysis"""
        mock_batch.return_value = [
            {"question_id": "q1", "risk_score": 0.2},
            {"question_id": "q2", "risk_score": 0.8},
            {"question_id": "q3", "risk_score": 0.4}
        ]

        response = client.post("/api/v1/answers/analyze/batch", json={
            "session_id": "test-session-123",
            "answers": [
                {"question_id": "q1", "answer_text": "Answer 1", "question_text": "Q1"},
                {"question_id": "q2", "answer_text": "Answer 2", "question_text": "Q2"},
                {"question_id": "q3", "answer_text": "Answer 3", "question_text": "Q3"}
            ]
        })

        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 3


class TestSessionEndpoints:
    """Test session-level AI detection endpoints"""

    @patch('services.session_service.SessionService.get_session_summary')
    def test_get_session_ai_summary(self, mock_summary, client):
        """Test getting AI detection summary for session"""
        mock_summary.return_value = {
            "session_id": "test-session-123",
            "total_questions": 5,
            "analyzed_answers": 5,
            "average_risk_score": 0.35,
            "high_risk_count": 1,
            "flags": ["one_high_risk_answer"],
            "recommendation": "review_flagged_answers"
        }

        response = client.get("/api/v1/sessions/test-session-123/ai-summary")

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "test-session-123"
        assert "average_risk_score" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
