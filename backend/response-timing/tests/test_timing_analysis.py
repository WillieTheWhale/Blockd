"""Tests for timing analysis service"""

import pytest
from datetime import datetime, timedelta
from services.timing_analysis import TimingAnalysisService


@pytest.fixture
def timing_service():
    """Create timing analysis service instance"""
    return TimingAnalysisService()


def test_calculate_response_latency(timing_service):
    """Test response latency calculation"""
    question_asked_at = datetime(2025, 11, 24, 10, 0, 0)
    answer_start = datetime(2025, 11, 24, 10, 0, 5)  # 5 seconds later

    latency = timing_service.calculate_response_latency(
        question_asked_at,
        answer_start
    )

    assert latency == 5000  # 5000 milliseconds


def test_calculate_response_latency_subsecond(timing_service):
    """Test response latency with subsecond precision"""
    question_asked_at = datetime(2025, 11, 24, 10, 0, 0, 0)
    answer_start = datetime(2025, 11, 24, 10, 0, 0, 500000)  # 500ms later

    latency = timing_service.calculate_response_latency(
        question_asked_at,
        answer_start
    )

    assert latency == 500


def test_calculate_speech_rate(timing_service):
    """Test speech rate (WPM) calculation"""
    # 100 words in 60 seconds = 100 WPM
    words = [{'word': f'word{i}', 'start': i*0.6, 'end': (i+1)*0.6} for i in range(100)]
    speech_duration = 60.0

    wpm = timing_service.calculate_speech_rate(words, speech_duration, exclude_fillers=False)

    assert wpm == pytest.approx(100.0, rel=0.1)


def test_calculate_speech_rate_with_fillers(timing_service):
    """Test speech rate calculation excluding filler words"""
    words = [
        {'word': 'I', 'start': 0.0, 'end': 0.2},
        {'word': 'um', 'start': 0.3, 'end': 0.5},
        {'word': 'think', 'start': 0.6, 'end': 0.8},
        {'word': 'like', 'start': 0.9, 'end': 1.1},
        {'word': 'that', 'start': 1.2, 'end': 1.4}
    ]
    speech_duration = 12.0  # 5 words in 12 seconds

    # Without excluding fillers: 5 words / 0.2 minutes = 25 WPM
    # With excluding fillers: 3 words / 0.2 minutes = 15 WPM
    wpm_with_fillers = timing_service.calculate_speech_rate(
        words, speech_duration, exclude_fillers=False
    )
    wpm_without_fillers = timing_service.calculate_speech_rate(
        words, speech_duration, exclude_fillers=True
    )

    assert wpm_with_fillers == 25.0
    assert wpm_without_fillers == 15.0


def test_calculate_speech_duration(timing_service):
    """Test speech vs pause duration calculation"""
    words = [{'word': 'test'}]  # Not used in this calculation
    pauses = [
        {'duration': 1.0},
        {'duration': 2.0},
        {'duration': 1.5}
    ]
    total_duration = 10.0

    result = timing_service.calculate_speech_duration(words, pauses, total_duration)

    assert result['pause_duration'] == 4.5
    assert result['speech_duration'] == 5.5
    assert result['pause_percentage'] == 45.0
    assert result['speech_percentage'] == 55.0


def test_evaluate_latency_against_baseline(timing_service):
    """Test latency evaluation against baseline"""
    # Normal latency for analytical question (expected: 8000ms)
    result = timing_service.evaluate_latency_against_baseline(
        actual_latency_ms=7500,
        difficulty='analytical'
    )

    assert result['expected_latency_ms'] == 8000
    assert result['actual_latency_ms'] == 7500
    assert result['latency_ratio'] == pytest.approx(0.94, rel=0.01)
    assert result['is_instant'] == False
    assert result['is_delayed'] == False

    # Instant response (too fast)
    result = timing_service.evaluate_latency_against_baseline(
        actual_latency_ms=1000,
        difficulty='complex'
    )

    assert result['is_instant'] == True
    assert result['latency_ratio'] < 0.5

    # Delayed response (too slow)
    result = timing_service.evaluate_latency_against_baseline(
        actual_latency_ms=35000,
        difficulty='complex'
    )

    assert result['is_delayed'] == True
    assert result['latency_ratio'] > 2.0


def test_classify_speech_rate(timing_service):
    """Test speech rate classification"""
    assert timing_service.classify_speech_rate(70) == 'very_slow'
    assert timing_service.classify_speech_rate(100) == 'slow'
    assert timing_service.classify_speech_rate(140) == 'normal'
    assert timing_service.classify_speech_rate(180) == 'fast'
    assert timing_service.classify_speech_rate(250) == 'very_fast'


def test_analyze_timing_patterns(timing_service):
    """Test timing pattern analysis"""
    words = [
        {'word': 'test', 'start': 0.0, 'end': 0.3},
        {'word': 'word', 'start': 0.4, 'end': 0.7},
        {'word': 'here', 'start': 0.8, 'end': 1.1}
    ]
    pauses = [
        {'duration': 0.5},
        {'duration': 0.6},
        {'duration': 0.55}
    ]

    result = timing_service.analyze_timing_patterns(words, pauses)

    assert 'word_duration_mean' in result
    assert 'word_duration_std' in result
    assert 'pause_duration_mean' in result
    assert 'pause_duration_std' in result
    assert 'consistency_score' in result
    assert 0 <= result['consistency_score'] <= 1


def test_zero_speech_duration(timing_service):
    """Test handling of zero speech duration"""
    words = []
    wpm = timing_service.calculate_speech_rate(words, 0.0)

    assert wpm == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
