"""Tests for pause detection service"""

import pytest
import numpy as np
from services.pause_detection import PauseDetectionService


@pytest.fixture
def pause_service():
    """Create pause detection service instance"""
    return PauseDetectionService()


@pytest.fixture
def synthetic_audio_with_pauses():
    """Create synthetic audio with known pauses"""
    sample_rate = 16000
    duration = 10  # 10 seconds

    # Create audio signal
    audio = np.zeros(sample_rate * duration, dtype=np.float32)

    # Add speech segments (1s each) with silence between
    # Speech: 0-1s, Silence: 1-2s, Speech: 2-3s, Silence: 3-5s, Speech: 5-6s
    for start, end in [(0, 1), (2, 3), (5, 6)]:
        start_sample = start * sample_rate
        end_sample = end * sample_rate
        # Add some noise to simulate speech
        audio[start_sample:end_sample] = np.random.randn(end_sample - start_sample) * 0.5

    return audio, sample_rate


@pytest.mark.asyncio
async def test_detect_pauses_basic(pause_service, synthetic_audio_with_pauses):
    """Test basic pause detection"""
    audio, sample_rate = synthetic_audio_with_pauses

    pauses = await pause_service.detect_pauses(
        audio,
        sample_rate,
        threshold_db=-40,
        min_silence_duration=0.5
    )

    # Should detect 2 pauses (1-2s and 3-5s)
    assert len(pauses) >= 2
    assert all(p['duration'] >= 0.5 for p in pauses)


@pytest.mark.asyncio
async def test_pause_metrics_calculation(pause_service):
    """Test pause metrics calculation"""
    pauses = [
        {'start': 1.0, 'end': 2.0, 'duration': 1.0, 'energy_db': -50},
        {'start': 3.0, 'end': 5.0, 'duration': 2.0, 'energy_db': -55},
        {'start': 7.0, 'end': 8.0, 'duration': 1.0, 'energy_db': -48}
    ]
    total_duration = 10.0

    metrics = pause_service.calculate_pause_metrics(pauses, total_duration)

    assert metrics['pause_count'] == 3
    assert metrics['total_pause_time'] == 4.0
    assert metrics['avg_pause_duration'] == pytest.approx(1.33, rel=0.1)
    assert metrics['pause_percentage'] == pytest.approx(40.0, rel=0.1)


def test_detect_unnatural_pause_patterns(pause_service):
    """Test detection of unnatural pause patterns"""
    # Natural pauses (varied durations and spacing)
    natural_pauses = [
        {'start': 1.0, 'end': 1.5, 'duration': 0.5},
        {'start': 3.2, 'end': 4.1, 'duration': 0.9},
        {'start': 6.8, 'end': 7.5, 'duration': 0.7},
        {'start': 10.3, 'end': 11.2, 'duration': 0.9}
    ]

    result = pause_service.detect_unnatural_pause_patterns(natural_pauses)
    assert result['is_unnatural'] == False
    assert result['consistency_score'] < 0.8

    # Unnatural pauses (very consistent)
    unnatural_pauses = [
        {'start': 2.0, 'end': 2.5, 'duration': 0.5},
        {'start': 4.0, 'end': 4.5, 'duration': 0.5},
        {'start': 6.0, 'end': 6.5, 'duration': 0.5},
        {'start': 8.0, 'end': 8.5, 'duration': 0.5}
    ]

    result = pause_service.detect_unnatural_pause_patterns(unnatural_pauses)
    assert result['is_unnatural'] == True
    assert result['uniform_duration'] == True
    assert result['regular_spacing'] == True


def test_filter_short_pauses(pause_service):
    """Test filtering of short pauses"""
    pauses = [
        {'duration': 0.2},
        {'duration': 0.5},
        {'duration': 0.1},
        {'duration': 1.0},
        {'duration': 0.3},
        {'duration': 0.7}
    ]

    filtered = pause_service.filter_short_pauses(pauses, min_duration=0.3)

    assert len(filtered) == 4  # 0.5, 1.0, 0.3, 0.7
    assert all(p['duration'] >= 0.3 for p in filtered)


def test_empty_pauses(pause_service):
    """Test handling of empty pause list"""
    metrics = pause_service.calculate_pause_metrics([], 10.0)

    assert metrics['pause_count'] == 0
    assert metrics['total_pause_time'] == 0.0
    assert metrics['avg_pause_duration'] == 0.0
    assert metrics['pause_percentage'] == 0.0


@pytest.mark.asyncio
async def test_pause_detection_no_pauses(pause_service):
    """Test pause detection with continuous speech (no pauses)"""
    sample_rate = 16000
    duration = 5

    # Continuous noise (simulating speech)
    audio = np.random.randn(sample_rate * duration) * 0.5

    pauses = await pause_service.detect_pauses(audio, sample_rate)

    # Should detect no significant pauses
    assert len(pauses) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
