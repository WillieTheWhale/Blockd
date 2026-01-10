"""
Video Processing Tasks
Handles video encoding, thumbnail generation, and S3 upload
"""

import os
import subprocess
import tempfile
import logging
from typing import Dict, Any, Optional
from celery import shared_task
from celery.exceptions import Retry
import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

# S3 Configuration
S3_BUCKET = os.getenv('S3_BUCKET', 'blockd-videos')
S3_REGION = os.getenv('AWS_REGION', 'us-east-1')

# FFmpeg settings
FFMPEG_PATH = os.getenv('FFMPEG_PATH', '/usr/bin/ffmpeg')
FFPROBE_PATH = os.getenv('FFPROBE_PATH', '/usr/bin/ffprobe')


def get_s3_client():
    """Get configured S3 client"""
    return boto3.client(
        's3',
        region_name=S3_REGION,
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    )


@shared_task(
    name='tasks.video.encode',
    bind=True,
    autoretry_for=(subprocess.CalledProcessError, BotoCoreError, ClientError),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=1800,  # 30 minutes
    time_limit=2000,  # 33 minutes hard limit
)
def encode(
    self,
    video_id: str,
    source_url: str,
    quality: str = '720p',
    codec: str = 'h264',
    **kwargs
) -> Dict[str, Any]:
    """
    Encode video to specified quality and codec.

    Args:
        video_id: Unique identifier for the video
        source_url: S3 URL or local path to source video
        quality: Target quality (480p, 720p, 1080p)
        codec: Video codec (h264, h265, vp9)

    Returns:
        Dict with encoded video URL and metadata
    """
    logger.info(f"Starting video encode: {video_id}, quality={quality}, codec={codec}")

    quality_settings = {
        '480p': {'width': 854, 'height': 480, 'bitrate': '1000k'},
        '720p': {'width': 1280, 'height': 720, 'bitrate': '2500k'},
        '1080p': {'width': 1920, 'height': 1080, 'bitrate': '5000k'},
    }

    codec_settings = {
        'h264': {'vcodec': 'libx264', 'preset': 'medium', 'profile': 'high'},
        'h265': {'vcodec': 'libx265', 'preset': 'medium'},
        'vp9': {'vcodec': 'libvpx-vp9', 'crf': '30'},
    }

    settings = quality_settings.get(quality, quality_settings['720p'])
    codec_opts = codec_settings.get(codec, codec_settings['h264'])

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, 'input.mp4')
        output_path = os.path.join(tmpdir, f'output_{quality}.mp4')

        # Download source video from S3
        s3 = get_s3_client()
        bucket, key = _parse_s3_url(source_url)
        s3.download_file(bucket, key, input_path)

        # Build FFmpeg command
        cmd = [
            FFMPEG_PATH,
            '-i', input_path,
            '-vf', f"scale={settings['width']}:{settings['height']}",
            '-c:v', codec_opts['vcodec'],
            '-b:v', settings['bitrate'],
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            output_path,
        ]

        if 'preset' in codec_opts:
            cmd.extend(['-preset', codec_opts['preset']])
        if 'profile' in codec_opts:
            cmd.extend(['-profile:v', codec_opts['profile']])
        if 'crf' in codec_opts:
            cmd.extend(['-crf', codec_opts['crf']])

        logger.info(f"Running FFmpeg command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)

        # Get output file info
        duration = _get_video_duration(output_path)
        file_size = os.path.getsize(output_path)

        # Upload encoded video to S3
        output_key = f"encoded/{video_id}/{quality}.mp4"
        s3.upload_file(
            output_path,
            S3_BUCKET,
            output_key,
            ExtraArgs={'ContentType': 'video/mp4'},
        )

        output_url = f"s3://{S3_BUCKET}/{output_key}"

        logger.info(f"Video encode complete: {video_id}, output={output_url}")

        # Trigger thumbnail generation
        from celery_app import app
        app.send_task(
            'tasks.video.thumbnail',
            args=[video_id, output_url],
            routing_key=f'video.thumbnail.{video_id}',
            exchange='video_processing',
        )

        return {
            'video_id': video_id,
            'output_url': output_url,
            'quality': quality,
            'codec': codec,
            'duration': duration,
            'file_size': file_size,
            'status': 'success',
        }


@shared_task(
    name='tasks.video.thumbnail',
    bind=True,
    autoretry_for=(subprocess.CalledProcessError, BotoCoreError, ClientError),
    retry_backoff=True,
    max_retries=3,
    soft_time_limit=300,  # 5 minutes
    time_limit=360,
)
def thumbnail(
    self,
    video_id: str,
    source_url: str,
    timestamps: Optional[list] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Generate thumbnails from video.

    Args:
        video_id: Unique identifier for the video
        source_url: S3 URL to source video
        timestamps: List of timestamps (in seconds) to capture thumbnails

    Returns:
        Dict with thumbnail URLs
    """
    logger.info(f"Starting thumbnail generation: {video_id}")

    timestamps = timestamps or [0, 5, 10, 30]

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, 'input.mp4')

        # Download video
        s3 = get_s3_client()
        bucket, key = _parse_s3_url(source_url)
        s3.download_file(bucket, key, input_path)

        thumbnail_urls = []

        for ts in timestamps:
            output_path = os.path.join(tmpdir, f'thumb_{ts}.jpg')

            cmd = [
                FFMPEG_PATH,
                '-ss', str(ts),
                '-i', input_path,
                '-vframes', '1',
                '-vf', 'scale=320:-1',
                '-q:v', '2',
                '-y',
                output_path,
            ]

            try:
                subprocess.run(cmd, capture_output=True, check=True)

                # Upload thumbnail
                thumb_key = f"thumbnails/{video_id}/thumb_{ts}.jpg"
                s3.upload_file(
                    output_path,
                    S3_BUCKET,
                    thumb_key,
                    ExtraArgs={'ContentType': 'image/jpeg'},
                )
                thumbnail_urls.append(f"s3://{S3_BUCKET}/{thumb_key}")
            except subprocess.CalledProcessError:
                logger.warning(f"Failed to generate thumbnail at {ts}s for {video_id}")

        logger.info(f"Thumbnail generation complete: {video_id}, count={len(thumbnail_urls)}")

        # Trigger upload completion
        from celery_app import app
        app.send_task(
            'tasks.video.upload',
            args=[video_id, source_url, thumbnail_urls],
            routing_key=f'video.upload.{video_id}',
            exchange='video_processing',
        )

        return {
            'video_id': video_id,
            'thumbnail_urls': thumbnail_urls,
            'status': 'success',
        }


@shared_task(
    name='tasks.video.upload',
    bind=True,
    autoretry_for=(BotoCoreError, ClientError),
    retry_backoff=True,
    max_retries=3,
    soft_time_limit=600,
    time_limit=660,
)
def upload(
    self,
    video_id: str,
    video_url: str,
    thumbnail_urls: list,
    **kwargs
) -> Dict[str, Any]:
    """
    Finalize video upload and update database.

    Args:
        video_id: Unique identifier for the video
        video_url: S3 URL to encoded video
        thumbnail_urls: List of thumbnail URLs

    Returns:
        Dict with final video metadata
    """
    logger.info(f"Finalizing video upload: {video_id}")

    # Update video record in database
    # In production, this would call the video-service API
    import requests

    video_service_url = os.getenv('VIDEO_SERVICE_URL', 'http://video-service:3006')

    response = requests.post(
        f"{video_service_url}/videos/{video_id}/complete",
        json={
            'video_url': video_url,
            'thumbnail_urls': thumbnail_urls,
            'status': 'ready',
        },
        timeout=30,
    )

    if response.status_code != 200:
        raise Exception(f"Failed to update video record: {response.text}")

    logger.info(f"Video upload finalized: {video_id}")

    return {
        'video_id': video_id,
        'video_url': video_url,
        'thumbnail_urls': thumbnail_urls,
        'status': 'complete',
    }


def _parse_s3_url(url: str) -> tuple:
    """Parse S3 URL to bucket and key"""
    if url.startswith('s3://'):
        url = url[5:]
    parts = url.split('/', 1)
    return parts[0], parts[1] if len(parts) > 1 else ''


def _get_video_duration(path: str) -> float:
    """Get video duration using ffprobe"""
    cmd = [
        FFPROBE_PATH,
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())
