"""
Tests for LLM Response Validation.

Tests the LLMResponseValidator class for validating responses from
OpenAI, Anthropic, and Google Gemini APIs.
"""
import pytest
from unittest.mock import Mock, MagicMock
from services.llm_service import (
    LLMResponseValidator,
    LLMResponse,
    LLMProvider,
    LLMValidationError,
    LLMContentError,
    LLMEmptyResponseError,
    LLMRefusalError,
)


class TestLLMResponseValidator:
    """Tests for LLMResponseValidator class"""

    @pytest.fixture
    def validator(self):
        """Create validator instance"""
        return LLMResponseValidator()

    # =========================================================================
    # OpenAI Response Validation Tests
    # =========================================================================

    def test_validate_openai_response_valid(self, validator):
        """Test validation of valid OpenAI response"""
        response = Mock()
        response.choices = [
            Mock(message=Mock(content="This is a valid answer about programming."))
        ]
        response.usage = Mock(total_tokens=100)

        result = validator.validate_openai_response(response)

        assert isinstance(result, LLMResponse)
        assert result.content == "This is a valid answer about programming."
        assert result.provider == LLMProvider.OPENAI
        assert result.is_valid is True
        assert result.token_count == 100

    def test_validate_openai_response_no_choices(self, validator):
        """Test validation fails when response has no choices"""
        response = Mock()
        response.choices = []

        with pytest.raises(LLMValidationError) as exc_info:
            validator.validate_openai_response(response)

        assert "No choices" in str(exc_info.value)

    def test_validate_openai_response_none_choices(self, validator):
        """Test validation fails when choices is None"""
        response = Mock()
        response.choices = None

        with pytest.raises(LLMValidationError) as exc_info:
            validator.validate_openai_response(response)

        assert "No choices" in str(exc_info.value)

    def test_validate_openai_response_no_message(self, validator):
        """Test validation fails when choice has no message"""
        response = Mock()
        response.choices = [Mock(message=None)]

        with pytest.raises(LLMValidationError) as exc_info:
            validator.validate_openai_response(response)

        assert "No message" in str(exc_info.value)

    def test_validate_openai_response_empty_content(self, validator):
        """Test validation fails when content is empty"""
        response = Mock()
        response.choices = [Mock(message=Mock(content=""))]
        response.usage = Mock(total_tokens=0)

        with pytest.raises(LLMEmptyResponseError):
            validator.validate_openai_response(response)

    def test_validate_openai_response_whitespace_only(self, validator):
        """Test validation fails when content is whitespace only"""
        response = Mock()
        response.choices = [Mock(message=Mock(content="   \n\t  "))]
        response.usage = Mock(total_tokens=5)

        with pytest.raises(LLMEmptyResponseError):
            validator.validate_openai_response(response)

    def test_validate_openai_response_refusal(self, validator):
        """Test validation detects refusal patterns"""
        response = Mock()
        response.choices = [Mock(message=Mock(content="I cannot provide an answer to that question."))]
        response.usage = Mock(total_tokens=10)

        with pytest.raises(LLMRefusalError):
            validator.validate_openai_response(response)

    def test_validate_openai_response_too_short(self, validator):
        """Test validation fails when content is too short"""
        response = Mock()
        response.choices = [Mock(message=Mock(content="Yes"))]
        response.usage = Mock(total_tokens=1)

        with pytest.raises(LLMContentError) as exc_info:
            validator.validate_openai_response(response)

        assert "too short" in str(exc_info.value).lower()

    # =========================================================================
    # Anthropic Response Validation Tests
    # =========================================================================

    def test_validate_anthropic_response_valid(self, validator):
        """Test validation of valid Anthropic response"""
        response = Mock()
        response.content = [Mock(type="text", text="This is a comprehensive answer about the topic.")]
        response.usage = Mock(input_tokens=50, output_tokens=100)
        response.stop_reason = "end_turn"

        result = validator.validate_anthropic_response(response)

        assert isinstance(result, LLMResponse)
        assert result.content == "This is a comprehensive answer about the topic."
        assert result.provider == LLMProvider.ANTHROPIC
        assert result.is_valid is True

    def test_validate_anthropic_response_no_content(self, validator):
        """Test validation fails when response has no content"""
        response = Mock()
        response.content = []

        with pytest.raises(LLMValidationError) as exc_info:
            validator.validate_anthropic_response(response)

        assert "No content" in str(exc_info.value)

    def test_validate_anthropic_response_no_text_blocks(self, validator):
        """Test validation fails when no text blocks in content"""
        response = Mock()
        response.content = [Mock(type="image", text=None)]

        with pytest.raises(LLMValidationError) as exc_info:
            validator.validate_anthropic_response(response)

        assert "No text content" in str(exc_info.value)

    def test_validate_anthropic_response_empty_text(self, validator):
        """Test validation fails when text is empty"""
        response = Mock()
        response.content = [Mock(type="text", text="")]
        response.usage = Mock(input_tokens=50, output_tokens=0)
        response.stop_reason = "end_turn"

        with pytest.raises(LLMEmptyResponseError):
            validator.validate_anthropic_response(response)

    # =========================================================================
    # Gemini Response Validation Tests
    # =========================================================================

    def test_validate_gemini_response_valid(self, validator):
        """Test validation of valid Gemini response"""
        response = Mock()
        response.text = "This is a detailed answer explaining the concept thoroughly."

        result = validator.validate_gemini_response(response)

        assert isinstance(result, LLMResponse)
        assert result.content == "This is a detailed answer explaining the concept thoroughly."
        assert result.provider == LLMProvider.GEMINI
        assert result.is_valid is True

    def test_validate_gemini_response_no_text(self, validator):
        """Test validation fails when response has no text"""
        response = Mock()
        response.text = None

        with pytest.raises(LLMValidationError) as exc_info:
            validator.validate_gemini_response(response)

        assert "No text" in str(exc_info.value)

    def test_validate_gemini_response_blocked(self, validator):
        """Test validation handles safety-blocked responses"""
        response = Mock()
        response.text = None
        response.candidates = []
        response.prompt_feedback = Mock(block_reason="SAFETY")

        with pytest.raises(LLMValidationError) as exc_info:
            validator.validate_gemini_response(response)

        assert "blocked" in str(exc_info.value).lower() or "safety" in str(exc_info.value).lower()

    # =========================================================================
    # Content Validation Tests
    # =========================================================================

    def test_validate_content_with_refusal_patterns(self, validator):
        """Test various refusal patterns are detected"""
        refusal_phrases = [
            "I cannot assist with that request",
            "I'm unable to provide that information",
            "As an AI, I cannot help with this",
            "I apologize, but I can't answer that",
            "I won't be able to provide assistance",
        ]

        for phrase in refusal_phrases:
            with pytest.raises(LLMRefusalError):
                validator._validate_content(phrase)

    def test_validate_content_minimum_length(self, validator):
        """Test content minimum length requirement"""
        # Too short
        with pytest.raises(LLMContentError):
            validator._validate_content("OK")

        # Just barely long enough (depends on min_length setting)
        long_enough = "This is a sufficiently long answer."
        # Should not raise
        validator._validate_content(long_enough)


