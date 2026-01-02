"""
Storage Service - S3 Upload and Management
Handles video upload to S3-compatible storage (AWS S3, MinIO, Cloudflare R2)
"""

import os
import logging
from typing import Optional, Dict, List
from datetime import datetime, timedelta

import boto3
from botocore.exceptions import ClientError, BotoCoreError
from botocore.config import Config

from src.config import settings

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Base exception for storage errors"""
    pass


class S3StorageService:
    """S3-compatible storage service for video files"""

    def __init__(self):
        """Initialize S3 client"""
        self.bucket = settings.S3_BUCKET

        # Configure S3 client with path-style addressing for MinIO compatibility
        config = Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'},  # Use path-style for MinIO
            retries={'max_attempts': 3, 'mode': 'adaptive'}
        )

        # Support for S3-compatible services (MinIO, R2, etc.)
        client_kwargs = {
            'aws_access_key_id': settings.S3_ACCESS_KEY,
            'aws_secret_access_key': settings.S3_SECRET_KEY,
            'region_name': settings.S3_REGION,
            'config': config
        }

        if settings.S3_ENDPOINT:
            client_kwargs['endpoint_url'] = settings.S3_ENDPOINT

        self.s3_client = boto3.client('s3', **client_kwargs)

        logger.info(f"S3 storage service initialized (bucket: {self.bucket}, endpoint: {settings.S3_ENDPOINT or 'AWS'})")

    async def ensure_bucket_exists(self):
        """Ensure S3 bucket exists, create if it doesn't"""
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
            logger.info(f"Bucket '{self.bucket}' exists")
        except ClientError as e:
            error_code = str(e.response.get('Error', {}).get('Code', ''))
            http_status = e.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 0)

            logger.info(f"HeadBucket response: error_code={error_code}, http_status={http_status}")

            # Handle various error codes for bucket not existing
            # 404, NoSuchBucket, 400 (MinIO sometimes returns this when bucket doesn't exist)
            if error_code in ('404', '400', 'NoSuchBucket', '') or http_status in (404, 400):
                # Bucket doesn't exist, create it
                try:
                    # MinIO doesn't need LocationConstraint, only AWS S3 does
                    if settings.S3_ENDPOINT:
                        # MinIO or other S3-compatible service
                        self.s3_client.create_bucket(Bucket=self.bucket)
                    elif settings.S3_REGION != 'us-east-1':
                        # AWS S3 with non-default region
                        self.s3_client.create_bucket(
                            Bucket=self.bucket,
                            CreateBucketConfiguration={'LocationConstraint': settings.S3_REGION}
                        )
                    else:
                        # AWS S3 us-east-1
                        self.s3_client.create_bucket(Bucket=self.bucket)
                    logger.info(f"Created bucket '{self.bucket}'")
                except ClientError as create_error:
                    # Bucket may already exist (race condition) - that's OK
                    if 'BucketAlreadyOwnedByYou' in str(create_error) or 'BucketAlreadyExists' in str(create_error):
                        logger.info(f"Bucket '{self.bucket}' already exists")
                    else:
                        logger.error(f"Failed to create bucket: {create_error}")
                        raise StorageError(f"Failed to create bucket: {create_error}")
            else:
                logger.error(f"Error checking bucket: {e}")
                raise StorageError(f"Error checking bucket: {e}")

    async def check_connection(self):
        """Check S3 connection health"""
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
            return True
        except Exception as e:
            logger.error(f"S3 connection check failed: {e}")
            raise StorageError(f"S3 connection failed: {e}")

    async def upload_video(
        self,
        file_path: str,
        session_id: str,
        resolution: str = "original",
        metadata: Optional[Dict] = None
    ) -> str:
        """
        Upload video file to S3

        Args:
            file_path: Local path to video file
            session_id: Interview session UUID
            resolution: Video resolution (e.g., "720p", "480p", "thumbnail")
            metadata: Optional metadata to attach to object

        Returns:
            Signed URL for accessing the video
        """
        if not os.path.exists(file_path):
            raise StorageError(f"File not found: {file_path}")

        # Generate object key
        timestamp = datetime.utcnow().strftime("%Y%m%d")
        filename = os.path.basename(file_path)
        object_key = f"recordings/{timestamp}/{session_id}/{resolution}/{filename}"

        logger.info(f"Uploading {file_path} to s3://{self.bucket}/{object_key}")

        try:
            # Determine content type
            content_type = self._get_content_type(file_path)

            # Prepare extra args
            extra_args = {
                'ContentType': content_type,
                'ACL': 'private',  # Use signed URLs for access
            }

            # Add metadata if provided
            if metadata:
                extra_args['Metadata'] = {
                    k: str(v) for k, v in metadata.items()
                }

            # Add standard metadata
            extra_args['Metadata'] = extra_args.get('Metadata', {})
            extra_args['Metadata'].update({
                'session_id': session_id,
                'resolution': resolution,
                'uploaded_at': datetime.utcnow().isoformat(),
            })

            # Upload file
            self.s3_client.upload_file(
                file_path,
                self.bucket,
                object_key,
                ExtraArgs=extra_args
            )

            # Generate signed URL
            url = self._generate_signed_url(object_key)

            file_size = os.path.getsize(file_path)
            logger.info(
                f"Uploaded {file_size / 1024 / 1024:.2f} MB to {object_key}"
            )

            return url

        except ClientError as e:
            logger.error(f"Failed to upload {file_path}: {e}")
            raise StorageError(f"Failed to upload video: {e}")
        except Exception as e:
            logger.error(f"Unexpected error uploading {file_path}: {e}")
            raise StorageError(f"Unexpected error: {e}")

    async def upload_multipart(
        self,
        file_path: str,
        session_id: str,
        resolution: str = "original",
        chunk_size: int = 10 * 1024 * 1024  # 10 MB chunks
    ) -> str:
        """
        Upload large video file using multipart upload

        Args:
            file_path: Local path to video file
            session_id: Interview session UUID
            resolution: Video resolution
            chunk_size: Size of each part in bytes

        Returns:
            Signed URL for accessing the video
        """
        if not os.path.exists(file_path):
            raise StorageError(f"File not found: {file_path}")

        timestamp = datetime.utcnow().strftime("%Y%m%d")
        filename = os.path.basename(file_path)
        object_key = f"recordings/{timestamp}/{session_id}/{resolution}/{filename}"

        logger.info(f"Starting multipart upload for {file_path}")

        try:
            # Initiate multipart upload
            content_type = self._get_content_type(file_path)
            response = self.s3_client.create_multipart_upload(
                Bucket=self.bucket,
                Key=object_key,
                ContentType=content_type,
                Metadata={
                    'session_id': session_id,
                    'resolution': resolution,
                    'uploaded_at': datetime.utcnow().isoformat(),
                }
            )

            upload_id = response['UploadId']
            parts = []
            part_number = 1

            # Upload parts
            with open(file_path, 'rb') as f:
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break

                    logger.debug(f"Uploading part {part_number}")

                    part_response = self.s3_client.upload_part(
                        Bucket=self.bucket,
                        Key=object_key,
                        PartNumber=part_number,
                        UploadId=upload_id,
                        Body=data
                    )

                    parts.append({
                        'PartNumber': part_number,
                        'ETag': part_response['ETag']
                    })

                    part_number += 1

            # Complete multipart upload
            self.s3_client.complete_multipart_upload(
                Bucket=self.bucket,
                Key=object_key,
                UploadId=upload_id,
                MultipartUpload={'Parts': parts}
            )

            # Generate signed URL
            url = self._generate_signed_url(object_key)

            logger.info(f"Multipart upload completed: {object_key}")

            return url

        except ClientError as e:
            logger.error(f"Multipart upload failed: {e}")

            # Abort multipart upload on failure
            try:
                if 'upload_id' in locals():
                    self.s3_client.abort_multipart_upload(
                        Bucket=self.bucket,
                        Key=object_key,
                        UploadId=upload_id
                    )
            except Exception as abort_error:
                logger.error(f"Failed to abort multipart upload: {abort_error}")

            raise StorageError(f"Multipart upload failed: {e}")

    async def delete_video(self, session_id: str):
        """
        Delete all videos for a session

        Args:
            session_id: Interview session UUID
        """
        logger.info(f"Deleting videos for session {session_id}")

        try:
            # List all objects with session prefix
            prefix = f"recordings/"
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket, Prefix=prefix)

            delete_count = 0

            for page in pages:
                if 'Contents' not in page:
                    continue

                # Filter objects for this session
                objects_to_delete = [
                    {'Key': obj['Key']}
                    for obj in page['Contents']
                    if session_id in obj['Key']
                ]

                if objects_to_delete:
                    # Delete objects in batch
                    response = self.s3_client.delete_objects(
                        Bucket=self.bucket,
                        Delete={'Objects': objects_to_delete}
                    )

                    delete_count += len(response.get('Deleted', []))

            logger.info(f"Deleted {delete_count} objects for session {session_id}")

        except ClientError as e:
            logger.error(f"Failed to delete videos for session {session_id}: {e}")
            raise StorageError(f"Failed to delete videos: {e}")

    async def list_videos(self, session_id: str) -> List[Dict]:
        """
        List all videos for a session

        Args:
            session_id: Interview session UUID

        Returns:
            List of video metadata
        """
        try:
            prefix = f"recordings/"
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket, Prefix=prefix)

            videos = []

            for page in pages:
                if 'Contents' not in page:
                    continue

                for obj in page['Contents']:
                    if session_id in obj['Key']:
                        videos.append({
                            'key': obj['Key'],
                            'size': obj['Size'],
                            'last_modified': obj['LastModified'].isoformat(),
                            'url': self._generate_signed_url(obj['Key'])
                        })

            return videos

        except ClientError as e:
            logger.error(f"Failed to list videos for session {session_id}: {e}")
            raise StorageError(f"Failed to list videos: {e}")

    def _generate_signed_url(self, object_key: str, expires_in: int = None) -> str:
        """
        Generate pre-signed URL for object access

        Args:
            object_key: S3 object key
            expires_in: URL expiration time in seconds

        Returns:
            Pre-signed URL
        """
        if expires_in is None:
            expires_in = settings.SIGNED_URL_EXPIRY

        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket,
                    'Key': object_key
                },
                ExpiresIn=expires_in
            )

            return url

        except ClientError as e:
            logger.error(f"Failed to generate signed URL for {object_key}: {e}")
            raise StorageError(f"Failed to generate signed URL: {e}")

    def _get_content_type(self, file_path: str) -> str:
        """Determine content type based on file extension"""
        ext = os.path.splitext(file_path)[1].lower()

        content_types = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
        }

        return content_types.get(ext, 'application/octet-stream')

    async def get_storage_stats(self) -> Dict:
        """Get storage statistics for the bucket"""
        try:
            total_size = 0
            total_objects = 0

            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket, Prefix='recordings/')

            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        total_size += obj['Size']
                        total_objects += 1

            return {
                'total_objects': total_objects,
                'total_size_bytes': total_size,
                'total_size_mb': total_size / 1024 / 1024,
                'total_size_gb': total_size / 1024 / 1024 / 1024,
            }

        except ClientError as e:
            logger.error(f"Failed to get storage stats: {e}")
            raise StorageError(f"Failed to get storage stats: {e}")
