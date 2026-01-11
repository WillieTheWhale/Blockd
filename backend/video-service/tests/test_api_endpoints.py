"""
API endpoint tests for Video service
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


class TestWebRTCEndpoints:
    """Test WebRTC signaling endpoints"""

    @patch('services.webrtc.WebRTCService.create_transport')
    def test_create_send_transport(self, mock_create, client, sample_session_config):
        """Test creating a send transport"""
        mock_create.return_value = {
            "id": "transport-send-123",
            "iceParameters": {"usernameFragment": "abc", "password": "def"},
            "iceCandidates": [{"ip": "192.168.1.1", "port": 5000}],
            "dtlsParameters": {"fingerprints": []}
        }

        response = client.post("/api/v1/webrtc/transport/create", json={
            "session_id": sample_session_config["session_id"],
            "direction": "send"
        })

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "iceParameters" in data
        assert "iceCandidates" in data

    @patch('services.webrtc.WebRTCService.create_transport')
    def test_create_recv_transport(self, mock_create, client, sample_session_config):
        """Test creating a receive transport"""
        mock_create.return_value = {
            "id": "transport-recv-456",
            "iceParameters": {},
            "iceCandidates": [],
            "dtlsParameters": {}
        }

        response = client.post("/api/v1/webrtc/transport/create", json={
            "session_id": sample_session_config["session_id"],
            "direction": "recv"
        })

        assert response.status_code == 200
        data = response.json()
        assert "id" in data

    @patch('services.webrtc.WebRTCService.connect_transport')
    def test_connect_transport(self, mock_connect, client):
        """Test connecting a transport"""
        mock_connect.return_value = {"success": True}

        response = client.post("/api/v1/webrtc/transport/connect", json={
            "transport_id": "transport-123",
            "dtlsParameters": {
                "role": "client",
                "fingerprints": [{"algorithm": "sha-256", "value": "abc123"}]
            }
        })

        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True

    @patch('services.webrtc.WebRTCService.produce')
    def test_produce_media(self, mock_produce, client, sample_rtp_capabilities):
        """Test producing media"""
        mock_produce.return_value = {
            "id": "producer-123"
        }

        response = client.post("/api/v1/webrtc/produce", json={
            "transport_id": "transport-123",
            "kind": "video",
            "rtpParameters": sample_rtp_capabilities["codecs"][1]
        })

        assert response.status_code == 200
        data = response.json()
        assert "id" in data

    @patch('services.webrtc.WebRTCService.consume')
    def test_consume_media(self, mock_consume, client, sample_rtp_capabilities):
        """Test consuming media"""
        mock_consume.return_value = {
            "id": "consumer-123",
            "producerId": "producer-456",
            "kind": "video",
            "rtpParameters": {}
        }

        response = client.post("/api/v1/webrtc/consume", json={
            "transport_id": "transport-123",
            "producer_id": "producer-456",
            "rtpCapabilities": sample_rtp_capabilities
        })

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "consumer-123"
        assert data["producerId"] == "producer-456"

    @patch('services.webrtc.WebRTCService.get_router_capabilities')
    def test_get_router_capabilities(self, mock_caps, client, sample_rtp_capabilities):
        """Test getting router RTP capabilities"""
        mock_caps.return_value = sample_rtp_capabilities

        response = client.get("/api/v1/webrtc/router/test-session-123/capabilities")

        assert response.status_code == 200
        data = response.json()
        assert "codecs" in data


class TestRecordingEndpoints:
    """Test recording endpoints"""

    @patch('services.recording.RecordingManager.start_session_recording')
    def test_start_recording(self, mock_start, client, sample_recording_config):
        """Test starting a recording"""
        mock_start.return_value = {
            "session_id": sample_recording_config["session_id"],
            "status": "recording",
            "started_at": datetime.utcnow().isoformat()
        }

        response = client.post("/api/v1/recordings/start", json=sample_recording_config)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "recording"

    @patch('services.recording.RecordingManager.stop_session_recording')
    def test_stop_recording(self, mock_stop, client):
        """Test stopping a recording"""
        mock_stop.return_value = {
            "session_id": "test-session-123",
            "status": "completed",
            "duration": 300.5,
            "file_size": 15000000,
            "urls": {
                "720p": "https://storage.example.com/test-session-123-720p.mp4"
            }
        }

        response = client.post("/api/v1/recordings/stop", json={
            "session_id": "test-session-123",
            "upload_to_s3": True
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert "urls" in data

    @patch('services.recording.RecordingManager.get_recording_status')
    def test_get_recording_status(self, mock_status, client):
        """Test getting recording status"""
        mock_status.return_value = {
            "session_id": "test-session-123",
            "is_recording": True,
            "status": "recording",
            "duration": 120.5,
            "file_size_bytes": 5000000
        }

        response = client.get("/api/v1/recordings/test-session-123/status")

        assert response.status_code == 200
        data = response.json()
        assert data["is_recording"] == True


class TestStreamStatsEndpoints:
    """Test stream statistics endpoints"""

    @patch('services.stream.StreamService.get_session_stats')
    def test_get_session_stats(self, mock_stats, client, sample_stream_stats):
        """Test getting session streaming stats"""
        mock_stats.return_value = sample_stream_stats

        response = client.get("/api/v1/stream/test-session-123/stats")

        assert response.status_code == 200
        data = response.json()
        assert "video" in data
        assert "audio" in data
        assert data["video"]["bytes_sent"] > 0

    @patch('services.stream.StreamService.get_aggregate_stats')
    def test_get_aggregate_stats(self, mock_stats, client):
        """Test getting aggregate streaming stats"""
        mock_stats.return_value = {
            "active_sessions": 15,
            "total_bandwidth_mbps": 125.5,
            "total_producers": 30,
            "total_consumers": 45,
            "average_latency_ms": 35
        }

        response = client.get("/api/v1/stream/stats")

        assert response.status_code == 200
        data = response.json()
        assert "active_sessions" in data
        assert "total_bandwidth_mbps" in data


class TestSessionManagementEndpoints:
    """Test session management endpoints"""

    @patch('services.session.SessionService.create_session')
    def test_create_video_session(self, mock_create, client, sample_session_config):
        """Test creating a video session"""
        mock_create.return_value = {
            "session_id": sample_session_config["session_id"],
            "router_id": "router-123",
            "created_at": datetime.utcnow().isoformat(),
            "config": sample_session_config
        }

        response = client.post("/api/v1/sessions", json=sample_session_config)

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == sample_session_config["session_id"]

    @patch('services.session.SessionService.close_session')
    def test_close_session(self, mock_close, client):
        """Test closing a video session"""
        mock_close.return_value = {
            "session_id": "test-session-123",
            "status": "closed",
            "closed_at": datetime.utcnow().isoformat(),
            "duration_seconds": 1800
        }

        response = client.delete("/api/v1/sessions/test-session-123")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "closed"

    @patch('services.session.SessionService.get_session_info')
    def test_get_session_info(self, mock_info, client):
        """Test getting session info"""
        mock_info.return_value = {
            "session_id": "test-session-123",
            "status": "active",
            "participants": [
                {"user_id": "user-1", "role": "interviewer", "connected": True},
                {"user_id": "user-2", "role": "interviewee", "connected": True}
            ],
            "created_at": datetime.utcnow().isoformat()
        }

        response = client.get("/api/v1/sessions/test-session-123")

        assert response.status_code == 200
        data = response.json()
        assert len(data["participants"]) == 2


class TestTranscodingEndpoints:
    """Test transcoding endpoints"""

    @patch('services.encoding.EncodingService.start_transcode')
    def test_start_transcode_job(self, mock_transcode, client):
        """Test starting a transcode job"""
        mock_transcode.return_value = {
            "job_id": "transcode-123",
            "status": "processing",
            "progress": 0
        }

        response = client.post("/api/v1/transcode/start", json={
            "session_id": "test-session-123",
            "input_file": "/recordings/raw/test.webm",
            "output_formats": ["720p", "480p", "360p"]
        })

        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data

    @patch('services.encoding.EncodingService.get_job_status')
    def test_get_transcode_job_status(self, mock_status, client, sample_transcoding_job):
        """Test getting transcode job status"""
        mock_status.return_value = sample_transcoding_job

        response = client.get("/api/v1/transcode/transcode-job-123/status")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["progress"] == 100


class TestErrorHandling:
    """Test error handling"""

    def test_session_not_found(self, client):
        """Test error when session not found"""
        response = client.get("/api/v1/sessions/nonexistent-session")

        assert response.status_code == 404

    @patch('services.webrtc.WebRTCService.create_transport')
    def test_transport_creation_failure(self, mock_create, client):
        """Test handling transport creation failure"""
        mock_create.side_effect = Exception("Failed to create transport")

        response = client.post("/api/v1/webrtc/transport/create", json={
            "session_id": "test-session-123",
            "direction": "send"
        })

        assert response.status_code == 500

    def test_invalid_direction(self, client):
        """Test error for invalid transport direction"""
        response = client.post("/api/v1/webrtc/transport/create", json={
            "session_id": "test-session-123",
            "direction": "invalid"
        })

        assert response.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
