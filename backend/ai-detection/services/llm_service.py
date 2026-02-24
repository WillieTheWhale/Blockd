"""
LLM service for generating AI answers from multiple models
Supports OpenAI GPT-5.2, Anthropic Claude Opus 4.5, and Google Gemini 3 Pro

Implements circuit breaker pattern to prevent cascading failures
when external LLM providers are unavailable.

Model versions (as of January 2026):
- OpenAI: gpt-5.2 (flagship), gpt-4o (previous gen)
- Anthropic: claude-opus-4-5 (flagship), claude-sonnet-4-5 (balanced)
- Google: gemini-3-pro-preview (flagship), gemini-2.5-flash (fast)
"""
import asyncio
import logging
from typing import Dict, List, Optional, NamedTuple
from enum import Enum
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from openai import APIConnectionError, APITimeoutError, RateLimitError as OpenAIRateLimitError
from anthropic import APIConnectionError as AnthropicConnectionError, APITimeoutError as AnthropicTimeoutError, RateLimitError as AnthropicRateLimitError
from google.api_core.exceptions import ServiceUnavailable, DeadlineExceeded, ResourceExhausted

from lib.errors import LLMServiceError
from lib.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitOpenError,
    get_circuit_registry
)
from src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMResultStatus(Enum):
    """Status of an LLM generation attempt"""
    SUCCESS = "success"
    NOT_CONFIGURED = "not_configured"
    CIRCUIT_OPEN = "circuit_open"
    FAILED = "failed"


class LLMResult(NamedTuple):
    """Result of an LLM generation attempt with status"""
    answer: Optional[str]
    status: LLMResultStatus
    error: Optional[str] = None


# Circuit breaker configurations for each LLM provider
# Each provider has its own circuit breaker to fail independently
OPENAI_CIRCUIT_CONFIG = CircuitBreakerConfig(
    failure_threshold=3,           # Open after 3 consecutive failures
    failure_rate_threshold=0.5,    # Or 50% failure rate
    minimum_calls=5,               # Minimum calls before rate is evaluated
    recovery_timeout=60.0,         # Wait 60s before trying again
    success_threshold=2,           # Need 2 successes to close
    failure_window=120.0,          # Look at failures in last 2 minutes
)

ANTHROPIC_CIRCUIT_CONFIG = CircuitBreakerConfig(
    failure_threshold=3,
    failure_rate_threshold=0.5,
    minimum_calls=5,
    recovery_timeout=60.0,
    success_threshold=2,
    failure_window=120.0,
)

GEMINI_CIRCUIT_CONFIG = CircuitBreakerConfig(
    failure_threshold=3,
    failure_rate_threshold=0.5,
    minimum_calls=5,
    recovery_timeout=60.0,
    success_threshold=2,
    failure_window=120.0,
)


