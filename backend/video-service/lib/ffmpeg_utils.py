"""
FFmpeg Utilities
Helper functions and command builders for FFmpeg operations
"""

import logging
from typing import List, Optional

from src.config import settings

logger = logging.getLogger(__name__)


class FFmpegCommandBuilder:
    """Builder for FFmpeg commands"""

    def __init__(self):
        self.ffmpeg_path = settings.FFMPEG_PATH

    def build_transcode_command(
        self,
        input_file: str,
        output_file: str,
        height: int,
        video_bitrate: str,
        maxrate: str,
        audio_bitrate: str = "128k",
        video_codec: str = "libx264",
        audio_codec: str = "aac",
        preset: str = "veryfast"
    ) -> List[str]:
        """
        Build FFmpeg transcode command for specific resolution

        Args:
            input_file: Source video file
            output_file: Output video file
            height: Target video height
            video_bitrate: Video bitrate (e.g., "2000k")
            maxrate: Maximum bitrate
            audio_bitrate: Audio bitrate
            video_codec: Video codec
            audio_codec: Audio codec
            preset: Encoding preset

        Returns:
            FFmpeg command as list of strings
        """
        return [
            self.ffmpeg_path,
            '-y',  # Overwrite output file
            '-i', input_file,
            # Video encoding
            '-vf', f'scale=-2:{height}',  # Scale height, maintain aspect ratio
            '-c:v', video_codec,
            '-preset', preset,
            '-b:v', video_bitrate,
            '-maxrate', maxrate,
            '-bufsize', str(int(maxrate.rstrip('k')) * 2) + 'k',
            # Audio encoding
            '-c:a', audio_codec,
            '-b:a', audio_bitrate,
            '-ar', '44100',
            # Output format
            '-f', 'mp4',
            '-movflags', '+faststart',
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            output_file
        ]

    def build_thumbnail_command(
        self,
        input_file: str,
        output_file: str,
        timestamp: float = 5.0,
        width: int = 640,
        quality: int = 2
    ) -> List[str]:
        """
        Build FFmpeg command for thumbnail generation

        Args:
            input_file: Source video file
            output_file: Output thumbnail file
            timestamp: Timestamp in seconds to extract frame
            width: Thumbnail width
            quality: JPEG quality (1-31, lower is better)

        Returns:
            FFmpeg command as list of strings
        """
        return [
            self.ffmpeg_path,
            '-y',
            '-ss', str(timestamp),  # Seek to timestamp
            '-i', input_file,
            '-vf', f'scale={width}:-1',  # Scale width, maintain aspect ratio
            '-vframes', '1',  # Extract 1 frame
            '-q:v', str(quality),  # Quality
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            output_file
        ]

    def build_clip_command(
        self,
        input_file: str,
        output_file: str,
        start_time: float,
        duration: float,
        resolution: str = "480p"
    ) -> List[str]:
        """
        Build FFmpeg command for creating video clip

        Args:
            input_file: Source video file
            output_file: Output clip file
            start_time: Start time in seconds
            duration: Clip duration in seconds
            resolution: Target resolution

        Returns:
            FFmpeg command as list of strings
        """
        # Map resolution string to height
        resolution_map = {
            '240p': 240,
            '360p': 360,
            '480p': 480,
            '720p': 720,
            '1080p': 1080
        }

        height = resolution_map.get(resolution, 480)

        return [
            self.ffmpeg_path,
            '-y',
            '-ss', str(start_time),  # Start time
            '-i', input_file,
            '-t', str(duration),  # Duration
            '-vf', f'scale=-2:{height}',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-f', 'mp4',
            '-movflags', '+faststart',
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            output_file
        ]

    def build_recording_command(
        self,
        input_source: str,
        output_file: str,
        video_bitrate: str = "2000k",
        audio_bitrate: str = "128k",
        video_codec: str = "libx264",
        audio_codec: str = "aac"
    ) -> List[str]:
        """
        Build FFmpeg command for live recording

        Args:
            input_source: RTMP URL or RTP stream
            output_file: Output video file
            video_bitrate: Video bitrate
            audio_bitrate: Audio bitrate
            video_codec: Video codec
            audio_codec: Audio codec

        Returns:
            FFmpeg command as list of strings
        """
        return [
            self.ffmpeg_path,
            '-y',
            '-i', input_source,
            '-c:v', video_codec,
            '-preset', settings.DEFAULT_PRESET,
            '-b:v', video_bitrate,
            '-maxrate', str(int(video_bitrate.rstrip('k')) * 1.25) + 'k',
            '-bufsize', f'{settings.RECORDING_BUFFER_SIZE}k',
            '-c:a', audio_codec,
            '-b:a', audio_bitrate,
            '-ar', '44100',
            '-f', 'mp4',
            '-movflags', '+faststart',
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            output_file
        ]

    def build_hls_command(
        self,
        input_file: str,
        output_dir: str,
        segment_time: int = 6,
        playlist_name: str = "playlist.m3u8"
    ) -> List[str]:
        """
        Build FFmpeg command for HLS streaming

        Args:
            input_file: Source video file
            output_dir: Output directory for HLS files
            segment_time: Segment duration in seconds
            playlist_name: HLS playlist filename

        Returns:
            FFmpeg command as list of strings
        """
        import os
        playlist_path = os.path.join(output_dir, playlist_name)
        segment_pattern = os.path.join(output_dir, "segment_%03d.ts")

        return [
            self.ffmpeg_path,
            '-y',
            '-i', input_file,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-f', 'hls',
            '-hls_time', str(segment_time),
            '-hls_list_size', '0',
            '-hls_segment_filename', segment_pattern,
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            playlist_path
        ]

    def build_concat_command(
        self,
        input_files: List[str],
        output_file: str
    ) -> List[str]:
        """
        Build FFmpeg command for concatenating multiple videos

        Args:
            input_files: List of input video files
            output_file: Output concatenated video

        Returns:
            FFmpeg command as list of strings
        """
        # Create concat filter
        concat_filter = f"concat=n={len(input_files)}:v=1:a=1"

        # Build input arguments
        input_args = []
        for f in input_files:
            input_args.extend(['-i', f])

        return [
            self.ffmpeg_path,
            '-y',
            *input_args,
            '-filter_complex', concat_filter,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-c:a', 'aac',
            '-f', 'mp4',
            '-movflags', '+faststart',
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            output_file
        ]

    def build_watermark_command(
        self,
        input_file: str,
        watermark_file: str,
        output_file: str,
        position: str = "bottom-right"
    ) -> List[str]:
        """
        Build FFmpeg command for adding watermark

        Args:
            input_file: Source video file
            watermark_file: Watermark image file
            output_file: Output video with watermark
            position: Watermark position (top-left, top-right, bottom-left, bottom-right)

        Returns:
            FFmpeg command as list of strings
        """
        # Map position to overlay coordinates
        position_map = {
            'top-left': '10:10',
            'top-right': 'main_w-overlay_w-10:10',
            'bottom-left': '10:main_h-overlay_h-10',
            'bottom-right': 'main_w-overlay_w-10:main_h-overlay_h-10',
        }

        overlay_position = position_map.get(position, position_map['bottom-right'])

        return [
            self.ffmpeg_path,
            '-y',
            '-i', input_file,
            '-i', watermark_file,
            '-filter_complex', f'overlay={overlay_position}',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-c:a', 'copy',
            '-f', 'mp4',
            '-movflags', '+faststart',
            '-loglevel', settings.FFMPEG_LOG_LEVEL,
            output_file
        ]


def validate_ffmpeg_installation() -> bool:
    """
    Validate that FFmpeg is installed and accessible

    Returns:
        True if FFmpeg is available, False otherwise
    """
    import subprocess

    try:
        result = subprocess.run(
            [settings.FFMPEG_PATH, '-version'],
            capture_output=True,
            text=True,
            check=True
        )
        version_line = result.stdout.split('\n')[0]
        logger.info(f"FFmpeg found: {version_line}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.error(f"FFmpeg not found or not accessible: {e}")
        return False


def get_ffmpeg_version() -> Optional[str]:
    """
    Get FFmpeg version string

    Returns:
        Version string or None if not available
    """
    import subprocess

    try:
        result = subprocess.run(
            [settings.FFMPEG_PATH, '-version'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.split('\n')[0]
    except Exception as e:
        logger.error(f"Failed to get FFmpeg version: {e}")
        return None
