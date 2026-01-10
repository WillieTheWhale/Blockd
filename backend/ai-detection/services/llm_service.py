"""
LLM service for generating AI answers from multiple models.

Supports OpenAI GPT-4, Anthropic Claude, and Google Gemini with:
- Comprehensive response validation
- Intelligent retry logic for transient errors only
- Parallel execution with configurable fallback
- Detailed logging and error handling

Response Validation:
    - Checks for empty responses
    - Validates response structure before accessing nested attributes
    - Ensures content is meaningful (not just whitespace)
    - Minimum length checks for answer quality
"""
import asyncio
import logging
import re
from typing import Dict, Optional, Any, List
from dataclasses import dataclass
from enum import Enum

from openai import AsyncOpenAI, APIError, APIConnectionError, RateLimitError, APITimeoutError
from anthropic import AsyncAnthropic, APIError as AnthropicAPIError
import google.generativeai as genai
from google.api_core.exceptions import GoogleAPIError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)

from lib.errors import LLMServiceError
from src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMProvider(str, Enum):
    """Supported LLM providers"""
    OPENAI = "gpt-4"
    ANTHROPIC = "claude-3.5-sonnet"
    GOOGLE = "gemini-1.5-pro"


@dataclass
class LLMResponse:
    """Validated LLM response"""
    content: str
    model: str
    provider: LLMProvider
    tokens_used: Optional[int] = None
    finish_reason: Optional[str] = None


