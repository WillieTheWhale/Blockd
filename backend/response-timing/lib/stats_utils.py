"""Statistical calculation utilities"""

import logging
from typing import List, Dict, Optional
import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


def calculate_percentile(data: List[float], percentile: float) -> float:
    """
    Calculate percentile of data

    Args:
        data: List of values
        percentile: Percentile to calculate (0-100)

    Returns:
        Percentile value
    """
    if not data:
        return 0.0

    return float(np.percentile(data, percentile))


def calculate_zscore(value: float, mean: float, std: float) -> float:
    """
    Calculate z-score

    Args:
        value: Value to score
        mean: Mean of distribution
        std: Standard deviation

    Returns:
        Z-score
    """
    if std == 0:
        return 0.0

    return (value - mean) / std


def detect_outliers_iqr(data: List[float], multiplier: float = 1.5) -> Dict:
    """
    Detect outliers using IQR method

    Args:
        data: List of values
        multiplier: IQR multiplier (default: 1.5)

    Returns:
        {
            'lower_bound': float,
            'upper_bound': float,
            'outliers': List[float],
            'outlier_indices': List[int]
        }
    """
    if not data:
        return {
            'lower_bound': 0.0,
            'upper_bound': 0.0,
            'outliers': [],
            'outlier_indices': []
        }

    q1 = np.percentile(data, 25)
    q3 = np.percentile(data, 75)
    iqr = q3 - q1

    lower_bound = q1 - (multiplier * iqr)
    upper_bound = q3 + (multiplier * iqr)

    outliers = []
    outlier_indices = []

    for i, value in enumerate(data):
        if value < lower_bound or value > upper_bound:
            outliers.append(value)
            outlier_indices.append(i)

    return {
        'lower_bound': float(lower_bound),
        'upper_bound': float(upper_bound),
        'outliers': outliers,
        'outlier_indices': outlier_indices
    }


def calculate_coefficient_of_variation(data: List[float]) -> float:
    """
    Calculate coefficient of variation (CV)

    CV = (std / mean) * 100

    Args:
        data: List of values

    Returns:
        Coefficient of variation as percentage
    """
    if not data:
        return 0.0

    mean = np.mean(data)
    std = np.std(data)

    if mean == 0:
        return 0.0

    cv = (std / mean) * 100
    return float(cv)


def moving_average(data: List[float], window_size: int) -> List[float]:
    """
    Calculate moving average

    Args:
        data: List of values
        window_size: Window size for moving average

    Returns:
        List of moving averages
    """
    if not data or window_size <= 0:
        return []

    if window_size > len(data):
        window_size = len(data)

    weights = np.ones(window_size) / window_size
    ma = np.convolve(data, weights, mode='valid')

    return ma.tolist()


def calculate_entropy(probabilities: List[float]) -> float:
    """
    Calculate Shannon entropy

    Args:
        probabilities: List of probabilities (must sum to 1.0)

    Returns:
        Entropy value
    """
    if not probabilities:
        return 0.0

    # Filter out zero probabilities
    probs = [p for p in probabilities if p > 0]

    if not probs:
        return 0.0

    entropy = -sum(p * np.log2(p) for p in probs)
    return float(entropy)


def normalize_values(data: List[float], min_val: float = 0.0, max_val: float = 1.0) -> List[float]:
    """
    Normalize values to range [min_val, max_val]

    Args:
        data: List of values
        min_val: Minimum value in normalized range
        max_val: Maximum value in normalized range

    Returns:
        Normalized values
    """
    if not data:
        return []

    data_min = min(data)
    data_max = max(data)

    if data_max == data_min:
        return [min_val] * len(data)

    normalized = [
        min_val + (x - data_min) * (max_val - min_val) / (data_max - data_min)
        for x in data
    ]

    return normalized


def calculate_confidence_interval(
    data: List[float],
    confidence: float = 0.95
) -> Dict[str, float]:
    """
    Calculate confidence interval

    Args:
        data: List of values
        confidence: Confidence level (default: 0.95)

    Returns:
        {
            'mean': float,
            'lower': float,
            'upper': float,
            'margin': float
        }
    """
    if not data:
        return {
            'mean': 0.0,
            'lower': 0.0,
            'upper': 0.0,
            'margin': 0.0
        }

    mean = np.mean(data)
    sem = stats.sem(data)  # Standard error of mean
    margin = sem * stats.t.ppf((1 + confidence) / 2, len(data) - 1)

    return {
        'mean': float(mean),
        'lower': float(mean - margin),
        'upper': float(mean + margin),
        'margin': float(margin)
    }


def detect_change_points(data: List[float], threshold: float = 2.0) -> List[int]:
    """
    Detect change points in time series using z-score

    Args:
        data: List of values
        threshold: Z-score threshold for change detection

    Returns:
        List of indices where changes detected
    """
    if len(data) < 3:
        return []

    change_points = []

    # Calculate differences
    diffs = np.diff(data)

    # Calculate z-scores of differences
    mean_diff = np.mean(diffs)
    std_diff = np.std(diffs)

    if std_diff == 0:
        return []

    z_scores = [(d - mean_diff) / std_diff for d in diffs]

    # Find points exceeding threshold
    for i, z in enumerate(z_scores):
        if abs(z) > threshold:
            change_points.append(i + 1)

    return change_points


def calculate_summary_statistics(data: List[float]) -> Dict:
    """
    Calculate comprehensive summary statistics

    Args:
        data: List of values

    Returns:
        Dictionary of statistics
    """
    if not data:
        return {
            'count': 0,
            'mean': 0.0,
            'median': 0.0,
            'std': 0.0,
            'min': 0.0,
            'max': 0.0,
            'q25': 0.0,
            'q75': 0.0,
            'iqr': 0.0
        }

    return {
        'count': len(data),
        'mean': float(np.mean(data)),
        'median': float(np.median(data)),
        'std': float(np.std(data)),
        'min': float(np.min(data)),
        'max': float(np.max(data)),
        'q25': float(np.percentile(data, 25)),
        'q75': float(np.percentile(data, 75)),
        'iqr': float(np.percentile(data, 75) - np.percentile(data, 25))
    }
