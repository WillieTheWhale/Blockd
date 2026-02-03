"""
Encoding Service - Adaptive Bitrate and Thumbnail Generation
Handles video transcoding for multiple resolutions using FFmpeg
"""

import os
import logging
import subprocess
import asyncio
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor

from src.config import settings
from lib.ffmpeg_utils import FFmpegCommandBuilder

logger = logging.getLogger(__name__)


class EncodingError(Exception):
    """Base exception for encoding errors"""
    pass


class EncodingService:
    """Service for video encoding and transcoding"""

    def __init__(self, max_workers: int = 4):
        """
        Initialize encoding service

        Args:
            max_workers: Maximum number of concurrent encoding jobs
        """
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.command_builder = FFmpegCommandBuilder()
        self._shutdown_completed = False

    async def create_adaptive_streams(
        self,
        input_file: str,
        session_id: str,
        resolutions: Optional[List[Dict]] = None
    ) -> List[Dict]:
        """
        Create multiple bitrate versions for adaptive streaming

        Args:
            input_file: Path to source video file
            session_id: Session identifier
            resolutions: Optional list of resolution configs (uses default if not provided)

        Returns:
            List of encoded video metadata
        """
        if not os.path.exists(input_file):
            raise EncodingError(f"Input file not found: {input_file}")

        if resolutions is None:
            resolutions = settings.ABR_RESOLUTIONS

        logger.info(f"Creating {len(resolutions)} adaptive streams for session {session_id}")

        # Create output directory
        output_dir = os.path.join(settings.RECORDING_PATH, session_id, "streams")
        os.makedirs(output_dir, exist_ok=True)

        # Get input video info
        input_info = await self._get_video_info(input_file)
        input_height = input_info.get('height', 1080)

        # Filter resolutions that are higher than source
        valid_resolutions = [
            res for res in resolutions
            if res['height'] <= input_height
        ]

        if not valid_resolutions:
            # If source is lower than all presets, just use source resolution
            logger.warning(
                f"Input video height ({input_height}p) is lower than all preset resolutions, "
                "using original"
            )
            valid_resolutions = [resolutions[-1]]  # Use highest preset

        # Encode all resolutions concurrently
        tasks = []
        for res_config in valid_resolutions:
            task = self._encode_resolution(input_file, output_dir, session_id, res_config)
            tasks.append(task)

        # Wait for all encodings to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out failed encodings
        successful_streams = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Failed to encode {valid_resolutions[i]['name']}: {result}")
            else:
                successful_streams.append(result)

        if not successful_streams:
            raise EncodingError("All encoding jobs failed")

        logger.info(
            f"Successfully created {len(successful_streams)}/{len(valid_resolutions)} "
            f"adaptive streams for session {session_id}"
        )

        return successful_streams

    async def _encode_resolution(
        self,
        input_file: str,
        output_dir: str,
        session_id: str,
        res_config: Dict
    ) -> Dict:
        """
        Encode video to specific resolution

        Args:
            input_file: Source video file
            output_dir: Output directory
            session_id: Session identifier
            res_config: Resolution configuration

        Returns:
            Encoded video metadata
        """
        resolution_name = res_config['name']
        output_file = os.path.join(output_dir, f"{session_id}_{resolution_name}.mp4")

        logger.info(f"Encoding {resolution_name} stream for session {session_id}")

        # Build FFmpeg command
        cmd = self.command_builder.build_transcode_command(
            input_file=input_file,
            output_file=output_file,
            height=res_config['height'],
            video_bitrate=res_config['bitrate'],
            maxrate=res_config.get('maxrate', res_config['bitrate']),
            audio_bitrate=settings.DEFAULT_AUDIO_BITRATE
        )

        logger.debug(f"FFmpeg command: {' '.join(cmd)}")

        try:
            # Run FFmpeg in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._run_ffmpeg_sync,
                cmd
            )

            # Verify output
            if not os.path.exists(output_file):
                raise EncodingError(f"Output file not created: {output_file}")

            file_size = os.path.getsize(output_file)

            logger.info(
                f"Encoded {resolution_name} stream: "
                f"{file_size / 1024 / 1024:.2f} MB"
            )

            return {
                'resolution': resolution_name,
                'file': output_file,
                'file_size': file_size,
                'height': res_config['height'],
                'bitrate': res_config['bitrate']
            }

        except Exception as e:
            logger.error(f"Failed to encode {resolution_name}: {e}")
            raise EncodingError(f"Encoding failed for {resolution_name}: {e}")

    async def generate_thumbnail(
        self,
        video_file: str,
        session_id: str,
        timestamp: float = 5.0,
        width: int = 640
    ) -> str:
        """
        Generate thumbnail from video at specified timestamp

        Args:
            video_file: Source video file
            session_id: Session identifier
            timestamp: Timestamp in seconds to extract frame
            width: Thumbnail width (height calculated to maintain aspect ratio)

        Returns:
            Path to thumbnail file
        """
        if not os.path.exists(video_file):
            raise EncodingError(f"Video file not found: {video_file}")

        # Get video duration
        video_info = await self._get_video_info(video_file)
        duration = video_info.get('duration', 0)

        # Adjust timestamp if longer than video
        if timestamp > duration:
            timestamp = duration / 2  # Use middle of video

        # Create thumbnail path
        output_dir = os.path.join(settings.RECORDING_PATH, session_id)
        os.makedirs(output_dir, exist_ok=True)
        thumbnail_file = os.path.join(output_dir, f"{session_id}_thumb.jpg")

        logger.info(f"Generating thumbnail for session {session_id} at {timestamp}s")

        # Build FFmpeg command
        cmd = self.command_builder.build_thumbnail_command(
            input_file=video_file,
            output_file=thumbnail_file,
            timestamp=timestamp,
            width=width
        )

        logger.debug(f"FFmpeg command: {' '.join(cmd)}")

        try:
            # Run FFmpeg in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._run_ffmpeg_sync,
                cmd
            )

            # Verify output
            if not os.path.exists(thumbnail_file):
                raise EncodingError(f"Thumbnail not created: {thumbnail_file}")

            file_size = os.path.getsize(thumbnail_file)
            logger.info(f"Generated thumbnail: {file_size / 1024:.2f} KB")

            return thumbnail_file

        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {e}")
            raise EncodingError(f"Thumbnail generation failed: {e}")

    async def generate_preview_clip(
        self,
        video_file: str,
        session_id: str,
        start_time: float = 0,
        duration: float = 30,
        resolution: str = "480p"
    ) -> str:
        """
        Generate short preview clip from video

        Args:
            video_file: Source video file
            session_id: Session identifier
            start_time: Start time in seconds
            duration: Clip duration in seconds
            resolution: Output resolution

        Returns:
            Path to preview clip
        """
        if not os.path.exists(video_file):
            raise EncodingError(f"Video file not found: {video_file}")

        output_dir = os.path.join(settings.RECORDING_PATH, session_id)
        os.makedirs(output_dir, exist_ok=True)
        preview_file = os.path.join(output_dir, f"{session_id}_preview.mp4")

        logger.info(
            f"Generating {duration}s preview clip for session {session_id} "
            f"starting at {start_time}s"
        )

        # Build FFmpeg command
        cmd = self.command_builder.build_clip_command(
            input_file=video_file,
            output_file=preview_file,
            start_time=start_time,
            duration=duration,
            resolution=resolution
        )

        logger.debug(f"FFmpeg command: {' '.join(cmd)}")

        try:
            # Run FFmpeg in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._run_ffmpeg_sync,
                cmd
            )

            # Verify output
            if not os.path.exists(preview_file):
                raise EncodingError(f"Preview clip not created: {preview_file}")

            file_size = os.path.getsize(preview_file)
            logger.info(f"Generated preview clip: {file_size / 1024 / 1024:.2f} MB")

            return preview_file

        except Exception as e:
            logger.error(f"Failed to generate preview clip: {e}")
            raise EncodingError(f"Preview clip generation failed: {e}")

    async def _get_video_info(self, video_file: str) -> Dict:
        """
        Get video metadata using FFprobe

        Args:
            video_file: Path to video file

        Returns:
            Video metadata dictionary
        """
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,duration,bit_rate,codec_name',
            '-show_entries', 'format=duration',
            '-of', 'json',
            video_file
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )

            import json
            data = json.loads(result.stdout)

            stream = data.get('streams', [{}])[0]
            format_info = data.get('format', {})

            return {
                'width': stream.get('width'),
                'height': stream.get('height'),
                'duration': float(format_info.get('duration', 0)),
                'bitrate': stream.get('bit_rate'),
                'codec': stream.get('codec_name')
            }

        except subprocess.CalledProcessError as e:
            logger.error(f"FFprobe failed: {e.stderr}")
            raise EncodingError(f"Failed to get video info: {e.stderr}")
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
            raise EncodingError(f"Failed to get video info: {e}")

    def _run_ffmpeg_sync(self, cmd: List[str]):
        """
        Run FFmpeg command synchronously (for thread pool execution)

        Args:
            cmd: FFmpeg command as list of strings
        """
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )

            return result

        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg failed: {e.stderr}")
            raise EncodingError(f"FFmpeg encoding failed: {e.stderr}")

    def shutdown(self):
        """
        Explicitly shutdown the ThreadPoolExecutor.
        Safe to call multiple times.
        """
        if not self._shutdown_completed:
            self.executor.shutdown(wait=True)
            self._shutdown_completed = True
            logger.debug("EncodingService executor shutdown completed")

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - ensures cleanup"""
        self.shutdown()
        return False

    async def cleanup_encoded_files(self, session_id: str):
        """
        Clean up encoded stream files

        Args:
            session_id: Session identifier
        """
        streams_dir = os.path.join(settings.RECORDING_PATH, session_id, "streams")

        if os.path.exists(streams_dir):
            try:
                import shutil
                shutil.rmtree(streams_dir)
                logger.info(f"Cleaned up encoded streams for session {session_id}")
            except Exception as e:
                logger.error(f"Failed to cleanup streams for session {session_id}: {e}")

    def __del__(self):
        """Fallback cleanup executor on deletion"""
        if not self._shutdown_completed:
            try:
                self.executor.shutdown(wait=False)
                self._shutdown_completed = True
            except Exception:
                pass  # Ignore errors during garbage collection
