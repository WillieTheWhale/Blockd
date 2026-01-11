"""
XGBoost ensemble classifier for AI detection
Combines multiple features to predict AI-generated content
"""
import logging
import os
from typing import List, Tuple, Optional, NamedTuple


import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

from lib.errors import XGBoostError, ModelLoadError
from src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PredictionResult(NamedTuple):
    """Result of XGBoost prediction with metadata"""
    probability: float
    confidence: float
    using_fallback: bool
    model_type: str  # 'xgboost' or 'rule_based'


class XGBoostClassifier:
    """XGBoost classifier for AI detection"""

    # Feature names for reference
    FEATURE_NAMES = [
        'max_similarity_score',
        'avg_similarity_score',
        'gpt4_similarity',
        'claude_similarity',
        'gemini_similarity',
        'perplexity_score',
        'trigram_overlap',
        'fourgram_overlap',
        'vocabulary_richness',
        'avg_sentence_length',
        'punctuation_density',
        'response_time_ms',
        'gaze_off_screen_percentage',
        'security_event_count',
        'answer_length'
    ]

    def __init__(self, model_path: str = None):
        """
        Initialize XGBoost classifier

        Args:
            model_path: Path to saved model (default from settings)
        """
        self.model_path = model_path or settings.XGBOOST_MODEL_PATH
        self.model: Optional[xgb.Booster] = None
        self.feature_count = len(self.FEATURE_NAMES)

    def load(self):
        """Load trained model from disk"""
        if not os.path.exists(self.model_path):
            logger.warning(f"XGBoost model not found at {self.model_path}. Using default model.")
            self._load_default_model()
            return

        try:
            logger.info(f"Loading XGBoost model from: {self.model_path}")
            self.model = xgb.Booster()
            self.model.load_model(self.model_path)
            logger.info("Successfully loaded XGBoost model")
        except Exception as e:
            logger.error(f"Failed to load XGBoost model: {e}")
            raise ModelLoadError(str(e), "XGBoost")

    def _load_default_model(self):
        """Load a default model with reasonable parameters"""
        logger.info("Creating default XGBoost model")
        # Create a simple model with default parameters
        # In production, this should be replaced with a trained model
        params = {
            'max_depth': 6,
            'eta': 0.3,
            'objective': 'binary:logistic',
            'eval_metric': 'logloss'
        }
        # Create empty model (will need training data)
        self.model = None

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None

    def predict(self, features: List[float]) -> PredictionResult:
        """
        Predict AI probability for a single sample

        Args:
            features: Feature vector (15 features)

        Returns:
            PredictionResult with probability, confidence, and model metadata
        """
        if not self.is_loaded():
            self.load()

        if self.model is None:
            # If no model is available, use rule-based approach
            logger.warning("XGBoost model not available, using rule-based fallback")
            return self._rule_based_prediction(features)

        try:
            # Validate feature count
            if len(features) != self.feature_count:
                raise XGBoostError(
                    f"Expected {self.feature_count} features, got {len(features)}"
                )

            # Create DMatrix
            dmatrix = xgb.DMatrix([features], feature_names=self.FEATURE_NAMES)

            # Predict
            prediction = self.model.predict(dmatrix)[0]

            # Calculate confidence (distance from 0.5)
            confidence = abs(prediction - 0.5) * 2

            return PredictionResult(
                probability=float(prediction),
                confidence=float(confidence),
                using_fallback=False,
                model_type='xgboost'
            )

        except Exception as e:
            logger.error(f"XGBoost prediction failed: {e}")
            raise XGBoostError(str(e))

    def _rule_based_prediction(self, features: List[float]) -> PredictionResult:
        """
        Fallback rule-based prediction when no trained model is available

        Args:
            features: Feature vector

        Returns:
            PredictionResult with fallback flag set to True
        """
        # Extract key features
        max_sim = features[0]  # max_similarity_score
        avg_sim = features[1]  # avg_similarity_score
        perplexity = features[5]  # perplexity_score
        trigram = features[6]  # trigram_overlap
        vocab_richness = features[8]  # vocabulary_richness

        # Simple weighted combination
        score = 0.0

        # High similarity is suspicious
        if max_sim > 0.85:
            score += 0.3
        elif max_sim > 0.75:
            score += 0.2

        if avg_sim > 0.75:
            score += 0.2

        # Low perplexity is suspicious (normalize to 0-1 scale)
        perplexity_normalized = min(perplexity / 100.0, 1.0)
        if perplexity_normalized < 0.5:
            score += 0.2

        # High n-gram overlap is suspicious
        if trigram > 0.7:
            score += 0.15

        # Unnatural vocabulary richness
        if vocab_richness < 0.3 or vocab_richness > 0.8:
            score += 0.15

        # Clamp to 0-1
        score = min(max(score, 0.0), 1.0)

        # Calculate confidence based on feature clarity
        confidence = 0.6  # Moderate confidence for rule-based approach

        return PredictionResult(
            probability=score,
            confidence=confidence,
            using_fallback=True,
            model_type='rule_based'
        )

    def predict_batch(self, features_list: List[List[float]]) -> List[PredictionResult]:
        """
        Predict for multiple samples

        Args:
            features_list: List of feature vectors

        Returns:
            List of PredictionResult objects
        """
        if not self.is_loaded():
            self.load()

        if self.model is None:
            # Use rule-based for each
            logger.warning("XGBoost model not available, using rule-based fallback for batch")
            return [self._rule_based_prediction(f) for f in features_list]

        try:
            # Create DMatrix
            dmatrix = xgb.DMatrix(features_list, feature_names=self.FEATURE_NAMES)

            # Predict
            predictions = self.model.predict(dmatrix)

            # Calculate confidences
            results = []
            for pred in predictions:
                confidence = abs(pred - 0.5) * 2
                results.append(PredictionResult(
                    probability=float(pred),
                    confidence=float(confidence),
                    using_fallback=False,
                    model_type='xgboost'
                ))

            return results

        except Exception as e:
            logger.error(f"Batch prediction failed: {e}")
            raise XGBoostError(str(e))

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        num_boost_round: int = 100,
        params: Optional[dict] = None
    ):
        """
        Train the XGBoost model

        Args:
            X_train: Training features
            y_train: Training labels
            X_val: Validation features
            y_val: Validation labels
            num_boost_round: Number of boosting rounds
            params: XGBoost parameters
        """
        try:
            # Default parameters
            default_params = {
                'max_depth': 6,
                'eta': 0.1,
                'objective': 'binary:logistic',
                'eval_metric': 'logloss',
                'subsample': 0.8,
                'colsample_bytree': 0.8,
                'seed': 42
            }

            if params:
                default_params.update(params)

            # Create DMatrix
            dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=self.FEATURE_NAMES)

            evals = [(dtrain, 'train')]
            if X_val is not None and y_val is not None:
                dval = xgb.DMatrix(X_val, label=y_val, feature_names=self.FEATURE_NAMES)
                evals.append((dval, 'val'))

            # Train
            logger.info("Training XGBoost model...")
            self.model = xgb.train(
                default_params,
                dtrain,
                num_boost_round=num_boost_round,
                evals=evals,
                early_stopping_rounds=10,
                verbose_eval=10
            )

            logger.info("Training completed")

        except Exception as e:
            logger.error(f"Training failed: {e}")
            raise XGBoostError(str(e))

    def save(self, path: Optional[str] = None):
        """
        Save model to disk

        Args:
            path: Save path (default: self.model_path)
        """
        if not self.is_loaded():
            raise XGBoostError("No model to save")

        save_path = path or self.model_path

        try:
            # Create directory if needed
            os.makedirs(os.path.dirname(save_path), exist_ok=True)

            self.model.save_model(save_path)
            logger.info(f"Model saved to {save_path}")

        except Exception as e:
            logger.error(f"Failed to save model: {e}")
            raise XGBoostError(str(e))

    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> dict:
        """
        Evaluate model performance

        Args:
            X_test: Test features
            y_test: Test labels

        Returns:
            Dictionary of metrics
        """
        if not self.is_loaded():
            raise XGBoostError("Model not loaded")

        try:
            # Predict
            dtest = xgb.DMatrix(X_test, feature_names=self.FEATURE_NAMES)
            y_pred_proba = self.model.predict(dtest)
            y_pred = (y_pred_proba >= 0.5).astype(int)

            # Calculate metrics
            metrics = {
                'accuracy': accuracy_score(y_test, y_pred),
                'precision': precision_score(y_test, y_pred, zero_division=0),
                'recall': recall_score(y_test, y_pred, zero_division=0),
                'f1': f1_score(y_test, y_pred, zero_division=0)
            }

            return metrics

        except Exception as e:
            logger.error(f"Evaluation failed: {e}")
            raise XGBoostError(str(e))


# Singleton instance
_xgboost_classifier: Optional[XGBoostClassifier] = None


def get_xgboost_classifier() -> XGBoostClassifier:
    """
    Get singleton XGBoost classifier instance

    Returns:
        XGBoost classifier
    """
    global _xgboost_classifier
    if _xgboost_classifier is None:
        _xgboost_classifier = XGBoostClassifier()
        _xgboost_classifier.load()
    return _xgboost_classifier
