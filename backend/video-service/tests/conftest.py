"""
Pytest configuration and fixtures for Video service
"""
import pytest
import os
from datetime import datetime
from unittest.mock import Mock, AsyncMock


@pytest.fixture(scope="session", autouse=True)
def test_config():
    """Set test environment variables"""
    os.environ["ENV"] = "test"
    os.environ["DEBUG"] = "true"
    os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_blockd"
    os.environ["REDIS_HOST"] = "localhost"
    os.environ["REDIS_PORT"] = "6379"
    os.environ["MEDIASOUP_HOST"] = "localhost"
    os.environ["MEDIASOUP_PORT"] = "3000"
    os.environ["S3_BUCKET"] = "test-bucket"
    os.environ["S3_ENDPOINT"] = "http://localhost:9000"
    os.environ["AWS_ACCESS_KEY_ID"] = "test-key"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "test-secret"


@pytest.fixture
def mock_mediasoup_client():
    """Mock mediasoup client"""
    client = Mock()
    client.create_transport = AsyncMock(return_value={
        "id": "transport-123",
        "iceParameters": {},
        "iceCandidates": [],
        "dtlsParameters": {}
    })
    client.connect_transport = AsyncMock()
    client.produce = AsyncMock(return_value={"id": "producer-123"})
    client.consume = AsyncMock(return_value={
        "id": "consumer-123",
        "producerId": "producer-123",
        "kind": "video",
        "rtpParameters": {}
    })
    client.get_stats = AsyncMock(return_value={
        "bytesReceived": 1000000,
        "bytesSent": 500000
    })
    return client


@pytest.fixture
def mock_s3_client():
    """Mock S3 client"""
    client = Mock()
    client.upload_file = AsyncMock(return_value="https://s3.example.com/video.mp4")
    client.download_file = AsyncMock()
    client.delete_file = AsyncMock()
    client.get_presigned_url = Mock(return_value="https://s3.example.com/presigned-url")
    return client


@pytest.fixture
def sample_session_config():
    """Sample session configuration"""
    return {
        "session_id": "test-session-123",
        "interviewer_id": "user-interviewer-456",
        "interviewee_id": "user-interviewee-789",
        "video_quality": "720p",
        "audio_enabled": True,
        "recording_enabled": True
    }


@pytest.fixture
def sample_webrtc_offer():
    """Sample WebRTC SDP offer"""
    return {
        "type": "offer",
        "sdp": """v=0
o=- 46117317 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0 1
a=extmap-allow-mixed
a=msid-semantic: WMS
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=mid:0
a=sendrecv
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=mid:1
a=sendrecv"""
    }


@pytest.fixture
def sample_rtp_capabilities():
    """Sample RTP capabilities"""
    return {
        "codecs": [
            {
                "kind": "audio",
                "mimeType": "audio/opus",
                "clockRate": 48000,
                "channels": 2
            },
            {
                "kind": "video",
                "mimeType": "video/VP8",
                "clockRate": 90000
            }
        ],
        "headerExtensions": []
    }


@pytest.fixture
def sample_stream_stats():
    """Sample streaming statistics"""
    return {
        "session_id": "test-session-123",
        "timestamp": datetime.utcnow().isoformat(),
        "video": {
            "bytes_sent": 15000000,
            "bytes_received": 12000000,
            "packets_sent": 10000,
            "packets_received": 8000,
            "packets_lost": 50,
            "jitter": 15.5,
            "round_trip_time": 45
        },
        "audio": {
            "bytes_sent": 500000,
            "bytes_received": 400000,
            "packets_sent": 5000,
            "packets_received": 4900,
            "packets_lost": 10
        }
    }


@pytest.fixture
def sample_recording_config():
    """Sample recording configuration"""
    return {
        "session_id": "test-session-123",
        "format": "mp4",
        "video_codec": "h264",
        "audio_codec": "aac",
        "video_bitrate": 2500000,
        "audio_bitrate": 128000,
        "resolution": "1280x720",
        "framerate": 30
    }


@pytest.fixture
def sample_transcoding_job():
    """Sample transcoding job"""
    return {
        "job_id": "transcode-job-123",
        "session_id": "test-session-123",
        "input_file": "/recordings/raw/test-session-123.webm",
        "output_files": [
            {"resolution": "720p", "path": "/recordings/encoded/test-session-123-720p.mp4"},
            {"resolution": "480p", "path": "/recordings/encoded/test-session-123-480p.mp4"},
            {"resolution": "360p", "path": "/recordings/encoded/test-session-123-360p.mp4"}
        ],
        "status": "completed",
        "progress": 100,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": datetime.utcnow().isoformat()
    }
