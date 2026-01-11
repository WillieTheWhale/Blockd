"""
Pytest configuration and fixtures for response-timing service
"""
import pytest
import os
import numpy as np
from datetime import datetime


@pytest.fixture(scope="session", autouse=True)
def test_config():
    """Set test environment variables"""
    os.environ["ENV"] = "test"
    os.environ["DEBUG"] = "true"
    os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_blockd"
    os.environ["REDIS_HOST"] = "localhost"
    os.environ["REDIS_PORT"] = "6379"
    os.environ["LOG_LEVEL"] = "DEBUG"
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["WHISPER_MODEL"] = "base"


@pytest.fixture
def sample_transcription():
    """Sample Whisper transcription output"""
    return {
        "text": "I think the answer to that question is, um, that you need to "
                "consider both the time complexity and space complexity when "
                "analyzing algorithms. Like, for example, if you're sorting a "
                "list, you know, quicksort has O(n log n) average time but O(n) space.",
        "segments": [
            {
                "id": 0,
                "start": 0.0,
                "end": 1.5,
                "text": "I think the answer to that question is,",
            },
            {
                "id": 1,
                "start": 1.5,
                "end": 2.0,
                "text": "um,",
            },
            {
                "id": 2,
                "start": 2.2,
                "end": 5.0,
                "text": "that you need to consider both the time complexity and space complexity",
            },
            {
                "id": 3,
                "start": 5.0,
                "end": 6.5,
                "text": "when analyzing algorithms.",
            },
            {
                "id": 4,
                "start": 7.0,
                "end": 7.5,
                "text": "Like,",
            },
            {
                "id": 5,
                "start": 7.5,
                "end": 9.0,
                "text": "for example, if you're sorting a list,",
            },
            {
                "id": 6,
                "start": 9.2,
                "end": 9.8,
                "text": "you know,",
            },
            {
                "id": 7,
                "start": 10.0,
                "end": 13.0,
                "text": "quicksort has O(n log n) average time but O(n) space.",
            },
        ],
        "words": [
            {"word": "I", "start": 0.0, "end": 0.1},
            {"word": "think", "start": 0.1, "end": 0.3},
            {"word": "the", "start": 0.3, "end": 0.4},
            {"word": "answer", "start": 0.4, "end": 0.6},
            {"word": "to", "start": 0.6, "end": 0.7},
            {"word": "that", "start": 0.7, "end": 0.9},
            {"word": "question", "start": 0.9, "end": 1.2},
            {"word": "is,", "start": 1.2, "end": 1.5},
            {"word": "um,", "start": 1.5, "end": 2.0},
            {"word": "that", "start": 2.2, "end": 2.4},
            # ... more words
        ],
        "language": "en",
    }


@pytest.fixture
def sample_words():
    """Sample word timing data"""
    return [
        {"word": "I", "start": 0.0, "end": 0.1},
        {"word": "think", "start": 0.1, "end": 0.3},
        {"word": "the", "start": 0.3, "end": 0.4},
        {"word": "answer", "start": 0.4, "end": 0.7},
        {"word": "um", "start": 0.9, "end": 1.1},
        {"word": "is", "start": 1.2, "end": 1.3},
        {"word": "like", "start": 1.4, "end": 1.6},
        {"word": "sorting", "start": 1.7, "end": 2.0},
        {"word": "algorithms", "start": 2.1, "end": 2.6},
        {"word": "you", "start": 2.8, "end": 2.9},
        {"word": "know", "start": 2.9, "end": 3.1},
    ]


@pytest.fixture
def sample_pauses():
    """Sample detected pauses"""
    return [
        {"start": 0.7, "end": 0.9, "duration": 0.2},
        {"start": 1.1, "end": 1.2, "duration": 0.1},
        {"start": 2.6, "end": 2.8, "duration": 0.2},
    ]


@pytest.fixture
def sample_audio_bytes():
    """Sample audio data (WAV format header + silence)"""
    # Generate a minimal WAV file with silence
    sample_rate = 16000
    duration = 1.0  # seconds
    num_samples = int(sample_rate * duration)

    # WAV header
    import struct
    wav_data = bytearray()

    # RIFF header
    wav_data.extend(b'RIFF')
    file_size = 36 + num_samples * 2
    wav_data.extend(struct.pack('<I', file_size))
    wav_data.extend(b'WAVE')

    # fmt chunk
    wav_data.extend(b'fmt ')
    wav_data.extend(struct.pack('<I', 16))  # Chunk size
    wav_data.extend(struct.pack('<H', 1))   # Audio format (PCM)
    wav_data.extend(struct.pack('<H', 1))   # Num channels
    wav_data.extend(struct.pack('<I', sample_rate))  # Sample rate
    wav_data.extend(struct.pack('<I', sample_rate * 2))  # Byte rate
    wav_data.extend(struct.pack('<H', 2))   # Block align
    wav_data.extend(struct.pack('<H', 16))  # Bits per sample

    # data chunk
    wav_data.extend(b'data')
    wav_data.extend(struct.pack('<I', num_samples * 2))

    # Silence
    wav_data.extend(b'\x00' * (num_samples * 2))

    return bytes(wav_data)


@pytest.fixture
def sample_analysis_request():
    """Sample analysis request payload"""
    return {
        "session_id": "test-session-123",
        "question_id": "question-456",
        "audio_url": "https://storage.example.com/audio/test.wav",
        "question_text": "Explain the difference between TCP and UDP",
        "question_difficulty": "medium",
        "question_asked_at": datetime.utcnow().isoformat(),
    }


@pytest.fixture
def sample_timing_analysis_result():
    """Sample complete timing analysis result"""
    return {
        "session_id": "test-session-123",
        "question_id": "question-456",
        "response_latency_ms": 3500,
        "speech_rate_wpm": 145,
        "speech_rate_classification": "normal",
        "filler_word_count": 3,
        "filler_word_ratio": 0.05,
        "filler_words_detected": ["um", "like", "you know"],
        "pause_count": 5,
        "total_pause_duration_ms": 2100,
        "average_pause_duration_ms": 420,
        "longest_pause_ms": 850,
        "speech_duration_ms": 12500,
        "total_duration_ms": 14600,
        "consistency_score": 0.82,
        "anomaly_flags": [],
        "risk_score": 0.15,
    }


@pytest.fixture
def sample_baseline_stats():
    """Sample baseline statistics for comparison"""
    return {
        "mean_latency_ms": 4000,
        "std_latency_ms": 1500,
        "mean_wpm": 140,
        "std_wpm": 20,
        "mean_filler_ratio": 0.06,
        "mean_pause_ratio": 0.15,
    }
