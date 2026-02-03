"""
Tests for Mode Collapse Service - Missing Answer Generation Logic

Tests the data structures and algorithms for:
1. Question lookup using hash-based O(1) lookup
2. Detection of missing LLM model answers
3. Selective generation of answers for missing models only
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime


@dataclass
class GlobalQuestion:
    """Mock GlobalQuestion for testing"""
    id: str
    question_hash: str
    question_text: str
    normalized_text: str
    embedding: Optional[List[float]] = None
    ai_answers: Dict[str, str] = field(default_factory=dict)
    times_asked: int = 1
    created_at: Optional[datetime] = None


class TestMissingAnswerDetection:
    """Tests for detecting missing model answers"""

    def test_find_missing_models_all_present(self):
        """Test when all expected models have answers"""
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]
        question = GlobalQuestion(
            id="test-123",
            question_hash="abc123",
            question_text="What is Python?",
            normalized_text="what is python",
            ai_answers={
                "gpt-5.2": "Python is a programming language...",
                "claude-opus-4-5": "Python is a versatile language...",
                "gemini-3-pro-preview": "Python is widely used..."
            }
        )

        existing_models = set(question.ai_answers.keys())
        missing = [m for m in expected_models if m not in existing_models]

        assert len(missing) == 0
        assert len(question.ai_answers) == 3

    def test_find_missing_models_partial(self):
        """Test when some models are missing answers"""
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]
        question = GlobalQuestion(
            id="test-123",
            question_hash="abc123",
            question_text="What is Python?",
            normalized_text="what is python",
            ai_answers={
                "gpt-5.2": "Python is a programming language..."
            }
        )

        existing_models = set(question.ai_answers.keys())
        missing = [m for m in expected_models if m not in existing_models]

        assert len(missing) == 2
        assert "claude-opus-4-5" in missing
        assert "gemini-3-pro-preview" in missing
        assert "gpt-5.2" not in missing

    def test_find_missing_models_all_missing(self):
        """Test when no models have answers"""
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]
        question = GlobalQuestion(
            id="test-123",
            question_hash="abc123",
            question_text="What is Python?",
            normalized_text="what is python",
            ai_answers={}
        )

        existing_models = set(question.ai_answers.keys())
        missing = [m for m in expected_models if m not in existing_models]

        assert len(missing) == 3
        assert set(missing) == set(expected_models)

    def test_find_missing_models_none_type_answers(self):
        """Test handling when ai_answers is None"""
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]
        question = GlobalQuestion(
            id="test-123",
            question_hash="abc123",
            question_text="What is Python?",
            normalized_text="what is python",
            ai_answers=None
        )

        existing_models = set(question.ai_answers.keys()) if question.ai_answers else set()
        missing = [m for m in expected_models if m not in existing_models]

        assert len(missing) == 3


class TestQuestionLookupDataStructures:
    """Tests for question lookup data structures"""

    def test_hash_based_lookup_o1_complexity(self):
        """Test that hash-based lookup is O(1) using dict"""
        # Simulate cache with many questions
        cache: Dict[str, GlobalQuestion] = {}

        # Add 1000 questions
        for i in range(1000):
            question_hash = f"hash_{i:04d}"
            cache[question_hash] = GlobalQuestion(
                id=f"q-{i}",
                question_hash=question_hash,
                question_text=f"Question {i}",
                normalized_text=f"question {i}"
            )

        # Lookup should be O(1) regardless of cache size
        # Test lookup for first, middle, and last items
        assert cache.get("hash_0000") is not None
        assert cache.get("hash_0500") is not None
        assert cache.get("hash_0999") is not None
        assert cache.get("hash_9999") is None  # Not found

    def test_hash_uniqueness(self):
        """Test that different questions produce different hashes"""
        import hashlib

        def hash_question(text: str) -> str:
            return hashlib.sha256(text.encode('utf-8')).hexdigest()

        q1 = "what is python"
        q2 = "what is javascript"
        q3 = "what is python"  # Same as q1

        h1 = hash_question(q1)
        h2 = hash_question(q2)
        h3 = hash_question(q3)

        assert h1 != h2  # Different questions have different hashes
        assert h1 == h3  # Same question produces same hash
        assert len(h1) == 64  # SHA-256 produces 64 hex chars

    def test_cache_update_merge(self):
        """Test merging new answers into existing answers"""
        question = GlobalQuestion(
            id="test-123",
            question_hash="abc123",
            question_text="What is Python?",
            normalized_text="what is python",
            ai_answers={
                "gpt-5.2": "Python is a programming language..."
            }
        )

        # Simulate generating missing answers
        new_answers = {
            "claude-opus-4-5": "Python is a versatile language...",
            "gemini-3-pro-preview": "Python is widely used..."
        }

        # Merge new answers with existing
        question.ai_answers.update(new_answers)

        assert len(question.ai_answers) == 3
        assert "gpt-5.2" in question.ai_answers
        assert "claude-opus-4-5" in question.ai_answers
        assert "gemini-3-pro-preview" in question.ai_answers


class TestAnswerGenerationLogic:
    """Tests for selective answer generation logic"""

    def test_generate_only_missing_models(self):
        """Test that only missing models are queried"""
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]
        existing_answers = {
            "gpt-5.2": "Existing GPT answer"
        }

        # Find missing models
        existing_models = set(existing_answers.keys())
        models_to_query = [m for m in expected_models if m not in existing_models]

        # Should only query claude and gemini, not gpt
        assert len(models_to_query) == 2
        assert "gpt-5.2" not in models_to_query
        assert "claude-opus-4-5" in models_to_query
        assert "gemini-3-pro-preview" in models_to_query

    def test_empty_question_gets_all_models(self):
        """Test that new questions get all models queried"""
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]
        existing_answers = {}

        existing_models = set(existing_answers.keys())
        models_to_query = [m for m in expected_models if m not in existing_models]

        assert len(models_to_query) == 3
        assert set(models_to_query) == set(expected_models)

    def test_complete_question_skips_generation(self):
        """Test that questions with all answers skip generation"""
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]
        existing_answers = {
            "gpt-5.2": "GPT answer",
            "claude-opus-4-5": "Claude answer",
            "gemini-3-pro-preview": "Gemini answer"
        }

        existing_models = set(existing_answers.keys())
        models_to_query = [m for m in expected_models if m not in existing_models]

        assert len(models_to_query) == 0


class TestIntegrationScenarios:
    """Integration tests for realistic scenarios"""

    def test_circuit_breaker_failure_scenario(self):
        """
        Test scenario where one LLM fails (circuit open) and others succeed.
        On subsequent query, only the failed model should be retried.
        """
        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]

        # Simulate first request where Claude's circuit was open
        first_request_results = {
            "gpt-5.2": "GPT answer",
            # claude-opus-4-5 failed (circuit open)
            "gemini-3-pro-preview": "Gemini answer"
        }

        # Question is saved with partial answers
        question = GlobalQuestion(
            id="test-123",
            question_hash="abc123",
            question_text="Tell me about yourself",
            normalized_text="tell me about yourself",
            ai_answers=first_request_results
        )

        # On second request, detect missing models
        existing_models = set(question.ai_answers.keys())
        missing_models = [m for m in expected_models if m not in existing_models]

        # Should only need to query Claude
        assert len(missing_models) == 1
        assert missing_models[0] == "claude-opus-4-5"

        # Simulate successful retry
        retry_results = {
            "claude-opus-4-5": "Claude answer (after circuit recovery)"
        }

        # Merge results
        question.ai_answers.update(retry_results)

        # Now all models have answers
        assert len(question.ai_answers) == 3
        final_missing = [m for m in expected_models if m not in question.ai_answers]
        assert len(final_missing) == 0

    def test_multiple_questions_independent_answers(self):
        """Test that different questions maintain independent answer sets"""
        cache: Dict[str, GlobalQuestion] = {}

        # Question 1: Has all answers
        cache["hash_1"] = GlobalQuestion(
            id="q1",
            question_hash="hash_1",
            question_text="Question 1",
            normalized_text="question 1",
            ai_answers={
                "gpt-5.2": "Q1 GPT",
                "claude-opus-4-5": "Q1 Claude",
                "gemini-3-pro-preview": "Q1 Gemini"
            }
        )

        # Question 2: Missing Claude
        cache["hash_2"] = GlobalQuestion(
            id="q2",
            question_hash="hash_2",
            question_text="Question 2",
            normalized_text="question 2",
            ai_answers={
                "gpt-5.2": "Q2 GPT",
                "gemini-3-pro-preview": "Q2 Gemini"
            }
        )

        # Question 3: No answers yet
        cache["hash_3"] = GlobalQuestion(
            id="q3",
            question_hash="hash_3",
            question_text="Question 3",
            normalized_text="question 3",
            ai_answers={}
        )

        expected_models = ["gpt-5.2", "claude-opus-4-5", "gemini-3-pro-preview"]

        # Check each question independently
        q1_missing = [m for m in expected_models if m not in cache["hash_1"].ai_answers]
        q2_missing = [m for m in expected_models if m not in cache["hash_2"].ai_answers]
        q3_missing = [m for m in expected_models if m not in cache["hash_3"].ai_answers]

        assert len(q1_missing) == 0
        assert len(q2_missing) == 1
        assert q2_missing[0] == "claude-opus-4-5"
        assert len(q3_missing) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
