"""
API endpoint tests for Response Timing service
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime

# Import the FastAPI app
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.main import app


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestHealthEndpoint:
    """Test health check endpoint"""

    def test_health_check(self, client):
        """Test health endpoint returns OK"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_readiness_check(self, client):
        """Test readiness endpoint"""
        response = client.get("/ready")
        assert response.status_code == 200


class TestAnalyzeEndpoints:
    """Test audio analysis endpoints"""

    @patch('services.transcription.TranscriptionService.transcribe')
    @patch('services.timing_analysis.TimingAnalysisService.analyze')
    def test_analyze_audio_success(self, mock_timing, mock_transcribe, client, sample_analysis_request):
        """Test successful audio analysis"""
        mock_transcribe.return_value = {
            "text": "This is the transcribed answer text",
            "words": [
                {"word": "This", "start": 0.0, "end": 0.2},
                {"word": "is", "start": 0.2, "end": 0.3},
                {"word": "the", "start": 0.3, "end": 0.4},
                {"word": "transcribed", "start": 0.4, "end": 0.8},
                {"word": "answer", "start": 0.8, "end": 1.0},
                {"word": "text", "start": 1.0, "end": 1.2},
            ],
            "language": "en"
        }

        mock_timing.return_value = {
            "response_latency_ms": 3500,
            "speech_rate_wpm": 145,
            "filler_word_count": 2,
            "filler_word_ratio": 0.04,
            "pause_count": 3,
            "total_pause_duration_ms": 1500,
            "risk_score": 0.15,
            "anomaly_flags": []
        }

        response = client.post("/api/v1/analyze", json=sample_analysis_request)

        assert response.status_code == 200
        data = response.json()
        assert "transcription" in data
        assert "timing_analysis" in data
        assert data["timing_analysis"]["speech_rate_wpm"] > 0

    @patch('services.transcription.TranscriptionService.transcribe')
    def test_analyze_audio_transcription_only(self, mock_transcribe, client):
        """Test getting just transcription"""
        mock_transcribe.return_value = {
            "text": "Transcribed text here",
            "words": [{"word": "Transcribed", "start": 0.0, "end": 0.5}],
            "segments": [],
            "language": "en"
        }

        response = client.post("/api/v1/analyze/transcribe", json={
            "audio_url": "https://storage.example.com/audio/test.wav"
        })

        assert response.status_code == 200
        data = response.json()
        assert "text" in data
        assert "words" in data

    def test_analyze_missing_audio_url(self, client):
        """Test error when audio URL is missing"""
        response = client.post("/api/v1/analyze", json={
            "session_id": "test-session-123",
            "question_id": "question-456"
        })

        assert response.status_code == 422


class TestTimingAnalysisEndpoints:
    """Test timing-specific analysis endpoints"""

    @patch('services.timing_analysis.TimingAnalysisService.calculate_speech_rate')
    def test_calculate_speech_rate(self, mock_rate, client, sample_words):
        """Test speech rate calculation endpoint"""
        mock_rate.return_value = 145.5

        response = client.post("/api/v1/timing/speech-rate", json={
            "words": sample_words,
            "duration_seconds": 30.0,
            "exclude_fillers": True
        })

        assert response.status_code == 200
        data = response.json()
        assert "speech_rate_wpm" in data
        assert data["speech_rate_wpm"] > 0

    @patch('services.pause_detection.PauseDetectionService.detect_pauses')
    def test_detect_pauses(self, mock_pauses, client, sample_words):
        """Test pause detection endpoint"""
        mock_pauses.return_value = {
            "pauses": [
                {"start": 0.7, "end": 0.9, "duration": 0.2, "type": "short"},
                {"start": 2.6, "end": 3.2, "duration": 0.6, "type": "medium"},
            ],
            "total_pause_duration": 0.8,
            "pause_count": 2,
            "average_pause_duration": 0.4
        }

        response = client.post("/api/v1/timing/pauses", json={
            "words": sample_words,
            "min_pause_duration_ms": 200
        })

        assert response.status_code == 200
        data = response.json()
        assert "pauses" in data
        assert "pause_count" in data

    @patch('services.filler_detection.FillerDetectionService.detect_fillers')
    def test_detect_filler_words(self, mock_fillers, client, sample_words):
        """Test filler word detection endpoint"""
        mock_fillers.return_value = {
            "filler_words": [
                {"word": "um", "start": 0.9, "end": 1.1, "type": "hesitation"},
                {"word": "like", "start": 1.4, "end": 1.6, "type": "discourse_marker"},
                {"word": "you know", "start": 2.8, "end": 3.1, "type": "phrase"}
            ],
            "filler_count": 3,
            "filler_ratio": 0.05,
            "filler_types": {"hesitation": 1, "discourse_marker": 1, "phrase": 1}
        }

        response = client.post("/api/v1/timing/fillers", json={
            "words": sample_words
        })

        assert response.status_code == 200
        data = response.json()
        assert "filler_words" in data
        assert "filler_ratio" in data


