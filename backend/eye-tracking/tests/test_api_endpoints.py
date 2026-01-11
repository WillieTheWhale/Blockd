"""
API endpoint tests for Eye Tracking service
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock
import numpy as np

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


class TestStreamEndpoints:
    """Test real-time streaming endpoints"""

    @patch('services.gaze_processing.GazeProcessingService.process_frame')
    def test_process_frame_success(self, mock_process, client, sample_eye_data):
        """Test processing a single frame"""
        mock_process.return_value = {
            "gaze_x": 0.52,
            "gaze_y": 0.48,
            "confidence": 0.95,
            "is_off_screen": False,
            "off_screen_direction": None
        }

        response = client.post("/api/v1/stream/frame", json={
            "session_id": "test-session-123",
            "frame_number": 100,
            "timestamp": "2025-01-10T10:00:00Z",
            "landmarks": {
                "left_eye": [[0.35, 0.45, 0.02]],
                "right_eye": [[0.65, 0.45, 0.02]],
                "left_iris": [[0.37, 0.45, 0.01]],
                "right_iris": [[0.63, 0.45, 0.01]]
            }
        })

        assert response.status_code == 200
        data = response.json()
        assert "gaze_x" in data
        assert "gaze_y" in data
        assert 0 <= data["gaze_x"] <= 1
        assert 0 <= data["gaze_y"] <= 1

    @patch('services.gaze_processing.GazeProcessingService.process_batch')
    def test_process_batch_frames(self, mock_batch, client):
        """Test processing a batch of frames"""
        mock_batch.return_value = [
            {"frame": 1, "gaze_x": 0.5, "gaze_y": 0.5, "confidence": 0.9},
            {"frame": 2, "gaze_x": 0.51, "gaze_y": 0.49, "confidence": 0.92},
            {"frame": 3, "gaze_x": 0.52, "gaze_y": 0.48, "confidence": 0.88},
        ]

        response = client.post("/api/v1/stream/batch", json={
            "session_id": "test-session-123",
            "frames": [
                {"frame_number": 1, "timestamp": "2025-01-10T10:00:00.000Z", "landmarks": {}},
                {"frame_number": 2, "timestamp": "2025-01-10T10:00:00.033Z", "landmarks": {}},
                {"frame_number": 3, "timestamp": "2025-01-10T10:00:00.066Z", "landmarks": {}},
            ]
        })

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 3


class TestCalibrationEndpoints:
    """Test calibration endpoints"""

    @patch('services.gaze_calculation.GazeCalculationService.calibrate')
    def test_submit_calibration_data(self, mock_calibrate, client, sample_calibration_data):
        """Test submitting calibration data"""
        mock_calibrate.return_value = {
            "success": True,
            "error_x": 0.02,
            "error_y": 0.03,
            "calibration_quality": "good"
        }

        response = client.post("/api/v1/calibration", json={
            "session_id": "test-session-123",
            "ground_truth": sample_calibration_data["ground_truth"],
            "observed": sample_calibration_data["observed"]
        })

        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "calibration_quality" in data

    @patch('services.gaze_calculation.GazeCalculationService.get_calibration_status')
    def test_get_calibration_status(self, mock_status, client):
        """Test getting calibration status"""
        mock_status.return_value = {
            "is_calibrated": True,
            "calibrated_at": "2025-01-10T10:00:00Z",
            "error_x": 0.02,
            "error_y": 0.03
        }

        response = client.get("/api/v1/calibration/test-session-123")

        assert response.status_code == 200
        data = response.json()
        assert data["is_calibrated"] == True


class TestAnalysisEndpoints:
    """Test gaze analysis endpoints"""

    @patch('services.pattern_recognition.PatternRecognitionService.detect_patterns')
    def test_detect_gaze_patterns(self, mock_patterns, client):
        """Test detecting gaze patterns"""
        mock_patterns.return_value = {
            "patterns_detected": [
                {"type": "reading", "confidence": 0.85, "duration_ms": 5000},
                {"type": "fixation", "confidence": 0.92, "duration_ms": 1200}
            ],
            "off_screen_events": [
                {"direction": "left", "start": 3000, "duration_ms": 800}
            ],
            "total_off_screen_duration_ms": 800,
            "off_screen_percentage": 2.5
        }

        response = client.post("/api/v1/analyze/patterns", json={
            "session_id": "test-session-123",
            "start_time": "2025-01-10T10:00:00Z",
            "end_time": "2025-01-10T10:05:00Z"
        })

        assert response.status_code == 200
        data = response.json()
        assert "patterns_detected" in data
        assert "off_screen_events" in data

    @patch('services.anomaly_detection.AnomalyDetectionService.detect_anomalies')
    def test_detect_anomalies(self, mock_anomalies, client):
        """Test anomaly detection in gaze data"""
        mock_anomalies.return_value = {
            "anomalies": [
                {
                    "type": "prolonged_off_screen",
                    "severity": "medium",
                    "start_time": "2025-01-10T10:02:30Z",
                    "duration_ms": 5000,
                    "description": "Gaze was off-screen for extended period"
                }
            ],
            "anomaly_score": 0.35,
            "is_suspicious": False
        }

        response = client.post("/api/v1/analyze/anomalies", json={
            "session_id": "test-session-123"
        })

        assert response.status_code == 200
        data = response.json()
        assert "anomalies" in data
        assert "anomaly_score" in data


class TestSummaryEndpoints:
    """Test session summary endpoints"""

    @patch('services.summary_generation.SummaryGenerationService.generate_summary')
    def test_generate_session_summary(self, mock_summary, client):
        """Test generating session gaze summary"""
        mock_summary.return_value = {
            "session_id": "test-session-123",
            "total_frames_processed": 9000,
            "duration_seconds": 300,
            "average_gaze_x": 0.51,
            "average_gaze_y": 0.49,
            "off_screen_percentage": 3.2,
            "dominant_gaze_regions": [
                {"region": "center", "percentage": 65.5},
                {"region": "left", "percentage": 20.3},
                {"region": "right", "percentage": 14.2}
            ],
            "attention_score": 0.85,
            "risk_indicators": []
        }

        response = client.get("/api/v1/summary/test-session-123")

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "test-session-123"
        assert "attention_score" in data
        assert "off_screen_percentage" in data

    @patch('services.summary_generation.SummaryGenerationService.generate_heatmap')
    def test_generate_heatmap(self, mock_heatmap, client):
        """Test generating gaze heatmap"""
        # Return base64 encoded image
        mock_heatmap.return_value = {
            "heatmap_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "format": "png",
            "width": 1920,
            "height": 1080
        }

        response = client.get("/api/v1/summary/test-session-123/heatmap")

        assert response.status_code == 200
        data = response.json()
        assert "heatmap_base64" in data


class TestErrorHandling:
    """Test error handling"""

    def test_invalid_session_id(self, client):
        """Test with invalid session ID format"""
        response = client.get("/api/v1/summary/invalid session id!")

        # Should return 400 or 422 for invalid format
        assert response.status_code in [400, 422]

    @patch('services.gaze_processing.GazeProcessingService.process_frame')
    def test_processing_error(self, mock_process, client):
        """Test handling processing errors"""
        mock_process.side_effect = Exception("Processing failed")

        response = client.post("/api/v1/stream/frame", json={
            "session_id": "test-session-123",
            "frame_number": 1,
            "timestamp": "2025-01-10T10:00:00Z",
            "landmarks": {}
        })

        assert response.status_code == 500
        data = response.json()
        assert "error" in data or "detail" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
