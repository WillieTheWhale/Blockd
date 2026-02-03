"""
Perplexity scoring using GPT-2
Lower perplexity indicates more AI-like text
"""
import logging
import math
from typing import Optional
import torch
from transformers import GPT2LMHeadModel, GPT2TokenizerFast
from tenacity import retry, stop_after_attempt, wait_exponential

from lib.errors import PerplexityError, ModelLoadError
from src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PerplexityModel:
    """Perplexity scoring model using GPT-2"""

    def __init__(self, model_name: str = None):
        """
        Initialize perplexity model

        Args:
            model_name: Model name/path (default from settings)
        """
        self.model_name = model_name or settings.PERPLEXITY_MODEL
        self.model: Optional[GPT2LMHeadModel] = None
        self.tokenizer: Optional[GPT2TokenizerFast] = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Perplexity model will use device: {self.device}")

    def load(self):
        """Load the perplexity model"""
        try:
            logger.info(f"Loading perplexity model: {self.model_name}")
            self.tokenizer = GPT2TokenizerFast.from_pretrained(self.model_name)
            self.model = GPT2LMHeadModel.from_pretrained(self.model_name)
            self.model.to(self.device)
            self.model.eval()
            logger.info(f"Successfully loaded perplexity model on {self.device}")
        except Exception as e:
            logger.error(f"Failed to load perplexity model: {e}")
            raise ModelLoadError(str(e), self.model_name)

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None and self.tokenizer is not None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def calculate_perplexity(self, text: str, max_length: int = 1024) -> float:
        """
        Calculate perplexity of text
        Lower perplexity = more predictable/AI-like

        Args:
            text: Input text
            max_length: Maximum sequence length

        Returns:
            Perplexity score
        """
        if not self.is_loaded():
            self.load()

        try:
            # Tokenize
            encodings = self.tokenizer(
                text,
                return_tensors="pt",
                max_length=max_length,
                truncation=True
            )

            input_ids = encodings.input_ids.to(self.device)

            # Calculate perplexity
            with torch.no_grad():
                outputs = self.model(input_ids, labels=input_ids)
                loss = outputs.loss
                perplexity = torch.exp(loss)

            perplexity_value = float(perplexity.item())

            # Validate output - check for NaN or Inf
            if math.isnan(perplexity_value) or math.isinf(perplexity_value):
                logger.warning(
                    f"Perplexity calculation produced invalid value: {perplexity_value}, "
                    f"loss: {loss.item()}, text length: {len(text)}"
                )
                # Return a high but valid perplexity for invalid results
                return 1000.0

            return perplexity_value

        except Exception as e:
            logger.error(f"Perplexity calculation failed: {e}")
            raise PerplexityError(str(e))

    def calculate_perplexity_sliding_window(
        self,
        text: str,
        window_size: int = 512,
        stride: int = 256
    ) -> float:
        """
        Calculate perplexity using sliding window for long texts

        Args:
            text: Input text
            window_size: Window size in tokens
            stride: Stride between windows

        Returns:
            Average perplexity across windows
        """
        if not self.is_loaded():
            self.load()

        try:
            # Tokenize entire text
            encodings = self.tokenizer(text, return_tensors="pt")
            input_ids = encodings.input_ids[0]

            # If text is short enough, calculate directly
            if len(input_ids) <= window_size:
                return self.calculate_perplexity(text, max_length=window_size)

            # Sliding window
            perplexities = []
            num_windows = (len(input_ids) - window_size) // stride + 1

            for i in range(num_windows):
                start = i * stride
                end = start + window_size
                window_ids = input_ids[start:end].unsqueeze(0).to(self.device)

                with torch.no_grad():
                    outputs = self.model(window_ids, labels=window_ids)
                    loss = outputs.loss
                    perplexity = torch.exp(loss)
                    perplexity_value = float(perplexity.item())

                    # Skip invalid values
                    if not (math.isnan(perplexity_value) or math.isinf(perplexity_value)):
                        perplexities.append(perplexity_value)

            # Return average perplexity (or default if all were invalid)
            if not perplexities:
                logger.warning("All window perplexities were invalid, returning default")
                return 1000.0
            return sum(perplexities) / len(perplexities)

        except Exception as e:
            logger.error(f"Sliding window perplexity calculation failed: {e}")
            raise PerplexityError(str(e))

    def calculate_token_perplexities(self, text: str, max_length: int = 1024) -> list:
        """
        Calculate per-token perplexities

        Args:
            text: Input text
            max_length: Maximum sequence length

        Returns:
            List of token-level perplexities
        """
        if not self.is_loaded():
            self.load()

        try:
            encodings = self.tokenizer(
                text,
                return_tensors="pt",
                max_length=max_length,
                truncation=True
            )

            input_ids = encodings.input_ids.to(self.device)

            with torch.no_grad():
                outputs = self.model(input_ids, labels=input_ids)
                logits = outputs.logits

                # Calculate cross-entropy for each token
                shift_logits = logits[..., :-1, :].contiguous()
                shift_labels = input_ids[..., 1:].contiguous()

                loss_fct = torch.nn.CrossEntropyLoss(reduction='none')
                losses = loss_fct(
                    shift_logits.view(-1, shift_logits.size(-1)),
                    shift_labels.view(-1)
                )

                # Convert to perplexity
                perplexities = torch.exp(losses)

            return perplexities.cpu().tolist()

        except Exception as e:
            logger.error(f"Token perplexity calculation failed: {e}")
            raise PerplexityError(str(e))

    def cleanup(self):
        """
        Clean up GPU memory by moving model to CPU, deleting it,
        and clearing CUDA cache.

        This method should be called before unloading the model to prevent
        GPU memory leaks, especially in long-running services.
        """
        if self.model is not None:
            try:
                logger.info(f"Cleaning up perplexity model GPU memory")

                # Move model to CPU first to free GPU memory
                self.model.to('cpu')

                # Delete model reference
                del self.model
                self.model = None

                # Delete tokenizer
                if self.tokenizer is not None:
                    del self.tokenizer
                    self.tokenizer = None

                # Clear CUDA cache if GPU was used
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("CUDA cache cleared")

                logger.info("Perplexity model cleanup completed")

            except Exception as e:
                logger.error(f"Error during perplexity model cleanup: {e}")
                # Still try to clear CUDA cache even if other cleanup failed
                if torch.cuda.is_available():
                    try:
                        torch.cuda.empty_cache()
                    except Exception:
                        pass


# Singleton instance
_perplexity_model: Optional[PerplexityModel] = None


def get_perplexity_model() -> PerplexityModel:
    """
    Get singleton perplexity model instance

    Returns:
        Perplexity model
    """
    global _perplexity_model
    if _perplexity_model is None:
        _perplexity_model = PerplexityModel()
        _perplexity_model.load()
    return _perplexity_model
