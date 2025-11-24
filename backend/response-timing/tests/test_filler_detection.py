"""Tests for filler word detection service"""

import pytest
from services.filler_detection import FillerDetectionService


@pytest.fixture
def filler_service():
    """Create filler detection service instance"""
    return FillerDetectionService()


def test_is_filler_word(filler_service):
    """Test filler word identification"""
    # Common filler words
    assert filler_service.is_filler_word("um") == True
    assert filler_service.is_filler_word("uh") == True
    assert filler_service.is_filler_word("like") == True
    assert filler_service.is_filler_word("you know") == True

    # With punctuation
    assert filler_service.is_filler_word("um,") == True
    assert filler_service.is_filler_word("like.") == True

    # Not filler words
    assert filler_service.is_filler_word("hello") == False
    assert filler_service.is_filler_word("answer") == False
    assert filler_service.is_filler_word("think") == False


def test_detect_filler_words_basic(filler_service):
    """Test basic filler word detection"""
    words = [
        {'word': 'Well', 'start': 0.0, 'end': 0.3},
        {'word': 'um', 'start': 0.4, 'end': 0.6},
        {'word': 'I', 'start': 0.7, 'end': 0.8},
        {'word': 'think', 'start': 0.9, 'end': 1.2},
        {'word': 'like', 'start': 1.3, 'end': 1.5},
        {'word': 'the', 'start': 1.6, 'end': 1.8},
        {'word': 'answer', 'start': 1.9, 'end': 2.3},
        {'word': 'is', 'start': 2.4, 'end': 2.6},
        {'word': 'you know', 'start': 2.7, 'end': 3.0},
        {'word': 'correct', 'start': 3.1, 'end': 3.5}
    ]

    result = filler_service.detect_filler_words(words)

    assert result['total_words'] == 10
    assert result['filler_count'] >= 3  # um, like, you know (well might not be counted)
    assert result['filler_ratio'] > 0.2
    assert len(result['filler_instances']) >= 3


def test_detect_filler_words_no_fillers(filler_service):
    """Test detection with no filler words"""
    words = [
        {'word': 'The', 'start': 0.0, 'end': 0.2},
        {'word': 'answer', 'start': 0.3, 'end': 0.6},
        {'word': 'is', 'start': 0.7, 'end': 0.8},
        {'word': 'correct', 'start': 0.9, 'end': 1.2}
    ]

    result = filler_service.detect_filler_words(words)

    assert result['total_words'] == 4
    assert result['filler_count'] == 0
    assert result['filler_ratio'] == 0.0
    assert len(result['filler_instances']) == 0


def test_analyze_filler_distribution(filler_service):
    """Test filler word distribution analysis"""
    filler_instances = [
        {'word': 'um', 'timestamp': 1.0, 'position': 2},
        {'word': 'uh', 'timestamp': 5.0, 'position': 10},
        {'word': 'like', 'timestamp': 8.0, 'position': 15},
        {'word': 'um', 'timestamp': 12.0, 'position': 22}
    ]
    total_duration = 15.0

    result = filler_service.analyze_filler_distribution(filler_instances, total_duration)

    assert result['fillers_per_minute'] > 0
    assert result['avg_interval'] > 0
    assert 'clustered' in result
    assert 'cluster_score' in result


def test_detect_unnatural_filler_absence(filler_service):
    """Test detection of unnaturally low filler usage"""
    # Very low filler ratio (suspicious)
    result = filler_service.detect_unnatural_filler_absence(
        filler_ratio=0.005,
        speech_duration=60.0
    )

    assert result['is_unnatural'] == True
    assert result['confidence'] > 0.5

    # Normal filler ratio
    result = filler_service.detect_unnatural_filler_absence(
        filler_ratio=0.03,
        speech_duration=60.0
    )

    assert result['is_unnatural'] == False


def test_detect_excessive_fillers(filler_service):
    """Test detection of excessive filler usage"""
    # Normal filler ratio
    result = filler_service.detect_excessive_fillers(filler_ratio=0.05)

    assert result['is_excessive'] == False
    assert result['severity'] == 'normal'

    # Excessive filler ratio
    result = filler_service.detect_excessive_fillers(filler_ratio=0.20)

    assert result['is_excessive'] == True
    assert result['severity'] in ['high', 'very_high']


def test_filler_types_tracking(filler_service):
    """Test tracking of different filler types"""
    words = [
        {'word': 'um', 'start': 0.0, 'end': 0.2},
        {'word': 'uh', 'start': 0.3, 'end': 0.5},
        {'word': 'um', 'start': 0.6, 'end': 0.8},
        {'word': 'like', 'start': 0.9, 'end': 1.1},
        {'word': 'like', 'start': 1.2, 'end': 1.4}
    ]

    result = filler_service.detect_filler_words(words)

    assert 'filler_types' in result
    assert result['filler_types'].get('um', 0) == 2
    assert result['filler_types'].get('like', 0) == 2
    assert result['filler_types'].get('uh', 0) == 1


def test_empty_word_list(filler_service):
    """Test handling of empty word list"""
    result = filler_service.detect_filler_words([])

    assert result['total_words'] == 0
    assert result['filler_count'] == 0
    assert result['filler_ratio'] == 0.0
    assert len(result['filler_instances']) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
