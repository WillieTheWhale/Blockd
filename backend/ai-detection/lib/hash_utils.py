"""
Hashing utilities for AI Detection Service
Used for question hashing and caching
"""
import hashlib
from typing import Optional
from .text_utils import normalize_text


def hash_text(text: str, algorithm: str = "sha256") -> str:
    """
    Generate hash of text using specified algorithm

    Args:
        text: Input text
        algorithm: Hashing algorithm (sha256, md5, etc.)

    Returns:
        Hex digest of hash
    """
    hasher = hashlib.new(algorithm)
    hasher.update(text.encode('utf-8'))
    return hasher.hexdigest()


def hash_question(question_text: str, normalize: bool = True) -> str:
    """
    Generate consistent hash for a question
    Used for caching and deduplication

    Args:
        question_text: Question text
        normalize: Apply text normalization before hashing

    Returns:
        SHA-256 hash of question
    """
    if normalize:
        # Normalize to ensure consistent hashing
        question_text = normalize_text(
            question_text,
            lowercase=True,
            remove_punctuation=False
        )

    return hash_text(question_text, algorithm="sha256")


def verify_hash(text: str, expected_hash: str, algorithm: str = "sha256") -> bool:
    """
    Verify that text matches expected hash

    Args:
        text: Input text
        expected_hash: Expected hash value
        algorithm: Hashing algorithm

    Returns:
        True if hash matches
    """
    actual_hash = hash_text(text, algorithm)
    return actual_hash == expected_hash


def short_hash(text: str, length: int = 8) -> str:
    """
    Generate short hash for display purposes

    Args:
        text: Input text
        length: Length of short hash

    Returns:
        Short hash string
    """
    full_hash = hash_text(text, algorithm="sha256")
    return full_hash[:length]
