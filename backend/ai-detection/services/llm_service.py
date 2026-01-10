"""
LLM service for generating AI answers from multiple models
Supports OpenAI GPT-4, Anthropic Claude, and Google Gemini

Implements circuit breaker pattern to prevent cascading failures
when external LLM providers are unavailable.
"""
import asyncio
import logging
from typing import Dict, Optional
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

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
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    async def generate_gpt4_answer(self, question: str) -> str:
        """
        Generate answer using GPT-4 with circuit breaker protection.

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails or circuit is open
        """
        if not self.openai_client:
            raise LLMServiceError("OpenAI API key not configured", "gpt-4")

        try:
            answer = await self.openai_circuit.call(
                self._call_openai,
                question
            )
            logger.info(f"GPT-4 answer generated ({len(answer)} chars)")
            return answer

        except CircuitOpenError as e:
            logger.warning(f"GPT-4 circuit breaker is open: {e}")
            raise LLMServiceError(
                f"OpenAI service temporarily unavailable (circuit open)",
                "gpt-4"
            )
        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", "gpt-4")
        except Exception as e:
            logger.error(f"GPT-4 API error: {e}")
            raise LLMServiceError(str(e), "gpt-4")

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    async def generate_claude_answer(self, question: str) -> str:
        """
        Generate answer using Claude with circuit breaker protection.

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails or circuit is open
        """
        if not self.anthropic_client:
            raise LLMServiceError("Anthropic API key not configured", "claude")

        try:
            answer = await self.anthropic_circuit.call(
                self._call_anthropic,
                question
            )
            logger.info(f"Claude answer generated ({len(answer)} chars)")
            return answer

        except CircuitOpenError as e:
            logger.warning(f"Claude circuit breaker is open: {e}")
            raise LLMServiceError(
                f"Anthropic service temporarily unavailable (circuit open)",
                "claude"
            )
        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", "claude")
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            raise LLMServiceError(str(e), "claude")

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((Exception,)),
        reraise=True
    )
    async def generate_gemini_answer(self, question: str) -> str:
        """
        Generate answer using Gemini with circuit breaker protection.

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails or circuit is open
        """
        if not settings.GOOGLE_API_KEY:
            raise LLMServiceError("Google API key not configured", "gemini")

        try:
            answer = await self.gemini_circuit.call(
                self._call_gemini,
                question
            )
            logger.info(f"Gemini answer generated ({len(answer)} chars)")
            return answer

        except CircuitOpenError as e:
            logger.warning(f"Gemini circuit breaker is open: {e}")
            raise LLMServiceError(
                f"Google service temporarily unavailable (circuit open)",
                "gemini"
            )
        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", "gemini")
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise LLMServiceError(str(e), "gemini")

    async def generate_all_answers(self, question: str) -> Dict[str, Optional[str]]:
        """
        Generate answers from all available LLMs in parallel.
        Uses circuit breakers to fail fast for unavailable providers.

        Args:
            question: Interview question

        Returns:
            Dictionary of model names to answers (None if failed)
        """
        results = {
            "gpt-4": None,
            "claude-3.5-sonnet": None,
            "gemini-1.5-pro": None
        }

        # Log circuit breaker states
        self._log_circuit_states()

        # Define tasks for available (non-open circuit) providers
        tasks = {}

        if self.openai_client and not self.openai_circuit.is_open:
            tasks["gpt-4"] = self.generate_gpt4_answer(question)
        elif self.openai_circuit.is_open:
            logger.info("Skipping GPT-4: circuit is open")

        if self.anthropic_client and not self.anthropic_circuit.is_open:
            tasks["claude-3.5-sonnet"] = self.generate_claude_answer(question)
        elif self.anthropic_circuit.is_open:
            logger.info("Skipping Claude: circuit is open")

        if settings.GOOGLE_API_KEY and not self.gemini_circuit.is_open:
            tasks["gemini-1.5-pro"] = self.generate_gemini_answer(question)
        elif self.gemini_circuit.is_open:
            logger.info("Skipping Gemini: circuit is open")

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
                    logger.error(f"{model_name} failed: {e}")
                    results[model_name] = None

        # Log summary
        successful = sum(1 for v in results.values() if v is not None)
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