class LLMService:
    """
    Multi-LLM answer generation service with circuit breaker protection.

    Each LLM provider (OpenAI, Anthropic, Google) has its own circuit breaker.
    If a provider fails repeatedly, its circuit opens and requests fail fast
    without waiting for timeouts.

    Circuit States:
    - CLOSED: Normal operation
    - OPEN: Provider is down, requests rejected immediately
    - HALF_OPEN: Testing if provider recovered
    """

    def __init__(self):
        """Initialize LLM clients and circuit breakers"""
        # Initialize circuit breakers
        registry = get_circuit_registry()
        self.openai_circuit = CircuitBreaker("openai", OPENAI_CIRCUIT_CONFIG)
        self.anthropic_circuit = CircuitBreaker("anthropic", ANTHROPIC_CIRCUIT_CONFIG)
        self.gemini_circuit = CircuitBreaker("gemini", GEMINI_CIRCUIT_CONFIG)

        registry.register(self.openai_circuit)
        registry.register(self.anthropic_circuit)
        registry.register(self.gemini_circuit)

        # Initialize clients
        self.openai_client = None
        if settings.OPENAI_API_KEY:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        self.anthropic_client = None
        if settings.ANTHROPIC_API_KEY:
            self.anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        if settings.GOOGLE_API_KEY:
            genai.configure(api_key=settings.GOOGLE_API_KEY)

        logger.info("LLM service initialized with circuit breakers")

    async def _call_openai(self, question: str) -> str:
        """Internal OpenAI API call (wrapped by circuit breaker)"""
        response = await asyncio.wait_for(
            self.openai_client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{
                    "role": "user",
                    "content": f"Answer this interview question concisely and professionally: {question}"
                }],
                temperature=settings.OPENAI_TEMPERATURE,
                max_tokens=settings.OPENAI_MAX_TOKENS
            ),
            timeout=settings.LLM_TIMEOUT
        )
        return response.choices[0].message.content.strip()

    async def _call_anthropic(self, question: str) -> str:
        """Internal Anthropic API call (wrapped by circuit breaker)"""
        response = await asyncio.wait_for(
            self.anthropic_client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=settings.ANTHROPIC_MAX_TOKENS,
                messages=[{
                    "role": "user",
                    "content": f"Answer this interview question concisely and professionally: {question}"
                }]
            ),
            timeout=settings.LLM_TIMEOUT
        )
        return response.content[0].text.strip()

    async def _call_gemini(self, question: str) -> str:
        """Internal Gemini API call (wrapped by circuit breaker)"""
        model = genai.GenerativeModel(settings.GOOGLE_MODEL)
        response = await asyncio.wait_for(
            model.generate_content_async(
                f"Answer this interview question concisely and professionally: {question}"
            ),
            timeout=settings.LLM_TIMEOUT
        )
        return response.text.strip()

    @retry(
        stop=stop_after_attempt(2),  # Reduced retries since circuit breaker handles failures
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((
            APIConnectionError,
            APITimeoutError,
            OpenAIRateLimitError,
            asyncio.TimeoutError,
            ConnectionError,
            TimeoutError,
        )),
        reraise=True
    )
    async def generate_openai_answer(self, question: str) -> str:
        """
        Generate answer using OpenAI GPT-5.2 with circuit breaker protection.

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails or circuit is open
        """
        if not self.openai_client:
            raise LLMServiceError("OpenAI API key not configured", settings.OPENAI_MODEL)

        try:
            answer = await self.openai_circuit.call(
                self._call_openai,
                question
            )
            logger.info(f"{settings.OPENAI_MODEL} answer generated ({len(answer)} chars)")
            return answer

        except CircuitOpenError as e:
            logger.warning(f"OpenAI circuit breaker is open: {e}")
            raise LLMServiceError(
                f"OpenAI service temporarily unavailable (circuit open)",
                settings.OPENAI_MODEL
            )
        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", settings.OPENAI_MODEL)
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise LLMServiceError(str(e), settings.OPENAI_MODEL)

    # Alias for backward compatibility
    async def generate_gpt4_answer(self, question: str) -> str:
        """Backward compatible alias for generate_openai_answer"""
        return await self.generate_openai_answer(question)

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((
            AnthropicConnectionError,
            AnthropicTimeoutError,
            AnthropicRateLimitError,
            asyncio.TimeoutError,
            ConnectionError,
            TimeoutError,
        )),
        reraise=True
    )
    async def generate_claude_answer(self, question: str) -> str:
        """
        Generate answer using Claude Opus 4.5 with circuit breaker protection.

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails or circuit is open
        """
        if not self.anthropic_client:
            raise LLMServiceError("Anthropic API key not configured", settings.ANTHROPIC_MODEL)

        try:
            answer = await self.anthropic_circuit.call(
                self._call_anthropic,
                question
            )
            logger.info(f"{settings.ANTHROPIC_MODEL} answer generated ({len(answer)} chars)")
            return answer

        except CircuitOpenError as e:
            logger.warning(f"Claude circuit breaker is open: {e}")
            raise LLMServiceError(
                f"Anthropic service temporarily unavailable (circuit open)",
                settings.ANTHROPIC_MODEL
            )
        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", settings.ANTHROPIC_MODEL)
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            raise LLMServiceError(str(e), settings.ANTHROPIC_MODEL)

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((
            ServiceUnavailable,
            DeadlineExceeded,
            ResourceExhausted,
            asyncio.TimeoutError,
            ConnectionError,
            TimeoutError,
        )),
        reraise=True
    )
    async def generate_gemini_answer(self, question: str) -> str:
        """
        Generate answer using Gemini 3 Pro with circuit breaker protection.

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails or circuit is open
        """
        if not settings.GOOGLE_API_KEY:
            raise LLMServiceError("Google API key not configured", settings.GOOGLE_MODEL)

        try:
            answer = await self.gemini_circuit.call(
                self._call_gemini,
                question
            )
            logger.info(f"{settings.GOOGLE_MODEL} answer generated ({len(answer)} chars)")
            return answer

        except CircuitOpenError as e:
            logger.warning(f"Gemini circuit breaker is open: {e}")
            raise LLMServiceError(
                f"Google service temporarily unavailable (circuit open)",
                settings.GOOGLE_MODEL
            )
        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", settings.GOOGLE_MODEL)
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise LLMServiceError(str(e), settings.GOOGLE_MODEL)

    def get_expected_models(self) -> List[str]:
        """
        Get list of expected model names from settings.

        Returns:
            List of model names that should have answers generated
        """
        return [
            settings.OPENAI_MODEL,
            settings.ANTHROPIC_MODEL,
            settings.GOOGLE_MODEL
        ]

    async def generate_answers_for_models(
        self,
        question: str,
        models: List[str]
    ) -> Dict[str, LLMResult]:
        """
        Generate answers from specific models only.

        Args:
            question: Interview question
            models: List of model names to generate answers from

        Returns:
            Dictionary of model names to LLMResult
        """
        results: Dict[str, LLMResult] = {}

        if not models:
            return results

        # Map model names to generation methods
        openai_model = settings.OPENAI_MODEL
        anthropic_model = settings.ANTHROPIC_MODEL
        google_model = settings.GOOGLE_MODEL

        tasks = {}
        for model in models:
            if model == openai_model:
                if not self.openai_client:
                    results[model] = LLMResult(None, LLMResultStatus.NOT_CONFIGURED, "OpenAI API key not configured")
                elif self.openai_circuit.is_open:
                    results[model] = LLMResult(None, LLMResultStatus.CIRCUIT_OPEN, "OpenAI circuit breaker is open")
                else:
                    tasks[model] = self.generate_openai_answer(question)
            elif model == anthropic_model:
                if not self.anthropic_client:
                    results[model] = LLMResult(None, LLMResultStatus.NOT_CONFIGURED, "Anthropic API key not configured")
                elif self.anthropic_circuit.is_open:
                    results[model] = LLMResult(None, LLMResultStatus.CIRCUIT_OPEN, "Anthropic circuit breaker is open")
                else:
                    tasks[model] = self.generate_claude_answer(question)
            elif model == google_model:
                if not settings.GOOGLE_API_KEY:
                    results[model] = LLMResult(None, LLMResultStatus.NOT_CONFIGURED, "Google API key not configured")
                elif self.gemini_circuit.is_open:
                    results[model] = LLMResult(None, LLMResultStatus.CIRCUIT_OPEN, "Gemini circuit breaker is open")
                else:
                    tasks[model] = self.generate_gemini_answer(question)
            else:
                logger.warning(f"Unknown model requested: {model}")
                results[model] = LLMResult(None, LLMResultStatus.NOT_CONFIGURED, f"Unknown model: {model}")

        if tasks:
            # Execute in parallel
            task_results = await asyncio.gather(*tasks.values(), return_exceptions=True)
            for (model_name, _), result in zip(tasks.items(), task_results):
                if isinstance(result, Exception):
                    logger.error(f"{model_name} failed: {result}")
                    results[model_name] = LLMResult(None, LLMResultStatus.FAILED, str(result))
                else:
                    results[model_name] = LLMResult(result, LLMResultStatus.SUCCESS)

        return results

    async def generate_all_answers(self, question: str) -> Dict[str, LLMResult]:
        """
        Generate answers from all available LLMs in parallel.
        Uses circuit breakers to fail fast for unavailable providers.

        Models (as of January 2026):
        - OpenAI: GPT-5.2 (default via OPENAI_MODEL setting)
        - Anthropic: Claude Opus 4.5 (default via ANTHROPIC_MODEL setting)
        - Google: Gemini 3 Pro (default via GOOGLE_MODEL setting)

        Args:
            question: Interview question

        Returns:
            Dictionary of model names to LLMResult with status information
        """
        results: Dict[str, LLMResult] = {}

        # Get model names from settings
        openai_model = settings.OPENAI_MODEL
        anthropic_model = settings.ANTHROPIC_MODEL
        google_model = settings.GOOGLE_MODEL

        # Log circuit breaker states
        self._log_circuit_states()

        # Check OpenAI availability (GPT-5.2)
        if not self.openai_client:
            results[openai_model] = LLMResult(None, LLMResultStatus.NOT_CONFIGURED, "OpenAI API key not configured")
        elif self.openai_circuit.is_open:
            results[openai_model] = LLMResult(None, LLMResultStatus.CIRCUIT_OPEN, "OpenAI circuit breaker is open")
            logger.info(f"Skipping {openai_model}: circuit is open")

        # Check Claude availability (Claude Opus 4.5)
        if not self.anthropic_client:
            results[anthropic_model] = LLMResult(None, LLMResultStatus.NOT_CONFIGURED, "Anthropic API key not configured")
        elif self.anthropic_circuit.is_open:
            results[anthropic_model] = LLMResult(None, LLMResultStatus.CIRCUIT_OPEN, "Anthropic circuit breaker is open")
            logger.info(f"Skipping {anthropic_model}: circuit is open")

        # Check Gemini availability (Gemini 3 Pro)
        if not settings.GOOGLE_API_KEY:
            results[google_model] = LLMResult(None, LLMResultStatus.NOT_CONFIGURED, "Google API key not configured")
        elif self.gemini_circuit.is_open:
            results[google_model] = LLMResult(None, LLMResultStatus.CIRCUIT_OPEN, "Gemini circuit breaker is open")
            logger.info(f"Skipping {google_model}: circuit is open")

        # Define tasks for available providers
        tasks = {}
        if openai_model not in results:
            tasks[openai_model] = self.generate_openai_answer(question)
        if anthropic_model not in results:
            tasks[anthropic_model] = self.generate_claude_answer(question)
        if google_model not in results:
            tasks[google_model] = self.generate_gemini_answer(question)

        if not tasks:
            logger.error("No LLM providers available (all circuits open or not configured)")
            return results

        # Execute in parallel if enabled
        if settings.PARALLEL_LLM_CALLS and len(tasks) > 1:
            logger.info(f"Generating answers from {len(tasks)} LLMs in parallel...")

            # Gather results
            task_results = await asyncio.gather(
                *tasks.values(),
                return_exceptions=True
            )

            # Map results back to model names
            for (model_name, _), result in zip(tasks.items(), task_results):
                if isinstance(result, Exception):
                    logger.error(f"{model_name} failed: {result}")
                    results[model_name] = LLMResult(None, LLMResultStatus.FAILED, str(result))
                else:
                    results[model_name] = LLMResult(result, LLMResultStatus.SUCCESS)
        else:
            # Execute sequentially
            logger.info(f"Generating answers from {len(tasks)} LLMs sequentially...")

            for model_name, task in tasks.items():
                try:
                    answer = await task
                    results[model_name] = LLMResult(answer, LLMResultStatus.SUCCESS)
                except Exception as e:
                    logger.error(f"{model_name} failed: {e}")
                    results[model_name] = LLMResult(None, LLMResultStatus.FAILED, str(e))

        # Log summary
        successful = sum(1 for r in results.values() if r.status == LLMResultStatus.SUCCESS)
        logger.info(f"Generated {successful}/{len(results)} answers successfully")

        # Log circuit states after completion
        self._log_circuit_states()

        return results

    def _log_circuit_states(self) -> None:
        """Log the current state of all circuit breakers"""
        logger.debug(
            f"Circuit states - "
            f"OpenAI: {self.openai_circuit.state.value}, "
            f"Anthropic: {self.anthropic_circuit.state.value}, "
            f"Gemini: {self.gemini_circuit.state.value}"
        )

    def get_circuit_status(self) -> Dict[str, Dict]:
        """
        Get status of all circuit breakers.

        Returns:
            Dictionary with circuit breaker states and stats
        """
        return {
            "openai": self.openai_circuit.to_dict(),
            "anthropic": self.anthropic_circuit.to_dict(),
            "gemini": self.gemini_circuit.to_dict()
        }

    def reset_circuits(self) -> None:
        """Reset all circuit breakers to closed state"""
        self.openai_circuit.reset()
        self.anthropic_circuit.reset()
        self.gemini_circuit.reset()
        logger.info("All LLM circuit breakers reset")


# Singleton instance
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """
    Get singleton LLM service instance

    Returns:
        LLM service
    """
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
