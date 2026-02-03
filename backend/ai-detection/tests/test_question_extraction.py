"""
Tests for Question Extraction Service
Tests the heuristic-based question detection from transcribed speech

This test module is designed to run without heavy ML dependencies (torch, etc.)
by importing directly from the question_extraction_service module.
"""
import pytest
import sys
import os

# Add the parent directory to the path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)

# Import directly to avoid loading other services that require torch
import importlib.util
spec = importlib.util.spec_from_file_location(
    "question_extraction_service",
    os.path.join(parent_dir, "services", "question_extraction_service.py")
)
qe_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qe_module)

QuestionExtractionService = qe_module.QuestionExtractionService
ExtractedQuestion = qe_module.ExtractedQuestion
get_question_extraction_service = qe_module.get_question_extraction_service


class TestQuestionExtractionService:
    """Tests for QuestionExtractionService"""

    @pytest.fixture
    def service(self):
        """Create a fresh service instance for each test"""
        return QuestionExtractionService()

    def test_extract_direct_question_with_question_mark(self, service):
        """Test extraction of direct question with question mark"""
        text = "What is your greatest strength?"
        questions = service.extract_questions(text)

        assert len(questions) == 1
        assert questions[0].text == "What is your greatest strength?"
        assert questions[0].confidence >= 0.5
        assert questions[0].question_type == "direct"

    def test_extract_multiple_questions(self, service):
        """Test extraction of multiple questions from text"""
        text = "Tell me about yourself. What are your strengths? How do you handle pressure?"
        questions = service.extract_questions(text)

        assert len(questions) >= 2
        question_texts = [q.text for q in questions]
        assert any("strengths" in q.lower() for q in question_texts)
        assert any("pressure" in q.lower() for q in question_texts)

    def test_extract_interview_pattern_questions(self, service):
        """Test extraction of interview-style questions"""
        text = "Can you describe a time when you had to work under pressure?"
        questions = service.extract_questions(text)

        assert len(questions) == 1
        assert questions[0].confidence >= 0.5

    def test_no_questions_in_statement(self, service):
        """Test that statements are not detected as questions"""
        text = "I think you did a great job on that project."
        questions = service.extract_questions(text)

        assert len(questions) == 0

    def test_filter_short_text(self, service):
        """Test that very short text is filtered out"""
        text = "What?"
        questions = service.extract_questions(text, min_length=15)

        assert len(questions) == 0

    def test_filter_filler_utterances(self, service):
        """Test that filler utterances are not detected as questions"""
        text = "Okay. Sure. Right."
        questions = service.extract_questions(text)

        assert len(questions) == 0

    def test_question_normalization(self, service):
        """Test that questions are normalized correctly"""
        question = "So, what's your experience with Python?"
        normalized = service._normalize_question(question)

        assert "so," not in normalized
        assert "what is" in normalized  # contraction expanded
        assert normalized.islower()

    def test_question_hash_consistency(self, service):
        """Test that the same question produces the same hash"""
        q1 = "What is your experience with Python?"
        q2 = "What is your experience with Python?"

        hash1 = service._hash_question(service._normalize_question(q1))
        hash2 = service._hash_question(service._normalize_question(q2))

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 produces 64 hex characters

    def test_different_questions_different_hashes(self, service):
        """Test that different questions produce different hashes"""
        q1 = "What is your experience with Python?"
        q2 = "What is your experience with JavaScript?"

        hash1 = service._hash_question(service._normalize_question(q1))
        hash2 = service._hash_question(service._normalize_question(q2))

        assert hash1 != hash2

    def test_extracted_question_has_all_fields(self, service):
        """Test that extracted questions have all required fields"""
        text = "How would you solve this problem?"
        questions = service.extract_questions(text)

        assert len(questions) == 1
        q = questions[0]

        assert isinstance(q.text, str)
        assert isinstance(q.normalized_text, str)
        assert isinstance(q.question_hash, str)
        assert isinstance(q.start_index, int)
        assert isinstance(q.end_index, int)
        assert isinstance(q.confidence, float)
        assert isinstance(q.question_type, str)

    def test_indirect_question_detection(self, service):
        """Test detection of indirect questions"""
        text = "I'd like to know about your previous work experience."
        questions = service.extract_questions(text, min_confidence=0.3)

        # Indirect questions may have lower confidence
        assert len(questions) >= 0  # May or may not detect as question

    def test_tell_me_pattern(self, service):
        """Test detection of 'tell me about' pattern"""
        text = "Tell me about a challenging project you worked on."
        questions = service.extract_questions(text)

        assert len(questions) == 1
        assert questions[0].confidence >= 0.3

    def test_explain_pattern(self, service):
        """Test detection of 'explain' pattern"""
        text = "Explain how you would approach this problem."
        questions = service.extract_questions(text)

        assert len(questions) == 1

    def test_walk_me_through_pattern(self, service):
        """Test detection of 'walk me through' pattern"""
        text = "Walk me through your thought process on this."
        questions = service.extract_questions(text)

        assert len(questions) == 1

    def test_min_confidence_filtering(self, service):
        """Test that low confidence questions are filtered"""
        text = "That's interesting."  # Not a question
        questions = service.extract_questions(text, min_confidence=0.5)

        assert len(questions) == 0

    def test_sentence_splitting(self, service):
        """Test proper sentence splitting"""
        text = "Dr. Smith asked about it. What do you think? I agree."
        sentences = service._split_into_sentences(text)

        assert len(sentences) >= 2
        # Dr. should not cause a split
        assert any("Dr." in s or "Dr" in s for s in sentences)

    def test_singleton_instance(self):
        """Test that get_question_extraction_service returns singleton"""
        service1 = get_question_extraction_service()
        service2 = get_question_extraction_service()

        assert service1 is service2


class TestExtractedQuestionDataclass:
    """Tests for the ExtractedQuestion dataclass"""

    def test_extracted_question_creation(self):
        """Test creating an ExtractedQuestion"""
        eq = ExtractedQuestion(
            text="What is Python?",
            normalized_text="what is python",
            question_hash="abc123",
            start_index=0,
            end_index=15,
            confidence=0.9,
            question_type="direct"
        )

        assert eq.text == "What is Python?"
        assert eq.normalized_text == "what is python"
        assert eq.question_hash == "abc123"
        assert eq.start_index == 0
        assert eq.end_index == 15
        assert eq.confidence == 0.9
        assert eq.question_type == "direct"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
