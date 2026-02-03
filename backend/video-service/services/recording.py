"""
Recording Service - FFmpeg Recording Management
Handles video recording, lifecycle management, and cleanup
"""

import asyncio
import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from uuid import UUID
import subprocess
import signal

from src.config import settings

# Platform-specific subprocess flags
IS_WINDOWS = sys.platform == 'win32'
from services.storage import S3StorageService
from services.encoding import EncodingService
from lib.message_queue import MessageQueueClient

logger = logging.getLogger(__name__)


class RecordingError(Exception):
    """Base exception for recording errors"""
    pass


class RecordingNotFoundError(RecordingError):
    """Recording not found"""
    pass


class RecordingAlreadyStartedError(RecordingError):
    """Recording already started"""
    pass


class VideoRecorder:
    """Individual video recorder instance using FFmpeg"""

    def __init__(self, session_id: str, output_path: str):
        self.session_id = session_id
        self.output_path = output_path
        self.process: Optional[subprocess.Popen] = None
        self.started_at: Optional[datetime] = None
        self.stopped_at: Optional[datetime] = None
        self.is_recording = False

    async def start_recording(self, input_source: str, video_codec: str = None, audio_codec: str = None):
        """
        Start FFmpeg recording from input source

        Args:
            input_source: RTMP URL, RTP stream, or file path
            video_codec: Video codec (default: libx264)
            audio_codec: Audio codec (default: aac)
        """
        if self.is_recording:
            raise RecordingAlreadyStartedError(f"Recording {self.session_id} already started")

        # Ensure output directory exists
        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)

        # Build FFmpeg command
        cmd = [
            settings.FFMPEG_PATH,
            '-y',  # Overwrite output file
            '-i', input_source,
            '-c:v', video_codec or settings.DEFAULT_VIDEO_CODEC,
            '-preset', settings.DEFAULT_PRESET,
            '-b:v', settings.DEFAULT_VIDEO_BITRATE,
            '-maxrate', '2500k',
            '-bufsize', f'{settings.RECORDING_BUFFER_SIZE}k',
            '-c:a', audio_codec or settings.DEFAULT_AUDIO_CODEC,
            '-b:a', settings.DEFAULT_AUDIO_BITRATE,
            '-ar', '44100',
            '-f', 'mp4',
            '-movflags', '+faststart',  # Optimize for web streaming
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            self.output_path
        ]

        logger.info(f"Starting recording for session {self.session_id}")
        logger.debug(f"FFmpeg command: {' '.join(cmd)}")

        process = None
        try:
            # Platform-specific subprocess creation for proper process group management
            if IS_WINDOWS:
                # Windows: Use CREATE_NEW_PROCESS_GROUP for clean termination
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
                )
            else:
                # Unix: Use setsid to create new process group
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    preexec_fn=os.setsid
                )

            self.process = process
            self.is_recording = True
            self.started_at = datetime.utcnow()

            # Start monitoring task
            asyncio.create_task(self._monitor_recording())

            logger.info(f"Recording started for session {self.session_id} (PID: {self.process.pid})")

        except Exception as e:
            # Clean up process if it was created but setup failed
            if process is not None:
                try:
                    process.kill()
                    process.wait(timeout=5)
                except Exception as cleanup_error:
                    logger.error(f"Failed to cleanup process after start failure: {cleanup_error}")
            self.process = None
            self.is_recording = False
            logger.error(f"Failed to start recording for session {self.session_id}: {e}")
            raise RecordingError(f"Failed to start recording: {e}")

    async def _monitor_recording(self):
        """Monitor FFmpeg process and log output"""
        if not self.process:
            return

        try:
            # Read stderr in background
            while self.is_recording and self.process.poll() is None:
                await asyncio.sleep(1)

                # Check for max duration
                if self.started_at:
                    duration = (datetime.utcnow() - self.started_at).total_seconds()
                    if duration > settings.MAX_RECORDING_DURATION:
                        logger.warning(
                            f"Recording {self.session_id} exceeded max duration "
                            f"({settings.MAX_RECORDING_DURATION}s), stopping"
                        )
                        await self.stop_recording()
                        break

            # Check exit code
            if self.process.poll() is not None:
                exit_code = self.process.returncode
                if exit_code != 0:
                    stderr = self.process.stderr.read().decode() if self.process.stderr else ""
                    logger.error(
                        f"FFmpeg process for session {self.session_id} exited with code {exit_code}: {stderr}"
                    )

        except Exception as e:
            logger.error(f"Error monitoring recording {self.session_id}: {e}")

    async def stop_recording(self) -> str:
        """
        Stop FFmpeg recording gracefully

        Returns:
            Path to recorded video file
        """
        if not self.is_recording:
            logger.warning(f"Recording {self.session_id} is not active")
            return self.output_path

        logger.info(f"Stopping recording for session {self.session_id}")

        try:
            if self.process:
                # Platform-specific graceful shutdown
                if IS_WINDOWS:
                    # Windows: Send CTRL_BREAK_EVENT to process group
                    try:
                        self.process.send_signal(signal.CTRL_BREAK_EVENT)
                    except Exception:
                        # Fallback to terminate if CTRL_BREAK fails
                        self.process.terminate()
                else:
                    # Unix: Send SIGTERM for graceful shutdown
                    self.process.send_signal(signal.SIGTERM)

                # Wait up to 5 seconds
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Force kill if not responding
                    logger.warning(f"Force killing recording process for session {self.session_id}")
                    if IS_WINDOWS:
                        self.process.kill()
                    else:
                        os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
                    self.process.wait()

            self.is_recording = False
            self.stopped_at = datetime.utcnow()

            # Verify output file exists
            if not os.path.exists(self.output_path):
                raise RecordingError(f"Recording file not found: {self.output_path}")

            file_size = os.path.getsize(self.output_path)
            logger.info(
                f"Recording stopped for session {self.session_id} "
                f"(duration: {(self.stopped_at - self.started_at).total_seconds():.1f}s, "
                f"size: {file_size / 1024 / 1024:.2f} MB)"
            )

            return self.output_path

        except Exception as e:
            logger.error(f"Error stopping recording for session {self.session_id}: {e}")
            raise RecordingError(f"Failed to stop recording: {e}")

    def get_duration(self) -> Optional[float]:
        """Get current recording duration in seconds"""
        if not self.started_at:
            return None

        end_time = self.stopped_at or datetime.utcnow()
        return (end_time - self.started_at).total_seconds()


