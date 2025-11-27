"""
XGBoost model training script
Trains the AI detection classifier
"""
import sys
import os
import logging
import argparse
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
import xgboost as xgb

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from models.xgboost_classifier import XGBoostClassifier

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def generate_synthetic_training_data(n_samples=1000):
    """
    Generate synthetic training data for initial model training
    In production, replace with real labeled data

    Args:
        n_samples: Number of samples to generate

    Returns:
        Tuple of (X, y) - features and labels
    """
    logger.info(f"Generating {n_samples} synthetic training samples...")

    np.random.seed(42)
    data = []

    # Generate human samples (label = 0)
    for i in range(n_samples // 2):
        # Human answers tend to have:
        # - Lower max similarity (0.3-0.7)
        # - Higher perplexity (60-150)
        # - Lower n-gram overlap (0.2-0.5)
        # - More natural vocabulary richness (0.4-0.7)
        sample = {
            'max_similarity_score': np.random.uniform(0.3, 0.7),
            'avg_similarity_score': np.random.uniform(0.25, 0.65),
            'gpt4_similarity': np.random.uniform(0.25, 0.65),
            'claude_similarity': np.random.uniform(0.25, 0.65),
            'gemini_similarity': np.random.uniform(0.25, 0.65),
            'perplexity_score': np.random.uniform(60, 150),
            'trigram_overlap': np.random.uniform(0.2, 0.5),
            'fourgram_overlap': np.random.uniform(0.15, 0.45),
            'vocabulary_richness': np.random.uniform(0.4, 0.7),
            'avg_sentence_length': np.random.uniform(12, 25),
            'punctuation_density': np.random.uniform(0.03, 0.10),
            'response_time_ms': np.random.uniform(15000, 120000),
            'gaze_off_screen_percentage': np.random.uniform(5, 30),
            'security_event_count': np.random.randint(0, 3),
            'answer_length': np.random.randint(100, 500),
            'label': 0
        }
        data.append(sample)

    # Generate AI samples (label = 1)
    for i in range(n_samples // 2):
        # AI answers tend to have:
        # - Higher max similarity (0.7-0.95)
        # - Lower perplexity (20-60)
        # - Higher n-gram overlap (0.5-0.9)
        # - More unnatural vocabulary richness (0.2-0.4 or 0.8-0.9)
        sample = {
            'max_similarity_score': np.random.uniform(0.7, 0.95),
            'avg_similarity_score': np.random.uniform(0.65, 0.90),
            'gpt4_similarity': np.random.uniform(0.65, 0.90),
            'claude_similarity': np.random.uniform(0.65, 0.90),
            'gemini_similarity': np.random.uniform(0.65, 0.90),
            'perplexity_score': np.random.uniform(20, 60),
            'trigram_overlap': np.random.uniform(0.5, 0.9),
            'fourgram_overlap': np.random.uniform(0.45, 0.85),
            'vocabulary_richness': np.random.choice([
                np.random.uniform(0.2, 0.4),
                np.random.uniform(0.8, 0.9)
            ]),
            'avg_sentence_length': np.random.uniform(18, 28),
            'punctuation_density': np.random.uniform(0.06, 0.12),
            'response_time_ms': np.random.uniform(1000, 15000),
            'gaze_off_screen_percentage': np.random.uniform(20, 60),
            'security_event_count': np.random.randint(2, 10),
            'answer_length': np.random.randint(150, 600),
            'label': 1
        }
        data.append(sample)

    df = pd.DataFrame(data)

    # Shuffle
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)

    X = df.drop('label', axis=1).values
    y = df['label'].values

    logger.info(f"Generated {len(X)} samples: {np.sum(y==0)} human, {np.sum(y==1)} AI")
    return X, y


def train_model(X_train, y_train, X_val, y_val, output_path):
    """
    Train XGBoost model

    Args:
        X_train: Training features
        y_train: Training labels
        X_val: Validation features
        y_val: Validation labels
        output_path: Path to save model
    """
    logger.info("Training XGBoost model...")

    # Hyperparameters (tuned for AI detection)
    params = {
        'max_depth': 6,
        'eta': 0.1,
        'objective': 'binary:logistic',
        'eval_metric': 'logloss',
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'min_child_weight': 3,
        'gamma': 0.1,
        'seed': 42
    }

    # Create classifier
    classifier = XGBoostClassifier(model_path=output_path)

    # Train
    classifier.train(
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        num_boost_round=200,
        params=params
    )

    # Save model
    classifier.save(output_path)
    logger.info(f"Model saved to {output_path}")

    return classifier


def evaluate_model(classifier, X_test, y_test):
    """
    Evaluate model performance

    Args:
        classifier: Trained classifier
        X_test: Test features
        y_test: Test labels
    """
    logger.info("Evaluating model...")

    # Get metrics
    metrics = classifier.evaluate(X_test, y_test)

    logger.info("Model Performance:")
    logger.info(f"  Accuracy:  {metrics['accuracy']:.4f}")
    logger.info(f"  Precision: {metrics['precision']:.4f}")
    logger.info(f"  Recall:    {metrics['recall']:.4f}")
    logger.info(f"  F1 Score:  {metrics['f1']:.4f}")

    # Predictions
    predictions = []
    for x in X_test:
        pred, conf = classifier.predict(x.tolist())
        predictions.append((pred >= 0.5))

    # Classification report
    logger.info("\nClassification Report:")
    logger.info(classification_report(y_test, predictions, target_names=['Human', 'AI']))

    # Confusion matrix
    cm = confusion_matrix(y_test, predictions)
    logger.info("\nConfusion Matrix:")
    logger.info(f"  TN: {cm[0][0]}, FP: {cm[0][1]}")
    logger.info(f"  FN: {cm[1][0]}, TP: {cm[1][1]}")


def main():
    """Main training function"""
    parser = argparse.ArgumentParser(description='Train XGBoost AI detection model')
    parser.add_argument('--samples', type=int, default=1000, help='Number of training samples')
    parser.add_argument('--output', type=str, default='./models/xgboost_classifier.json',
                       help='Output model path')
    parser.add_argument('--data', type=str, help='Path to real training data CSV (optional)')

    args = parser.parse_args()

    # Create output directory
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    # Load or generate data
    if args.data:
        logger.info(f"Loading training data from {args.data}")
        df = pd.read_csv(args.data)
        X = df.drop('label', axis=1).values
        y = df['label'].values
    else:
        logger.info("Generating synthetic training data...")
        X, y = generate_synthetic_training_data(args.samples)

    # Split data
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.5, random_state=42, stratify=y_temp
    )

    logger.info(f"Training set: {len(X_train)} samples")
    logger.info(f"Validation set: {len(X_val)} samples")
    logger.info(f"Test set: {len(X_test)} samples")

    # Train model
    classifier = train_model(X_train, y_train, X_val, y_val, args.output)

    # Evaluate
    evaluate_model(classifier, X_test, y_test)

    logger.info("Training complete!")


if __name__ == "__main__":
    main()