class LLMResponseValidator:
    """Validates LLM responses for quality and safety"""

    # Minimum answer length to consider valid
    MIN_ANSWER_LENGTH = 10

    # Maximum answer length before truncation warning
    MAX_ANSWER_LENGTH = 10000

    # Patterns that indicate an invalid or refusal response
    REFUSAL_PATTERNS = [
        r"^i('m| am) (unable|not able|cannot|can't) to",
        r"^as an ai",
        r"^i (don't|do not) have (access|the ability)",
        r"^sorry,? (but )?(i|as an ai)",
        r"^i apologize,? but",
    ]

    @classmethod
    def validate_openai_response(cls, response: Any, model: str) -> str:
        """
        Validate OpenAI API response structure and content.

        Args:
            response: Raw OpenAI API response
            model: Model name for error messages

        Returns:
            Validated answer text

        Raises:
            LLMServiceError: If response is invalid
        """
        # Check choices exist
        if not hasattr(response, 'choices') or not response.choices:
            raise LLMServiceError(
                "Empty response: no choices returned",
                model,
                details={"error_type": "empty_choices"}
            )

        choice = response.choices[0]

        # Check message exists
        if not hasattr(choice, 'message') or choice.message is None:
            raise LLMServiceError(
                "Invalid response: no message in choice",
                model,
                details={"error_type": "no_message", "finish_reason": getattr(choice, 'finish_reason', None)}
            )

        message = choice.message

        # Check content exists
        if not hasattr(message, 'content') or message.content is None:
            finish_reason = getattr(choice, 'finish_reason', 'unknown')
            raise LLMServiceError(
                f"No content in response (finish_reason: {finish_reason})",
                model,
                details={"error_type": "no_content", "finish_reason": finish_reason}
            )

        content = message.content.strip()

        # Validate content quality
        cls._validate_content(content, model)

        return content

    @classmethod
    def validate_anthropic_response(cls, response: Any, model: str) -> str:
        """
        Validate Anthropic Claude API response structure and content.

        Args:
            response: Raw Anthropic API response
            model: Model name for error messages

        Returns:
            Validated answer text

        Raises:
            LLMServiceError: If response is invalid
        """
        # Check content exists
        if not hasattr(response, 'content') or not response.content:
            stop_reason = getattr(response, 'stop_reason', 'unknown')
            raise LLMServiceError(
                f"Empty response: no content blocks (stop_reason: {stop_reason})",
                model,
                details={"error_type": "empty_content", "stop_reason": stop_reason}
            )

        content_block = response.content[0]

        # Check text exists
        if not hasattr(content_block, 'text') or content_block.text is None:
            raise LLMServiceError(
                "Invalid response: no text in content block",
                model,
                details={"error_type": "no_text", "content_type": getattr(content_block, 'type', 'unknown')}
            )

        content = content_block.text.strip()

        # Validate content quality
        cls._validate_content(content, model)

        return content

    @classmethod
    def validate_gemini_response(cls, response: Any, model: str) -> str:
        """
        Validate Google Gemini API response structure and content.

        Args:
            response: Raw Gemini API response
            model: Model name for error messages

        Returns:
            Validated answer text

        Raises:
            LLMServiceError: If response is invalid
        """
        # Check text exists
        if not hasattr(response, 'text'):
            # Check for safety blocking
            if hasattr(response, 'prompt_feedback'):
                feedback = response.prompt_feedback
                block_reason = getattr(feedback, 'block_reason', 'unknown')
                raise LLMServiceError(
                    f"Response blocked by safety filter: {block_reason}",
                    model,
                    details={"error_type": "safety_blocked", "block_reason": str(block_reason)}
                )
            raise LLMServiceError(
                "Invalid response: no text attribute",
                model,
                details={"error_type": "no_text"}
            )

        if response.text is None:
            raise LLMServiceError(
                "Empty response: text is None",
                model,
                details={"error_type": "null_text"}
            )

        content = response.text.strip()

        # Validate content quality
        cls._validate_content(content, model)

        return content

    @classmethod
    def _validate_content(cls, content: str, model: str) -> None:
        """
        Validate the quality and safety of response content.

        Args:
            content: Response text to validate
            model: Model name for error messages

        Raises:
            LLMServiceError: If content is invalid
        """
        # Check for empty content
        if not content:
            raise LLMServiceError(
                "Empty response: content is blank",
                model,
                details={"error_type": "blank_content"}
            )

        # Check minimum length
        if len(content) < cls.MIN_ANSWER_LENGTH:
            raise LLMServiceError(
                f"Response too short: {len(content)} chars (minimum: {cls.MIN_ANSWER_LENGTH})",
                model,
                details={"error_type": "too_short", "length": len(content)}
            )

        # Check for refusal patterns (case-insensitive)
        content_lower = content.lower()
        for pattern in cls.REFUSAL_PATTERNS:
            if re.match(pattern, content_lower):
                raise LLMServiceError(
                    "Model refused to answer the question",
                    model,
                    details={"error_type": "refusal", "pattern": pattern}
                )

        # Warn about very long responses (but don't fail)
        if len(content) > cls.MAX_ANSWER_LENGTH:
            logger.warning(
                f"Response from {model} is very long: {len(content)} chars"
            )


# Define which exceptions are transient and should be retried
OPENAI_TRANSIENT_ERRORS = (APIConnectionError, RateLimitError, APITimeoutError)
ANTHROPIC_TRANSIENT_ERRORS = (AnthropicAPIError,)  # Anthropic SDK handles this internally
GEMINI_TRANSIENT_ERRORS = (GoogleAPIError,)