class TestLLMResponse:
    """Tests for LLMResponse dataclass"""

    def test_llm_response_creation(self):
        """Test LLMResponse creation"""
        response = LLMResponse(
            content="Test content",
            provider=LLMProvider.OPENAI,
            is_valid=True,
            token_count=50,
            error=None
        )

        assert response.content == "Test content"
        assert response.provider == LLMProvider.OPENAI
        assert response.is_valid is True
        assert response.token_count == 50
        assert response.error is None

    def test_llm_response_with_error(self):
        """Test LLMResponse with error"""
        response = LLMResponse(
            content=None,
            provider=LLMProvider.ANTHROPIC,
            is_valid=False,
            token_count=0,
            error="API rate limit exceeded"
        )

        assert response.content is None
        assert response.is_valid is False
        assert response.error == "API rate limit exceeded"


class TestLLMProvider:
    """Tests for LLMProvider enum"""

    def test_provider_values(self):
        """Test LLMProvider enum values"""
        assert LLMProvider.OPENAI.value == "openai"
        assert LLMProvider.ANTHROPIC.value == "anthropic"
        assert LLMProvider.GEMINI.value == "gemini"

    def test_provider_from_string(self):
        """Test creating provider from string"""
        assert LLMProvider("openai") == LLMProvider.OPENAI
        assert LLMProvider("anthropic") == LLMProvider.ANTHROPIC
        assert LLMProvider("gemini") == LLMProvider.GEMINI


class TestLLMExceptions:
    """Tests for LLM exception classes"""

    def test_validation_error(self):
        """Test LLMValidationError"""
        error = LLMValidationError("Invalid response structure", provider="openai")
        assert "Invalid response structure" in str(error)
        assert error.provider == "openai"

    def test_content_error(self):
        """Test LLMContentError"""
        error = LLMContentError("Content too short", min_length=20, actual_length=5)
        assert "too short" in str(error)

    def test_empty_response_error(self):
        """Test LLMEmptyResponseError"""
        error = LLMEmptyResponseError("Empty response received")
        assert "Empty" in str(error)

    def test_refusal_error(self):
        """Test LLMRefusalError"""
        error = LLMRefusalError("Model refused to answer", pattern="I cannot")
        assert "refused" in str(error).lower()
        assert error.pattern == "I cannot"
