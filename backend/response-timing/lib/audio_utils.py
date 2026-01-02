"""Audio file handling utilities"""

import logging
import os
import tempfile
from typing import List
from urllib.parse import urlparse
import boto3
from botocore.exceptions import ClientError

from src.config import get_settings
from lib.errors import AudioDownloadError

logger = logging.getLogger(__name__)


async def download_audio_from_s3(audio_url: str) -> str:
    """
    Download audio file from S3

    Args:
        audio_url: S3 URL (s3://bucket/key or https://...)

    Returns:
        Path to downloaded file

    Raises:
        AudioDownloadError: If download fails
    """
    settings = get_settings()

    try:
        logger.info(f"Downloading audio from S3: {audio_url}")

        # Parse S3 URL
        if audio_url.startswith('s3://'):
            # s3://bucket/key format
            parsed = urlparse(audio_url)
            bucket = parsed.netloc
            key = parsed.path.lstrip('/')
        elif 'amazonaws.com' in audio_url or settings.S3_ENDPOINT in audio_url:
            # https://bucket.s3.amazonaws.com/key format
            parsed = urlparse(audio_url)
            path_parts = parsed.path.lstrip('/').split('/', 1)
            bucket = settings.S3_BUCKET_AUDIO
            key = path_parts[1] if len(path_parts) > 1 else path_parts[0]
        else:
            raise AudioDownloadError(
                f"Invalid S3 URL format: {audio_url}",
                {"url": audio_url}
            )

        # Create S3 client
        s3_client = boto3.client(
            's3',
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION
        )

        # Create temp file
        file_ext = os.path.splitext(key)[1] or '.mp3'
        temp_fd, temp_path = tempfile.mkstemp(suffix=file_ext)
        os.close(temp_fd)

        # Download file
        s3_client.download_file(bucket, key, temp_path)

        logger.info(f"Audio downloaded to {temp_path}")
        return temp_path

    except ClientError as e:
        logger.error(f"S3 download failed: {e}")
        raise AudioDownloadError(
            f"Failed to download from S3: {str(e)}",
            {"url": audio_url, "error": str(e)}
        )
    except Exception as e:
        logger.error(f"Audio download failed: {e}")
        raise AudioDownloadError(
            f"Failed to download audio: {str(e)}",
            {"url": audio_url, "error": str(e)}
        )


async def cleanup_temp_files(file_paths: List[str]):
    """
    Clean up temporary files

    Args:
        file_paths: List of file paths to delete
    """
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"Cleaned up temp file: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file {file_path}: {e}")


def get_audio_file_info(file_path: str) -> dict:
    """
    Get audio file information

    Args:
        file_path: Path to audio file

    Returns:
        {
            'size_bytes': int,
            'size_mb': float,
            'format': str,
            'exists': bool
        }
    """
    if not os.path.exists(file_path):
        return {
            'exists': False,
            'size_bytes': 0,
            'size_mb': 0.0,
            'format': None
        }

    size_bytes = os.path.getsize(file_path)
    size_mb = size_bytes / (1024 * 1024)
    file_format = os.path.splitext(file_path)[1].lstrip('.')

    return {
        'exists': True,
        'size_bytes': size_bytes,
        'size_mb': round(size_mb, 2),
        'format': file_format
    }