class LLMService:
    """
    Multi-LLM answer generation service with comprehensive validation.

    This service manages connections to multiple LLM providers and handles:
    - Parallel answer generation
    - Response validation
    - Error handling with intelligent retries
    - Graceful degradation when some models fail

    Example:
        service = LLMService()
        answers = await service.generate_all_answers("What is Python?")
        # Returns: {"gpt-4": "Python is...", "claude-3.5-sonnet": "...", ...}
    """

    def __init__(self):
        """Initialize LLM clients for all configured providers"""
        self.openai_client: Optional[AsyncOpenAI] = None
        self.anthropic_client: Optional[AsyncAnthropic] = None
        self.gemini_model = None

        # Track which clients are available
        self.available_providers: List[LLMProvider] = []

        # Initialize OpenAI
        if settings.OPENAI_API_KEY:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            self.available_providers.append(LLMProvider.OPENAI)
            logger.info("OpenAI client initialized")

        # Initialize Anthropic
        if settings.ANTHROPIC_API_KEY:
            self.anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            self.available_providers.append(LLMProvider.ANTHROPIC)
            logger.info("Anthropic client initialized")

        # Initialize Google Generative AI
        if settings.GOOGLE_API_KEY:
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            self.available_providers.append(LLMProvider.GOOGLE)
            logger.info("Google Generative AI initialized")

        if not self.available_providers:
            logger.warning("No LLM providers configured! Set API keys in environment.")
        else:
            logger.info(f"LLM Service initialized with {len(self.available_providers)} providers: {[p.value for p in self.available_providers]}")

    def _build_prompt(self, question: str) -> str:
        """
        Build the prompt for LLM answer generation.

        Args:
            question: The interview question

        Returns:
            Formatted prompt string
        """
        return (
            "You are an expert interview candidate. Answer the following interview question "
            "concisely and professionally. Provide a direct, substantive answer that demonstrates "
            "knowledge and experience. Do not include phrases like 'As an AI' or disclaimers.\n\n"
            f"Question: {question}\n\n"
            "Answer:"
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(OPENAI_TRANSIENT_ERRORS),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )
    async def generate_gpt4_answer(self, question: str) -> str:
        """
        Generate answer using GPT-4 with comprehensive validation.

        Args:
            question: Interview question

        Returns:
            Validated generated answer

        Raises:
            LLMServiceError: If API call fails or response is invalid
        """
        if not self.openai_client:
            raise LLMServiceError(
                "OpenAI API key not configured",
                LLMProvider.OPENAI.value,
                details={"error_type": "not_configured"}
            )

        model_name = getattr(settings, 'OPENAI_MODEL', 'gpt-4-turbo-preview')

        try:
            response = await asyncio.wait_for(
                self.openai_client.chat.completions.create(
                    model=model_name,
                    messages=[{
                        "role": "user",
                        "content": self._build_prompt(question)
                    }],
                    temperature=getattr(settings, 'OPENAI_TEMPERATURE', 0.7),
                    max_tokens=getattr(settings, 'OPENAI_MAX_TOKENS', 1000)
                ),
                timeout=getattr(settings, 'LLM_TIMEOUT', 30)
            )

            # Validate response
            answer = LLMResponseValidator.validate_openai_response(response, LLMProvider.OPENAI.value)

            logger.info(
                f"GPT-4 answer generated",
                extra={
                    "model": model_name,
                    "answer_length": len(answer),
                    "finish_reason": response.choices[0].finish_reason if response.choices else None
                }
            )

            return answer

        except asyncio.TimeoutError:
            raise LLMServiceError(
                "Request timeout",
                LLMProvider.OPENAI.value,
                details={"error_type": "timeout", "timeout_seconds": getattr(settings, 'LLM_TIMEOUT', 30)}
            )
        except LLMServiceError:
            raise  # Re-raise validation errors
        except OPENAI_TRANSIENT_ERRORS as e:
            # Let tenacity retry handle these
            raise
        except Exception as e:
            logger.error(f"GPT-4 API error: {e}", exc_info=True)
            raise LLMServiceError(
                str(e),
                LLMProvider.OPENAI.value,
                details={"error_type": "api_error", "exception_type": type(e).__name__}
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(ANTHROPIC_TRANSIENT_ERRORS),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )
    async def generate_claude_answer(self, question: str) -> str:
        """
        Generate answer using Claude with comprehensive validation.

        Args:
            question: Interview question

        Returns:
            Validated generated answer

        Raises:
            LLMServiceError: If API call fails or response is invalid
        """
        if not self.anthropic_client:
            raise LLMServiceError(
                "Anthropic API key not configured",
                LLMProvider.ANTHROPIC.value,
                details={"error_type": "not_configured"}
            )

        model_name = getattr(settings, 'ANTHROPIC_MODEL', 'claude-3-5-sonnet-20241022')

        try:
            response = await asyncio.wait_for(
                self.anthropic_client.messages.create(
                    model=model_name,
                    max_tokens=getattr(settings, 'ANTHROPIC_MAX_TOKENS', 1000),
                    messages=[{
                        "role": "user",
                        "content": self._build_prompt(question)
                    }]
                ),
                timeout=getattr(settings, 'LLM_TIMEOUT', 30)
            )

            # Validate response
            answer = LLMResponseValidator.validate_anthropic_response(response, LLMProvider.ANTHROPIC.value)

            logger.info(
                f"Claude answer generated",
                extra={
                    "model": model_name,
                    "answer_length": len(answer),
                    "stop_reason": getattr(response, 'stop_reason', None)
                }
            )

            return answer

        except asyncio.TimeoutError:
            raise LLMServiceError(
                "Request timeout",
                LLMProvider.ANTHROPIC.value,
                details={"error_type": "timeout", "timeout_seconds": getattr(settings, 'LLM_TIMEOUT', 30)}
            )
        except LLMServiceError:
            raise  # Re-raise validation errors
        except ANTHROPIC_TRANSIENT_ERRORS as e:
            # Let tenacity retry handle these
            raise
        except Exception as e:
            logger.error(f"Claude API error: {e}", exc_info=True)
            raise LLMServiceError(
                str(e),
                LLMProvider.ANTHROPIC.value,
                details={"error_type": "api_error", "exception_type": type(e).__name__}
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(GEMINI_TRANSIENT_ERRORS),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )
    async def generate_gemini_answer(self, question: str) -> str:
        """
        Generate answer using Gemini with comprehensive validation.

        Args:
            question: Interview question

        Returns:
            Validated generated answer

        Raises:
            LLMServiceError: If API call fails or response is invalid
        """
        if not settings.GOOGLE_API_KEY:
            raise LLMServiceError(
                "Google API key not configured",
                LLMProvider.GOOGLE.value,
                details={"error_type": "not_configured"}
            )

        model_name = getattr(settings, 'GOOGLE_MODEL', 'gemini-1.5-pro')

        try:
            model = genai.GenerativeModel(model_name)

            response = await asyncio.wait_for(
                model.generate_content_async(
                    self._build_prompt(question),
                    generation_config={
                        "temperature": getattr(settings, 'GOOGLE_TEMPERATURE', 0.7),
                        "max_output_tokens": getattr(settings, 'GOOGLE_MAX_TOKENS', 1000),
                    }
                ),
                timeout=getattr(settings, 'LLM_TIMEOUT', 30)
            )

            # Validate response
            answer = LLMResponseValidator.validate_gemini_response(response, LLMProvider.GOOGLE.value)

            logger.info(
                f"Gemini answer generated",
                extra={
                    "model": model_name,
                    "answer_length": len(answer)
                }
            )

            return answer

        except asyncio.TimeoutError:
            raise LLMServiceError(
                "Request timeout",
                LLMProvider.GOOGLE.value,
                details={"error_type": "timeout", "timeout_seconds": getattr(settings, 'LLM_TIMEOUT', 30)}
            )
        except LLMServiceError:
            raise  # Re-raise validation errors
        except GEMINI_TRANSIENT_ERRORS as e:
            # Let tenacity retry handle these
            raise
        except Exception as e:
            logger.error(f"Gemini API error: {e}", exc_info=True)
            raise LLMServiceError(
                str(e),
                LLMProvider.GOOGLE.value,
                details={"error_type": "api_error", "exception_type": type(e).__name__}
            )

    async def generate_all_answers(
        self,
        question: str,
        require_minimum: int = 1
    ) -> Dict[str, Optional[str]]:
        """
        Generate answers from all available LLMs in parallel.

        This method attempts to get answers from all configured LLM providers.
        It handles failures gracefully, returning None for failed providers
        while still returning successful answers.

        Args:
            question: Interview question
            require_minimum: Minimum number of successful answers required (default 1)

        Returns:
            Dictionary of model names to answers (None for failed providers)

        Raises:
            LLMServiceError: If fewer than require_minimum answers are generated
        """
        results: Dict[str, Optional[str]] = {
            LLMProvider.OPENAI.value: None,
            LLMProvider.ANTHROPIC.value: None,
            LLMProvider.GOOGLE.value: None
        }

        # Build task list
        tasks: Dict[str, asyncio.Task] = {}

        if LLMProvider.OPENAI in self.available_providers:
            tasks[LLMProvider.OPENAI.value] = asyncio.create_task(
                self.generate_gpt4_answer(question)
            )

        if LLMProvider.ANTHROPIC in self.available_providers:
            tasks[LLMProvider.ANTHROPIC.value] = asyncio.create_task(
                self.generate_claude_answer(question)
            )

        if LLMProvider.GOOGLE in self.available_providers:
            tasks[LLMProvider.GOOGLE.value] = asyncio.create_task(
                self.generate_gemini_answer(question)
            )

        if not tasks:
            raise LLMServiceError(
                "No LLM providers configured",
                "all",
                details={"error_type": "no_providers"}
            )

        # Execute based on settings
        parallel = getattr(settings, 'PARALLEL_LLM_CALLS', True)

        if parallel:
            logger.info(f"Generating answers from {len(tasks)} LLMs in parallel...")

            # Gather results with exception handling
            task_results = await asyncio.gather(
                *tasks.values(),
                return_exceptions=True
            )

            # Map results back to model names
            for model_name, result in zip(tasks.keys(), task_results):
                if isinstance(result, Exception):
                    logger.error(
                        f"{model_name} failed",
                        extra={"error": str(result), "error_type": type(result).__name__}
                    )
                    results[model_name] = None
                else:
                    results[model_name] = result
        else:
            # Execute sequentially
            logger.info(f"Generating answers from {len(tasks)} LLMs sequentially...")

            for model_name, task in tasks.items():
                try:
                    results[model_name] = await task
                except Exception as e:
                    logger.error(
                        f"{model_name} failed",
                        extra={"error": str(e), "error_type": type(e).__name__}
                    )
                    results[model_name] = None

        # Count successful results
        successful_answers = {k: v for k, v in results.items() if v is not None}
        successful_count = len(successful_answers)

        logger.info(
            f"Generated {successful_count}/{len(tasks)} answers successfully",
            extra={"successful_models": list(successful_answers.keys())}
        )

        # Check minimum requirement
        if successful_count < require_minimum:
            raise LLMServiceError(
                f"Failed to generate minimum required answers: got {successful_count}, need {require_minimum}",
                "all",
                details={
                    "error_type": "insufficient_answers",
                    "successful_count": successful_count,
                    "required": require_minimum,
                    "failed_models": [k for k, v in results.items() if v is None]
                }
            )

        return results

    async def generate_single_answer(
        self,
        question: str,
        preferred_provider: LLMProvider = LLMProvider.OPENAI
    ) -> str:
        """
        Generate an answer from a single LLM with fallback.

        Tries the preferred provider first, then falls back to others if it fails.

        Args:
            question: Interview question
            preferred_provider: First provider to try

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If all providers fail
        """
        # Order providers with preferred first
        providers = [preferred_provider] + [p for p in self.available_providers if p != preferred_provider]

        errors = []
        for provider in providers:
            try:
                if provider == LLMProvider.OPENAI and self.openai_client:
                    return await self.generate_gpt4_answer(question)
                elif provider == LLMProvider.ANTHROPIC and self.anthropic_client:
                    return await self.generate_claude_answer(question)
                elif provider == LLMProvider.GOOGLE and settings.GOOGLE_API_KEY:
                    return await self.generate_gemini_answer(question)
            except LLMServiceError as e:
                errors.append(f"{provider.value}: {e.message}")
                logger.warning(f"Provider {provider.value} failed, trying next...")
                continue

        # All providers failed
        raise LLMServiceError(
            f"All LLM providers failed: {'; '.join(errors)}",
            "all",
            details={"error_type": "all_providers_failed", "errors": errors}
        )


# Singleton instance
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """
    Get singleton LLM service instance.

    Returns:
        LLM service instance
    """
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service


def reset_llm_service() -> None:
    """Reset the singleton LLM service (useful for testing)"""
    global _llm_service
    _llm_service = None
