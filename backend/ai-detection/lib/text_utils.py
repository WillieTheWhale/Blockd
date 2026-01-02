"""
Text processing utilities for AI Detection Service
Includes normalization, tokenization, and text analysis
"""
import re
import string
from typing import List, Set, Tuple
import unicodedata


def normalize_text(text: str, lowercase: bool = True, remove_punctuation: bool = False) -> str:
    """
    Normalize text for consistent processing

    Args:
        text: Input text
        lowercase: Convert to lowercase
        remove_punctuation: Remove punctuation marks

    Returns:
        Normalized text
    """
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Normalize unicode characters
    text = unicodedata.normalize('NFKC', text)

    if lowercase:
        text = text.lower()

    if remove_punctuation:
        text = text.translate(str.maketrans('', '', string.punctuation))

    return text


def tokenize(text: str, preserve_case: bool = False) -> List[str]:
    """
    Simple word tokenization

    Args:
        text: Input text
        preserve_case: Keep original case

    Returns:
        List of tokens
    """
    if not preserve_case:
        text = text.lower()

    # Split on whitespace and punctuation
    tokens = re.findall(r'\b\w+\b', text)
    return tokens


def tokenize_sentences(text: str) -> List[str]:
    """
    Split text into sentences

    Args:
        text: Input text

    Returns:
        List of sentences
    """
    # Simple sentence splitting
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    return sentences


def extract_ngrams(tokens: List[str], n: int) -> List[Tuple[str, ...]]:
    """
    Extract n-grams from token list

    Args:
        tokens: List of tokens
        n: N-gram size

    Returns:
        List of n-grams as tuples
    """
    if len(tokens) < n:
        return []

    ngrams = []
    for i in range(len(tokens) - n + 1):
        ngram = tuple(tokens[i:i + n])
        ngrams.append(ngram)

    return ngrams


def calculate_vocabulary_richness(text: str) -> float:
    """
    Calculate vocabulary richness (unique words / total words)

    Args:
        text: Input text

    Returns:
        Vocabulary richness score (0-1)
    """
    tokens = tokenize(text)

    if not tokens:
        return 0.0

    unique_words = len(set(tokens))
    total_words = len(tokens)

    return unique_words / total_words


def calculate_avg_sentence_length(text: str) -> float:
    """
    Calculate average sentence length in words

    Args:
        text: Input text

    Returns:
        Average sentence length
    """
    sentences = tokenize_sentences(text)

    if not sentences:
        return 0.0

    total_words = 0
    for sentence in sentences:
        total_words += len(tokenize(sentence))

    return total_words / len(sentences)


def calculate_punctuation_density(text: str) -> float:
    """
    Calculate punctuation density (punctuation chars / total chars)

    Args:
        text: Input text

    Returns:
        Punctuation density score (0-1)
    """
    if not text:
        return 0.0

    punct_count = sum(1 for char in text if char in string.punctuation)
    total_chars = len(text)

    return punct_count / total_chars if total_chars > 0 else 0.0


def count_capital_letters(text: str) -> int:
    """
    Count capital letters in text

    Args:
        text: Input text

    Returns:
        Number of capital letters
    """
    return sum(1 for char in text if char.isupper())


def calculate_capitalization_ratio(text: str) -> float:
    """
    Calculate capitalization ratio (capitals / total letters)

    Args:
        text: Input text

    Returns:
        Capitalization ratio (0-1)
    """
    letters = [char for char in text if char.isalpha()]

    if not letters:
        return 0.0

    capitals = sum(1 for char in letters if char.isupper())
    return capitals / len(letters)


def detect_filler_words(text: str) -> Tuple[int, float]:
    """
    Detect filler words (um, uh, like, you know, etc.)

    Args:
        text: Input text

    Returns:
        Tuple of (filler_count, filler_ratio)
    """
    filler_words = {
        'um', 'uh', 'like', 'you know', 'i mean', 'sort of', 'kind of',
        'basically', 'actually', 'literally', 'so', 'well', 'right'
    }

    text_lower = text.lower()
    tokens = tokenize(text_lower)

    filler_count = 0
    for word in filler_words:
        if ' ' in word:
            # Multi-word filler
            filler_count += text_lower.count(word)
        else:
            # Single-word filler
            filler_count += tokens.count(word)

    total_words = len(tokens)
    filler_ratio = filler_count / total_words if total_words > 0 else 0.0

    return filler_count, filler_ratio


def calculate_jaccard_similarity(set1: Set[any], set2: Set[any]) -> float:
    """
    Calculate Jaccard similarity between two sets

    Args:
        set1: First set
        set2: Second set

    Returns:
        Jaccard similarity score (0-1)
    """
    if not set1 and not set2:
        return 1.0

    if not set1 or not set2:
        return 0.0

    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))

    return intersection / union if union > 0 else 0.0


def remove_code_blocks(text: str) -> str:
    """
    Remove code blocks from text (markdown style)

    Args:
        text: Input text

    Returns:
        Text with code blocks removed
    """
    # Remove triple-backtick code blocks
    text = re.sub(r'```[\s\S]*?```', '', text)

    # Remove inline code
    text = re.sub(r'`[^`]+`', '', text)

    return text.strip()


def count_words(text: str) -> int:
    """
    Count words in text

    Args:
        text: Input text

    Returns:
        Word count
    """
    tokens = tokenize(text)
    return len(tokens)


def truncate_text(text: str, max_length: int = 1000) -> str:
    """
    Truncate text to maximum length

    Args:
        text: Input text
        max_length: Maximum length

    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text

    return text[:max_length] + "..."
