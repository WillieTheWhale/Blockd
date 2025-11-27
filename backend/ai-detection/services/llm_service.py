"""
LLM service for generating AI answers from multiple models
Supports OpenAI GPT-4, Anthropic Claude, and Google Gemini
"""
import asyncio
import logging
from typing import Dict, Optional
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from ..lib.errors import LLMServiceError
from ..src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMService:
    """Multi-LLM answer generation service"""

    def __init__(self):
        """Initialize LLM clients"""
        # OpenAI
        self.openai_client = None
        if settings.OPENAI_API_KEY:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        # Anthropic
        self.anthropic_client = None
        if settings.ANTHROPIC_API_KEY:
            self.anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        # Google Generative AI
        if settings.GOOGLE_API_KEY:
            genai.configure(api_key=settings.GOOGLE_API_KEY)

    @retry(
        stop=stop_after_attempt(settings.LLM_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,))
    )
    async def generate_gpt4_answer(self, question: str) -> str:
        """
        Generate answer using GPT-4

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails
        """
        if not self.openai_client:
            raise LLMServiceError("OpenAI API key not configured", "gpt-4")

        try:
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

            answer = response.choices[0].message.content.strip()
            logger.info(f"GPT-4 answer generated ({len(answer)} chars)")
            return answer

        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", "gpt-4")
        except Exception as e:
            logger.error(f"GPT-4 API error: {e}")
            raise LLMServiceError(str(e), "gpt-4")

    @retry(
        stop=stop_after_attempt(settings.LLM_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,))
    )
    async def generate_claude_answer(self, question: str) -> str:
        """
        Generate answer using Claude

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails
        """
        if not self.anthropic_client:
            raise LLMServiceError("Anthropic API key not configured", "claude")

        try:
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

            answer = response.content[0].text.strip()
            logger.info(f"Claude answer generated ({len(answer)} chars)")
            return answer

        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", "claude")
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            raise LLMServiceError(str(e), "claude")

    @retry(
        stop=stop_after_attempt(settings.LLM_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,))
    )
    async def generate_gemini_answer(self, question: str) -> str:
        """
        Generate answer using Gemini

        Args:
            question: Interview question

        Returns:
            Generated answer

        Raises:
            LLMServiceError: If API call fails
        """
        if not settings.GOOGLE_API_KEY:
            raise LLMServiceError("Google API key not configured", "gemini")

        try:
            model = genai.GenerativeModel(settings.GOOGLE_MODEL)

            response = await asyncio.wait_for(
                model.generate_content_async(
                    f"Answer this interview question concisely and professionally: {question}"
                ),
                timeout=settings.LLM_TIMEOUT
            )

            answer = response.text.strip()
            logger.info(f"Gemini answer generated ({len(answer)} chars)")
            return answer

        except asyncio.TimeoutError:
            raise LLMServiceError("Request timeout", "gemini")
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise LLMServiceError(str(e), "gemini")

    async def generate_all_answers(self, question: str) -> Dict[str, Optional[str]]:
        """
        Generate answers from all available LLMs in parallel

        Args:
            question: Interview question

        Returns:
            Dictionary of model names to answers
        """
        results = {
            "gpt-4": None,
            "claude-3.5-sonnet": None,
            "gemini-1.5-pro": None
        }

        # Define tasks
        tasks = {}

        if self.openai_client:
            tasks["gpt-4"] = self.generate_gpt4_answer(question)

        if self.anthropic_client:
            tasks["claude-3.5-sonnet"] = self.generate_claude_answer(question)

        if settings.GOOGLE_API_KEY:
            tasks["gemini-1.5-pro"] = self.generate_gemini_answer(question)

        # Execute in parallel if enabled
        if settings.PARALLEL_LLM_CALLS and tasks:
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

        return results


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
