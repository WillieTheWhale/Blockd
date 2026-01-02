"""
Tests for text utilities
"""
import pytest
from lib.text_utils import (
    normalize_text,
    tokenize,
    extract_ngrams,
    calculate_vocabulary_richness,
    calculate_avg_sentence_length,
    calculate_punctuation_density,
    calculate_jaccard_similarity
)


class TestTextNormalization:
    """Test text normalization"""

    def test_normalize_text_lowercase(self):
        """Test lowercase normalization"""
        text = "Hello World"
        normalized = normalize_text(text, lowercase=True)
        assert normalized == "hello world"

    def test_normalize_text_remove_punctuation(self):
        """Test punctuation removal"""
        text = "Hello, World!"
        normalized = normalize_text(text, remove_punctuation=True)
        assert "," not in normalized
        assert "!" not in normalized

    def test_normalize_text_whitespace(self):
        """Test whitespace normalization"""
        text = "Hello   World  \n  Test"
        normalized = normalize_text(text)
        assert "   " not in normalized
        assert "\n" not in normalized


class TestTokenization:
    """Test tokenization"""

    def test_tokenize_simple(self):
        """Test simple tokenization"""
        text = "Hello world test"
        tokens = tokenize(text)
        assert tokens == ["hello", "world", "test"]

    def test_tokenize_with_punctuation(self):
        """Test tokenization with punctuation"""
        text = "Hello, world! How are you?"
        tokens = tokenize(text)
        assert "hello" in tokens
        assert "world" in tokens


class TestNgrams:
    """Test n-gram extraction"""

    def test_extract_trigrams(self):
        """Test trigram extraction"""
        tokens = ["the", "quick", "brown", "fox"]
        trigrams = extract_ngrams(tokens, 3)
        assert len(trigrams) == 2
        assert ("the", "quick", "brown") in trigrams
        assert ("quick", "brown", "fox") in trigrams

    def test_extract_ngrams_short_text(self):
        """Test n-grams with short text"""
        tokens = ["hello", "world"]
        trigrams = extract_ngrams(tokens, 3)
        assert len(trigrams) == 0


class TestVocabularyRichness:
    """Test vocabulary richness"""

    def test_vocabulary_richness_all_unique(self):
        """Test with all unique words"""
        text = "the quick brown fox jumps"
        richness = calculate_vocabulary_richness(text)
        assert richness == 1.0

    def test_vocabulary_richness_repeated(self):
        """Test with repeated words"""
        text = "the the the quick quick brown"
        richness = calculate_vocabulary_richness(text)
        assert richness < 1.0
        assert richness > 0.0


class TestSentenceLength:
    """Test sentence length calculation"""

    def test_avg_sentence_length(self):
        """Test average sentence length"""
        text = "This is a test. Another sentence here."
        avg_len = calculate_avg_sentence_length(text)
        assert avg_len > 0

    def test_avg_sentence_length_empty(self):
        """Test with empty text"""
        avg_len = calculate_avg_sentence_length("")
        assert avg_len == 0.0


class TestPunctuationDensity:
    """Test punctuation density"""

    def test_punctuation_density_no_punctuation(self):
        """Test with no punctuation"""
        text = "hello world"
        density = calculate_punctuation_density(text)
        assert density == 0.0

    def test_punctuation_density_with_punctuation(self):
        """Test with punctuation"""
        text = "Hello, world! How are you?"
        density = calculate_punctuation_density(text)
        assert density > 0.0


class TestJaccardSimilarity:
    """Test Jaccard similarity"""

    def test_jaccard_similarity_identical(self):
        """Test with identical sets"""
        set1 = {1, 2, 3, 4}
        set2 = {1, 2, 3, 4}
        similarity = calculate_jaccard_similarity(set1, set2)
        assert similarity == 1.0

    def test_jaccard_similarity_no_overlap(self):
        """Test with no overlap"""
        set1 = {1, 2, 3}
        set2 = {4, 5, 6}
        similarity = calculate_jaccard_similarity(set1, set2)
        assert similarity == 0.0

    def test_jaccard_similarity_partial_overlap(self):
        """Test with partial overlap"""
        set1 = {1, 2, 3, 4}
        set2 = {3, 4, 5, 6}
        similarity = calculate_jaccard_similarity(set1, set2)
        assert similarity == pytest.approx(0.333, abs=0.01)
