"""
Unit tests for recording service
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime

from services.recording import (
    RecordingManager,
    VideoRecorder,
    RecordingError,
    RecordingNotFoundError,
    RecordingAlreadyStartedError
)


@pytest.fixture
def recording_manager():
    """Fixture for RecordingManager"""
    return RecordingManager()


@pytest.fixture
def video_recorder():
    """Fixture for VideoRecorder"""
    session_id = "test-session-123"
    output_path = "/tmp/test_recording.mp4"
    return VideoRecorder(session_id, output_path)


class TestVideoRecorder:
    """Test VideoRecorder class"""

    def test_recorder_initialization(self, video_recorder):
        """Test recorder initializes correctly"""
        assert video_recorder.session_id == "test-session-123"
        assert video_recorder.output_path == "/tmp/test_recording.mp4"
        assert video_recorder.process is None
        assert video_recorder.is_recording is False

    @pytest.mark.asyncio
    async def test_start_recording_already_started(self, video_recorder):
        """Test starting recording when already started raises error"""
        video_recorder.is_recording = True

        with pytest.raises(RecordingAlreadyStartedError):
            await video_recorder.start_recording("rtmp://test/stream")

    @pytest.mark.asyncio
    @patch('subprocess.Popen')
    @patch('os.makedirs')
    async def test_start_recording_success(self, mock_makedirs, mock_popen, video_recorder):
        """Test successful recording start"""
        mock_process = Mock()
        mock_process.pid = 12345
        mock_popen.return_value = mock_process

        await video_recorder.start_recording("rtmp://test/stream")

        assert video_recorder.is_recording is True
        assert video_recorder.process == mock_process
        assert video_recorder.started_at is not None
        mock_makedirs.assert_called_once()
        mock_popen.assert_called_once()

    @pytest.mark.asyncio
    @patch('os.path.exists', return_value=True)
    @patch('os.path.getsize', return_value=1024000)
    async def test_stop_recording_success(self, mock_getsize, mock_exists, video_recorder):
        """Test successful recording stop"""
        mock_process = Mock()
        mock_process.wait = Mock()
        mock_process.poll = Mock(return_value=0)

        video_recorder.process = mock_process
        video_recorder.is_recording = True
        video_recorder.started_at = datetime.utcnow()

        result = await video_recorder.stop_recording()

        assert result == video_recorder.output_path
        assert video_recorder.is_recording is False
        assert video_recorder.stopped_at is not None
        mock_process.send_signal.assert_called_once()

    def test_get_duration_not_started(self, video_recorder):
        """Test duration when recording not started"""
        assert video_recorder.get_duration() is None

    def test_get_duration_active(self, video_recorder):
        """Test duration during active recording"""
        video_recorder.started_at = datetime.utcnow()

        duration = video_recorder.get_duration()

        assert duration is not None
        assert duration >= 0


class TestRecordingManager:
    """Test RecordingManager class"""

    def test_manager_initialization(self, recording_manager):
        """Test manager initializes correctly"""
        assert recording_manager.active_recordings == {}
        assert recording_manager.total_recordings_started == 0
        assert recording_manager.total_recordings_completed == 0
        assert recording_manager.total_recordings_failed == 0

    @pytest.mark.asyncio
    @patch('services.recording.VideoRecorder')
    async def test_start_session_recording_success(self, mock_recorder_class, recording_manager):
        """Test successful session recording start"""
        session_id = "test-session-123"
        input_source = "rtmp://test/stream"

        mock_recorder = AsyncMock()
        mock_recorder.started_at = datetime.utcnow()
        mock_recorder_class.return_value = mock_recorder

        # Mock the start_recording method
        mock_recorder.start_recording = AsyncMock()

        result = await recording_manager.start_session_recording(
            session_id, input_source
        )

        assert result['session_id'] == session_id
        assert result['status'] == 'recording'
        assert session_id in recording_manager.active_recordings
        assert recording_manager.total_recordings_started == 1

    @pytest.mark.asyncio
    async def test_start_session_recording_already_started(self, recording_manager):
        """Test starting recording for session that's already recording"""
        session_id = "test-session-123"
        recording_manager.active_recordings[session_id] = Mock()

        with pytest.raises(RecordingAlreadyStartedError):
            await recording_manager.start_session_recording(
                session_id, "rtmp://test/stream"
            )

    @pytest.mark.asyncio
    @patch('src.config.settings')
    async def test_start_session_recording_concurrent_limit(
        self, mock_settings, recording_manager
    ):
        """Test concurrent stream limit"""
        mock_settings.MAX_CONCURRENT_STREAMS = 1

        # Add one active recording
        recording_manager.active_recordings["existing-session"] = Mock()

        with pytest.raises(RecordingError, match="Maximum concurrent streams"):
            await recording_manager.start_session_recording(
                "new-session", "rtmp://test/stream"
            )

    @pytest.mark.asyncio
    async def test_stop_session_recording_not_found(self, recording_manager):
        """Test stopping non-existent recording"""
        with pytest.raises(RecordingNotFoundError):
            await recording_manager.stop_session_recording("nonexistent-session")

    @pytest.mark.asyncio
    @patch('services.recording.S3StorageService')
    @patch('services.recording.EncodingService')
    @patch('os.remove')
    async def test_stop_session_recording_success(
        self, mock_remove, mock_encoding_class, mock_storage_class, recording_manager
    ):
        """Test successful recording stop with upload"""
        session_id = "test-session-123"

        # Setup mock recorder
        mock_recorder = AsyncMock()
        mock_recorder.stop_recording = AsyncMock(return_value="/tmp/test.mp4")
        mock_recorder.started_at = datetime.utcnow()
        mock_recorder.stopped_at = datetime.utcnow()
        mock_recorder.get_duration = Mock(return_value=120.0)

        recording_manager.active_recordings[session_id] = mock_recorder

        # Mock encoding service
        mock_encoding = AsyncMock()
        mock_encoding.create_adaptive_streams = AsyncMock(return_value=[
            {'resolution': '720p', 'file': '/tmp/720p.mp4', 'file_size': 1024000}
        ])
        mock_encoding.generate_thumbnail = AsyncMock(return_value='/tmp/thumb.jpg')
        recording_manager.encoding_service = mock_encoding

        # Mock storage service
        mock_storage = AsyncMock()
        mock_storage.upload_video = AsyncMock(return_value='https://s3.example.com/video.mp4')
        recording_manager.storage_service = mock_storage

        # Mock message queue
        recording_manager._publish_event = AsyncMock()

        result = await recording_manager.stop_session_recording(
            session_id, upload_to_s3=True
        )

        assert result['session_id'] == session_id
        assert result['status'] == 'completed'
        assert result['duration'] == 120.0
        assert 'urls' in result
        assert session_id not in recording_manager.active_recordings
        assert recording_manager.total_recordings_completed == 1

    @pytest.mark.asyncio
    async def test_get_recording_status_not_found(self, recording_manager):
        """Test getting status for non-existent recording"""
        result = await recording_manager.get_recording_status("nonexistent")

        assert result['status'] == 'not_found'
        assert result['is_recording'] is False

    @pytest.mark.asyncio
    async def test_get_recording_status_active(self, recording_manager):
        """Test getting status for active recording"""
        session_id = "test-session-123"

        mock_recorder = Mock()
        mock_recorder.is_recording = True
        mock_recorder.started_at = datetime.utcnow()
        mock_recorder.get_duration = Mock(return_value=60.0)

        recording_manager.active_recordings[session_id] = mock_recorder

        result = await recording_manager.get_recording_status(session_id)

        assert result['session_id'] == session_id
        assert result['status'] == 'recording'
        assert result['is_recording'] is True
        assert result['duration'] == 60.0


@pytest.mark.asyncio
async def test_recording_full_lifecycle():
    """Integration test for full recording lifecycle"""
    manager = RecordingManager()

    # This would be a more comprehensive integration test
    # that tests the full flow from start to stop
    # For now, just verify manager is properly initialized
    assert manager is not None
    assert isinstance(manager.active_recordings, dict)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
