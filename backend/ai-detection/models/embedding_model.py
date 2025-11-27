"""
Sentence embedding model using sentence-transformers
Generates 384-dimensional embeddings for semantic similarity
"""
import logging
from typing import List, Union
import torch
from sentence_transformers import SentenceTransformer
from tenacity import retry, stop_after_attempt, wait_exponential

from ..lib.errors import EmbeddingError, ModelLoadError
from ..src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmbeddingModel:
    """Sentence embedding model wrapper"""

    def __init__(self, model_name: str = None):
        """
        Initialize embedding model

        Args:
            model_name: Model name/path (default from settings)
        """
        self.model_name = model_name or settings.EMBEDDING_MODEL
        self.model: SentenceTransformer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Embedding model will use device: {self.device}")

    def load(self):
        """Load the embedding model"""
        try:
            logger.info(f"Loading embedding model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name, device=self.device)
            logger.info(f"Successfully loaded embedding model on {self.device}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise ModelLoadError(str(e), self.model_name)

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def encode(
        self,
        texts: Union[str, List[str]],
        batch_size: int = 32,
        show_progress: bool = False,
        normalize: bool = True
    ) -> Union[List[float], List[List[float]]]:
        """
        Encode text(s) to embeddings

        Args:
            texts: Single text or list of texts
            batch_size: Batch size for encoding
            show_progress: Show progress bar
            normalize: Normalize embeddings to unit length

        Returns:
            Embedding(s) as list(s) of floats
        """
        if not self.is_loaded():
            self.load()

        try:
            # Check if single text or list
            is_single = isinstance(texts, str)
            if is_single:
                texts = [texts]

            # Encode
            embeddings = self.model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=show_progress,
                convert_to_numpy=True,
                normalize_embeddings=normalize
            )

            # Convert to list
            embeddings_list = embeddings.tolist()

            # Return single embedding if input was single text
            if is_single:
                return embeddings_list[0]

            return embeddings_list

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise EmbeddingError(str(e))

    def encode_batch(
        self,
        texts: List[str],
        batch_size: int = 32
    ) -> List[List[float]]:
        """
        Encode multiple texts efficiently

        Args:
            texts: List of texts
            batch_size: Batch size

        Returns:
            List of embeddings
        """
        return self.encode(texts, batch_size=batch_size, show_progress=False)

    def get_embedding_dim(self) -> int:
        """
        Get embedding dimension

        Returns:
            Embedding dimension
        """
        if not self.is_loaded():
            self.load()

        return self.model.get_sentence_embedding_dimension()

    def similarity(self, text1: str, text2: str) -> float:
        """
        Calculate semantic similarity between two texts

        Args:
            text1: First text
            text2: Second text

        Returns:
            Similarity score (0-1)
        """
        embeddings = self.encode([text1, text2])
        emb1, emb2 = embeddings[0], embeddings[1]

        # Cosine similarity (embeddings are already normalized)
        from ..lib.vector_utils import cosine_similarity
        return cosine_similarity(emb1, emb2)


# Singleton instance
_embedding_model: EmbeddingModel = None


def get_embedding_model() -> EmbeddingModel:
    """
    Get singleton embedding model instance

    Returns:
        Embedding model
    """
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = EmbeddingModel()
        _embedding_model.load()
    return _embedding_model