class RecordingManager:
    """Manages all active recordings"""

    def __init__(self):
        self.active_recordings: Dict[str, VideoRecorder] = {}
        self.storage_service = S3StorageService()
        self.encoding_service = EncodingService()
        self.mq_client: Optional[MessageQueueClient] = None

        # Metrics
        self.total_recordings_started = 0
        self.total_recordings_completed = 0
        self.total_recordings_failed = 0

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup"""
        await self.shutdown()
        return False

    async def start_session_recording(
        self,
        session_id: str,
        input_source: str,
        video_codec: str = None,
        audio_codec: str = None
    ) -> Dict:
        """
        Start recording for an interview session

        Args:
            session_id: Interview session UUID
            input_source: RTMP URL or RTP stream
            video_codec: Optional video codec override
            audio_codec: Optional audio codec override

        Returns:
            Recording metadata
        """
        if session_id in self.active_recordings:
            raise RecordingAlreadyStartedError(f"Recording already started for session {session_id}")

        # Check concurrent limit
        if len(self.active_recordings) >= settings.MAX_CONCURRENT_STREAMS:
            raise RecordingError(
                f"Maximum concurrent streams reached ({settings.MAX_CONCURRENT_STREAMS})"
            )

        # Create output path
        output_dir = os.path.join(settings.RECORDING_PATH, session_id)
        output_file = os.path.join(output_dir, f"{session_id}.mp4")

        # Create recorder
        recorder = VideoRecorder(session_id, output_file)

        try:
            # Start recording
            await recorder.start_recording(input_source, video_codec, audio_codec)

            # Store in active recordings
            self.active_recordings[session_id] = recorder
            self.total_recordings_started += 1

            # Publish event to message queue
            await self._publish_event('recording_started', {
                'session_id': session_id,
                'started_at': recorder.started_at.isoformat(),
                'output_path': output_file
            })

            logger.info(f"Recording started for session {session_id}")

            return {
                'session_id': session_id,
                'status': 'recording',
                'started_at': recorder.started_at.isoformat(),
                'output_path': output_file
            }

        except Exception as e:
            self.total_recordings_failed += 1
            logger.error(f"Failed to start recording for session {session_id}: {e}")
            raise

    async def stop_session_recording(self, session_id: str, upload_to_s3: bool = True) -> Dict:
        """
        Stop recording and optionally upload to S3

        Args:
            session_id: Interview session UUID
            upload_to_s3: Whether to upload to S3 and create adaptive streams

        Returns:
            Recording metadata with URLs
        """
        recorder = self.active_recordings.get(session_id)
        if not recorder:
            raise RecordingNotFoundError(f"No active recording found for session {session_id}")

        try:
            # Stop FFmpeg recording
            video_file = await recorder.stop_recording()

            # Remove from active recordings
            del self.active_recordings[session_id]

            result = {
                'session_id': session_id,
                'status': 'completed',
                'started_at': recorder.started_at.isoformat() if recorder.started_at else None,
                'stopped_at': recorder.stopped_at.isoformat() if recorder.stopped_at else None,
                'duration': recorder.get_duration(),
                'file_path': video_file,
                'file_size': os.path.getsize(video_file)
            }

            if upload_to_s3:
                # Generate adaptive bitrate streams
                logger.info(f"Generating adaptive streams for session {session_id}")
                streams = await self.encoding_service.create_adaptive_streams(video_file, session_id)

                # Generate thumbnail
                thumbnail = await self.encoding_service.generate_thumbnail(video_file, session_id)

                # Upload all files to S3
                urls = []
                for stream in streams:
                    url = await self.storage_service.upload_video(
                        stream['file'],
                        session_id,
                        stream['resolution']
                    )
                    urls.append({
                        'resolution': stream['resolution'],
                        'url': url,
                        'file_size': stream['file_size']
                    })

                # Upload thumbnail
                thumbnail_url = await self.storage_service.upload_video(
                    thumbnail,
                    session_id,
                    'thumbnail'
                )

                result['urls'] = urls
                result['thumbnail_url'] = thumbnail_url

                # Cleanup local files
                os.remove(video_file)
                for stream in streams:
                    os.remove(stream['file'])
                os.remove(thumbnail)

                logger.info(f"Recording uploaded to S3 for session {session_id}")

            # Publish completion event
            await self._publish_event('recording_completed', result)

            self.total_recordings_completed += 1
            logger.info(f"Recording completed for session {session_id}")

            return result

        except Exception as e:
            self.total_recordings_failed += 1
            logger.error(f"Failed to stop recording for session {session_id}: {e}")
            raise

    async def get_recording_status(self, session_id: str) -> Dict:
        """Get current status of a recording"""
        recorder = self.active_recordings.get(session_id)

        if not recorder:
            return {
                'session_id': session_id,
                'status': 'not_found',
                'is_recording': False
            }

        return {
            'session_id': session_id,
            'status': 'recording',
            'is_recording': recorder.is_recording,
            'started_at': recorder.started_at.isoformat() if recorder.started_at else None,
            'duration': recorder.get_duration()
        }

    async def stop_all_recordings(self):
        """Stop all active recordings (for shutdown)"""
        logger.info(f"Stopping {len(self.active_recordings)} active recordings")

        for session_id in list(self.active_recordings.keys()):
            try:
                await self.stop_session_recording(session_id, upload_to_s3=False)
            except Exception as e:
                logger.error(f"Error stopping recording {session_id}: {e}")

    async def cleanup_loop(self):
        """Background task to cleanup old temporary files"""
        logger.info("Starting automatic cleanup task")

        while True:
            try:
                await asyncio.sleep(3600)  # Run every hour

                cutoff_time = datetime.utcnow() - timedelta(seconds=settings.TEMP_FILE_RETENTION)
                cleanup_count = 0

                # Cleanup old files in recording directory
                if os.path.exists(settings.RECORDING_PATH):
                    for root, dirs, files in os.walk(settings.RECORDING_PATH):
                        for file in files:
                            file_path = os.path.join(root, file)
                            file_mtime = datetime.fromtimestamp(os.path.getmtime(file_path))

                            if file_mtime < cutoff_time:
                                try:
                                    os.remove(file_path)
                                    cleanup_count += 1
                                    logger.debug(f"Cleaned up old file: {file_path}")
                                except Exception as e:
                                    logger.error(f"Failed to cleanup {file_path}: {e}")

                if cleanup_count > 0:
                    logger.info(f"Cleaned up {cleanup_count} old temporary files")

            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")

    async def shutdown(self):
        """Graceful shutdown of recording manager and cleanup resources"""
        logger.info("Shutting down RecordingManager")

        try:
            # Stop all active recordings
            await self.stop_all_recordings()
        except Exception as e:
            logger.error(f"Error stopping recordings during shutdown: {e}")

        try:
            # Shutdown encoding service executor
            if self.encoding_service:
                self.encoding_service.shutdown()
                logger.info("Encoding service shutdown complete")
        except Exception as e:
            logger.error(f"Error shutting down encoding service: {e}")

        try:
            # Close message queue connection
            if self.mq_client:
                await self.mq_client.close()
                self.mq_client = None
                logger.info("Message queue connection closed")
        except Exception as e:
            logger.error(f"Error closing message queue connection: {e}")

        logger.info("RecordingManager shutdown complete")

    async def _publish_event(self, event_type: str, data: Dict):
        """Publish event to message queue"""
        if not self.mq_client:
            self.mq_client = MessageQueueClient()
            await self.mq_client.connect()

        try:
            await self.mq_client.publish(
                exchange=settings.VIDEO_PROCESSING_EXCHANGE,
                routing_key=event_type,
                message={
                    'event': event_type,
                    'timestamp': datetime.utcnow().isoformat(),
                    'data': data
                }
            )
        except Exception as e:
            logger.error(f"Failed to publish event {event_type}: {e}")
