"""
Model manager for loading and caching all ML models
Ensures models are loaded once and reused
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Dict, Callable, Any

import torch

from .embedding_model import EmbeddingModel, get_embedding_model
from .perplexity_model import PerplexityModel, get_perplexity_model
from .xgboost_classifier import XGBoostClassifier, get_xgboost_classifier

logger = logging.getLogger(__name__)


class ModelManager:
    """Manages all ML models for the service"""

    def __init__(self):
        self._embedding_model: Optional[EmbeddingModel] = None
        self._perplexity_model: Optional[PerplexityModel] = None
        self._xgboost_classifier: Optional[XGBoostClassifier] = None
        self._models_loaded = False

    def load_all_models(self):
        """
        Load all required models in parallel using ThreadPoolExecutor.

        This significantly reduces startup time by loading the embedding model,
        perplexity model, and XGBoost classifier concurrently instead of sequentially.
        """
        logger.info("Loading all ML models in parallel...")

        # Define model loaders with their names for logging
        model_loaders: Dict[str, Callable[[], Any]] = {
            "embedding_model": get_embedding_model,
            "perplexity_model": get_perplexity_model,
            "xgboost_classifier": get_xgboost_classifier,
        }

        results: Dict[str, Any] = {}
        errors: Dict[str, Exception] = {}

        # Use ThreadPoolExecutor to load models in parallel
        # Note: We use threads (not processes) because the models may share
        # GPU resources and thread-based parallelism works better with PyTorch
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix="model_loader_") as executor:
            # Submit all loading tasks
            future_to_name = {
                executor.submit(loader): name
                for name, loader in model_loaders.items()
            }

            # Collect results as they complete
            for future in as_completed(future_to_name):
                name = future_to_name[future]
                try:
                    logger.info(f"Loading {name}...")
                    results[name] = future.result()
                    logger.info(f"Successfully loaded {name}")
                except Exception as e:
                    logger.error(f"Failed to load {name}: {e}")
                    errors[name] = e

        # Check for any failures
        if errors:
            error_msg = "; ".join(f"{name}: {err}" for name, err in errors.items())
            raise RuntimeError(f"Failed to load models: {error_msg}")

        # Assign loaded models to instance variables
        self._embedding_model = results["embedding_model"]
        self._perplexity_model = results["perplexity_model"]
        self._xgboost_classifier = results["xgboost_classifier"]

        self._models_loaded = True
        logger.info("All models loaded successfully in parallel")

    def get_embedding_model(self) -> EmbeddingModel:
        """Get embedding model instance"""
        if self._embedding_model is None:
            self._embedding_model = get_embedding_model()
        return self._embedding_model

    def get_perplexity_model(self) -> PerplexityModel:
        """Get perplexity model instance"""
        if self._perplexity_model is None:
            self._perplexity_model = get_perplexity_model()
        return self._perplexity_model

    def get_xgboost_classifier(self) -> XGBoostClassifier:
        """Get XGBoost classifier instance"""
        if self._xgboost_classifier is None:
            self._xgboost_classifier = get_xgboost_classifier()
        return self._xgboost_classifier

    def are_models_loaded(self) -> bool:
        """Check if all models are loaded"""
        return self._models_loaded

    def get_model_status(self) -> Dict[str, bool]:
        """
        Get status of all models

        Returns:
            Dictionary of model names and their loading status
        """
        return {
            'embedding_model': self._embedding_model is not None and self._embedding_model.is_loaded(),
            'perplexity_model': self._perplexity_model is not None and self._perplexity_model.is_loaded(),
            'xgboost_classifier': self._xgboost_classifier is not None and self._xgboost_classifier.is_loaded()
        }

    def unload_models(self):
        """Unload all models with proper GPU memory cleanup"""
        logger.info("Unloading all models...")

        # Clean up embedding model (if it has cleanup method)
        if self._embedding_model is not None:
            if hasattr(self._embedding_model, 'cleanup'):
                try:
                    self._embedding_model.cleanup()
                except Exception as e:
                    logger.error(f"Error cleaning up embedding model: {e}")
            self._embedding_model = None

        # Clean up perplexity model (has cleanup method for GPU memory)
        if self._perplexity_model is not None:
            if hasattr(self._perplexity_model, 'cleanup'):
                try:
                    self._perplexity_model.cleanup()
                except Exception as e:
                    logger.error(f"Error cleaning up perplexity model: {e}")
            self._perplexity_model = None

        # Clean up XGBoost classifier (if it has cleanup method)
        if self._xgboost_classifier is not None:
            if hasattr(self._xgboost_classifier, 'cleanup'):
                try:
                    self._xgboost_classifier.cleanup()
                except Exception as e:
                    logger.error(f"Error cleaning up XGBoost classifier: {e}")
            self._xgboost_classifier = None

        self._models_loaded = False

        # Final CUDA cache clear to release any remaining GPU memory
        if torch.cuda.is_available():
            try:
                torch.cuda.empty_cache()
                logger.info("Final CUDA cache clear completed")
            except Exception as e:
                logger.error(f"Error clearing CUDA cache: {e}")

        logger.info("All models unloaded with GPU memory cleanup")


# Singleton instance
_model_manager: Optional[ModelManager] = None


def get_model_manager() -> ModelManager:
    """
    Get singleton model manager instance

    Returns:
        Model manager
    """
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager


def initialize_models():
    """Initialize all models at startup"""
    manager = get_model_manager()
    manager.load_all_models()