class TestAnomalyDetectionEndpoints:
    """Test anomaly detection endpoints"""

    @patch('services.anomaly_detection.AnomalyDetectionService.detect_timing_anomalies')
    def test_detect_timing_anomalies(self, mock_anomalies, client):
        """Test timing anomaly detection"""
        mock_anomalies.return_value = {
            "anomalies": [
                {
                    "type": "instant_response",
                    "severity": "high",
                    "description": "Response started before question ended",
                    "confidence": 0.95
                }
            ],
            "anomaly_score": 0.85,
            "is_suspicious": True,
            "flags": ["instant_response"]
        }

        response = client.post("/api/v1/timing/anomalies", json={
            "session_id": "test-session-123",
            "question_id": "question-456",
            "question_asked_at": "2025-01-10T10:00:00Z",
            "answer_started_at": "2025-01-10T10:00:00.500Z",
            "speech_rate_wpm": 250,
            "filler_ratio": 0.01,
            "pause_ratio": 0.02
        })

        assert response.status_code == 200
        data = response.json()
        assert data["is_suspicious"] == True
        assert "instant_response" in data["flags"]

    @patch('services.anomaly_detection.AnomalyDetectionService.compare_to_baseline')
    def test_compare_to_baseline(self, mock_compare, client, sample_baseline_stats):
        """Test comparison to baseline statistics"""
        mock_compare.return_value = {
            "deviations": {
                "latency_deviation_sigma": 2.5,
                "wpm_deviation_sigma": 1.2,
                "filler_deviation_sigma": -0.8
            },
            "overall_deviation": 1.8,
            "is_anomalous": False,
            "notes": ["Response latency slightly above normal"]
        }

        response = client.post("/api/v1/timing/compare", json={
            "current": {
                "latency_ms": 8000,
                "wpm": 170,
                "filler_ratio": 0.04
            },
            "baseline": sample_baseline_stats
        })

        assert response.status_code == 200
        data = response.json()
        assert "deviations" in data
        assert "overall_deviation" in data


class TestSessionEndpoints:
    """Test session-level endpoints"""

    @patch('services.timing_analysis.TimingAnalysisService.get_session_summary')
    def test_get_session_timing_summary(self, mock_summary, client):
        """Test getting timing summary for a session"""
        mock_summary.return_value = {
            "session_id": "test-session-123",
            "questions_analyzed": 5,
            "average_latency_ms": 4200,
            "average_wpm": 142,
            "total_filler_count": 15,
            "average_filler_ratio": 0.05,
            "timing_consistency_score": 0.78,
            "anomaly_count": 1,
            "overall_timing_score": 0.82
        }

        response = client.get("/api/v1/sessions/test-session-123/timing-summary")

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "test-session-123"
        assert "average_wpm" in data
        assert "overall_timing_score" in data

    @patch('services.timing_analysis.TimingAnalysisService.get_question_timing')
    def test_get_question_timing_detail(self, mock_timing, client):
        """Test getting timing details for a specific question"""
        mock_timing.return_value = {
            "question_id": "question-456",
            "response_latency_ms": 3500,
            "speech_duration_ms": 25000,
            "speech_rate_wpm": 148,
            "pause_count": 4,
            "total_pause_duration_ms": 2100,
            "filler_words": ["um", "like", "you know"],
            "filler_ratio": 0.04,
            "timing_score": 0.85
        }

        response = client.get("/api/v1/sessions/test-session-123/questions/question-456/timing")

        assert response.status_code == 200
        data = response.json()
        assert data["question_id"] == "question-456"
        assert "speech_rate_wpm" in data


class TestErrorHandling:
    """Test error handling"""

    def test_invalid_audio_format(self, client):
        """Test error for invalid audio format"""
        response = client.post("/api/v1/analyze", json={
            "session_id": "test-session-123",
            "question_id": "question-456",
            "audio_url": "https://example.com/audio.txt"  # Wrong format
        })

        # Should still attempt to process or return validation error
        assert response.status_code in [200, 400, 422]

    @patch('services.transcription.TranscriptionService.transcribe')
    def test_transcription_timeout(self, mock_transcribe, client):
        """Test handling of transcription timeout"""
        mock_transcribe.side_effect = TimeoutError("Transcription timed out")

        response = client.post("/api/v1/analyze/transcribe", json={
            "audio_url": "https://storage.example.com/audio/long.wav"
        })

        assert response.status_code in [408, 500, 503]

    def test_session_not_found(self, client):
        """Test error when session not found"""
        response = client.get("/api/v1/sessions/nonexistent-session/timing-summary")

        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
