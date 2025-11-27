"""
Vector operations and similarity calculations
"""
import numpy as np
from typing import List, Union


def cosine_similarity(vec1: Union[List[float], np.ndarray], vec2: Union[List[float], np.ndarray]) -> float:
    """
    Calculate cosine similarity between two vectors

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Cosine similarity score (-1 to 1, typically 0 to 1)
    """
    # Convert to numpy arrays
    v1 = np.array(vec1)
    v2 = np.array(vec2)

    # Calculate dot product
    dot_product = np.dot(v1, v2)

    # Calculate magnitudes
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)

    # Avoid division by zero
    if norm1 == 0 or norm2 == 0:
        return 0.0

    # Calculate cosine similarity
    similarity = dot_product / (norm1 * norm2)

    return float(similarity)


def euclidean_distance(vec1: Union[List[float], np.ndarray], vec2: Union[List[float], np.ndarray]) -> float:
    """
    Calculate Euclidean distance between two vectors

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Euclidean distance
    """
    v1 = np.array(vec1)
    v2 = np.array(vec2)

    return float(np.linalg.norm(v1 - v2))


def manhattan_distance(vec1: Union[List[float], np.ndarray], vec2: Union[List[float], np.ndarray]) -> float:
    """
    Calculate Manhattan distance between two vectors

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Manhattan distance
    """
    v1 = np.array(vec1)
    v2 = np.array(vec2)

    return float(np.sum(np.abs(v1 - v2)))


def normalize_vector(vec: Union[List[float], np.ndarray]) -> np.ndarray:
    """
    Normalize vector to unit length

    Args:
        vec: Input vector

    Returns:
        Normalized vector
    """
    v = np.array(vec)
    norm = np.linalg.norm(v)

    if norm == 0:
        return v

    return v / norm


def batch_cosine_similarity(vec: Union[List[float], np.ndarray], vectors: List[Union[List[float], np.ndarray]]) -> List[float]:
    """
    Calculate cosine similarity between one vector and multiple vectors

    Args:
        vec: Query vector
        vectors: List of vectors to compare against

    Returns:
        List of similarity scores
    """
    v = np.array(vec)
    similarities = []

    for other_vec in vectors:
        similarity = cosine_similarity(v, other_vec)
        similarities.append(similarity)

    return similarities


def vector_magnitude(vec: Union[List[float], np.ndarray]) -> float:
    """
    Calculate magnitude (L2 norm) of vector

    Args:
        vec: Input vector

    Returns:
        Magnitude
    """
    v = np.array(vec)
    return float(np.linalg.norm(v))


def dot_product(vec1: Union[List[float], np.ndarray], vec2: Union[List[float], np.ndarray]) -> float:
    """
    Calculate dot product of two vectors

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Dot product
    """
    v1 = np.array(vec1)
    v2 = np.array(vec2)

    return float(np.dot(v1, v2))


def vector_mean(vectors: List[Union[List[float], np.ndarray]]) -> np.ndarray:
    """
    Calculate mean of multiple vectors

    Args:
        vectors: List of vectors

    Returns:
        Mean vector
    """
    if not vectors:
        return np.array([])

    v_array = np.array(vectors)
    return np.mean(v_array, axis=0)


def vector_to_list(vec: np.ndarray) -> List[float]:
    """
    Convert numpy array to list of floats

    Args:
        vec: Numpy array

    Returns:
        List of floats
    """
    return vec.tolist()
