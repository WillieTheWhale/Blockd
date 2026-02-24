"""
Response Timing Analysis Tasks
Handles async audio transcription and timing analysis via Celery
"""

import os
import json
import logging
import tempfile
from typing import Dict, Any, Optional
from datetime import datetime
from uuid import uuid4

from celery import shared_task
import requests
import redis

logger = logging.getLogger(__name__)

# Service URLs
RESPONSE_TIMING_SERVICE_URL = os.getenv('RESPONSE_TIMING_SERVICE_URL', 'http://response-timing:3004')

# Redis configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '0'))

# S3 configuration
S3_BUCKET = os.getenv('S3_BUCKET', 'blockd-recordings')
S3_REGION = os.getenv('AWS_REGION', 'us-east-1')

# Internal service token for authenticated service-to-service calls
INTERNAL_SERVICE_TOKEN = os.getenv('INTERNAL_SERVICE_TOKEN', 'blockd-internal-service-token')

# Job status keys
JOB_STATUS_PREFIX = 'timing_job:'
JOB_STATUS_TTL = 86400  # 24 hours


def get_redis_client():
    """Get configured Redis client"""
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
    )


def update_job_status(
    job_id: str,
    status: str,
    progress: int = 0,
    message: str = "",
    result: Optional[Dict] = None
):
    """Update job status in Redis"""
    try:
        client = get_redis_client()
        job_data = {
            'job_id': job_id,
            'status': status,
            'progress': progress,
            'message': message,
            'updated_at': datetime.utcnow().isoformat(),
        }
        if result:
            job_data['result'] = result

        client.setex(
            f"{JOB_STATUS_PREFIX}{job_id}",
            JOB_STATUS_TTL,
            json.dumps(job_data)
        )
    except Exception as e:
        logger.error(f"Failed to update job status: {e}")


def get_job_status(job_id: str) -> Optional[Dict]:
    """Get job status from Redis"""
    try:
        client = get_redis_client()
        data = client.get(f"{JOB_STATUS_PREFIX}{job_id}")
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        logger.error(f"Failed to get job status: {e}")
        return None


@shared_task(
    name='tasks.timing.analyze',
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=420,  # 7 minutes soft limit (Whisper can take 5+ min)
    time_limit=480,       # 8 minutes hard limit
    track_started=True,
)
def analyze(
    self,
    job_id: str,
    question_id: str,
    audio_url: str,
    question_asked_at: str,
    answer_start_timestamp: str,
    difficulty: str = "medium",
    session_id: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Analyze audio for timing metrics and anomalies.

    This task performs the full timing analysis pipeline:
    1. Download audio from S3
    2. Process and validate audio
    3. Transcribe with Whisper (can take several minutes)
    4. Detect pauses and filler words
    5. Calculate timing metrics
    6. Detect anomalies and calculate risk score
    7. Save results to database

    Args:
        job_id: Unique job identifier for status tracking
        question_id: Question ID for database reference
        audio_url: S3 URL or presigned URL for audio file
        question_asked_at: ISO timestamp of when question was asked
        answer_start_timestamp: ISO timestamp of when answer started
        difficulty: Question difficulty (easy, medium, hard)
        session_id: Optional session ID

    Returns:
        Complete timing analysis results
    """
    logger.info(f"Starting timing analysis: job={job_id}, question={question_id}")

    # Track temp files for cleanup
    temp_files = []

    # Update status: started
    update_job_status(
        job_id,
        status='processing',
        progress=0,
        message='Starting analysis'
    )

    # Update Celery task state
    self.update_state(
        state='PROGRESS',
        meta={'progress': 0, 'message': 'Starting analysis'}
    )

    try:
        # Step 1: Download audio (10%)
        update_job_status(job_id, 'processing', 10, 'Downloading audio')
        self.update_state(state='PROGRESS', meta={'progress': 10, 'message': 'Downloading audio'})

        audio_path = _download_audio(audio_url)
        temp_files.append(audio_path)

        # Step 2: Process audio (20%)
        update_job_status(job_id, 'processing', 20, 'Processing audio')
        self.update_state(state='PROGRESS', meta={'progress': 20, 'message': 'Processing audio'})

        processed_result = _call_timing_service(
            '/internal/process-audio',
            {'audio_path': audio_path}
        )
        processed_audio_path = processed_result['processed_path']
        temp_files.append(processed_audio_path)
        total_duration = processed_result['duration']

        # Step 3: Transcribe audio (20% -> 60%, this is the slow step)
        update_job_status(job_id, 'processing', 30, 'Transcribing audio (this may take a few minutes)')
        self.update_state(state='PROGRESS', meta={'progress': 30, 'message': 'Transcribing audio'})

        transcription = _call_timing_service(
            '/internal/transcribe',
            {'audio_path': processed_audio_path},
            timeout=360  # 6 minute timeout for Whisper
        )

        if not transcription or not transcription.get('text'):
            raise ValueError("Transcription failed - no text returned")

        # Step 4: Analyze pauses (70%)
        update_job_status(job_id, 'processing', 70, 'Analyzing pauses')
        self.update_state(state='PROGRESS', meta={'progress': 70, 'message': 'Analyzing pauses'})

        pause_result = _call_timing_service(
            '/internal/detect-pauses',
            {'audio_path': processed_audio_path, 'duration': total_duration}
        )

        # Step 5: Analyze filler words (80%)
        update_job_status(job_id, 'processing', 80, 'Analyzing speech patterns')
        self.update_state(state='PROGRESS', meta={'progress': 80, 'message': 'Analyzing speech patterns'})

        filler_result = _call_timing_service(
            '/internal/detect-fillers',
            {'words': transcription['words'], 'duration': total_duration}
        )

        # Step 6: Calculate metrics and anomalies (90%)
        update_job_status(job_id, 'processing', 90, 'Calculating risk score')
        self.update_state(state='PROGRESS', meta={'progress': 90, 'message': 'Calculating risk score'})

        analysis_result = _call_timing_service(
            '/internal/calculate-metrics',
            {
                'transcription': transcription,
                'pauses': pause_result,
                'fillers': filler_result,
                'duration': total_duration,
                'question_asked_at': question_asked_at,
                'answer_start_timestamp': answer_start_timestamp,
                'difficulty': difficulty,
            }
        )

        # Step 7: Save to database (95%)
        update_job_status(job_id, 'processing', 95, 'Saving results')
        self.update_state(state='PROGRESS', meta={'progress': 95, 'message': 'Saving results'})

        _call_timing_service(
            '/internal/save-result',
            {
                'question_id': question_id,
                'transcription': transcription,
                'analysis': analysis_result,
            }
        )

        # Build final result
        result = {
            'job_id': job_id,
            'question_id': question_id,
            'analysis_id': str(uuid4()),
            'transcription': {
                'text': transcription['text'],
                'confidence': transcription.get('confidence', 0.0),
                'word_count': len(transcription.get('words', [])),
            },
            'timing_metrics': analysis_result.get('timing_metrics', {}),
            'anomalies': analysis_result.get('anomalies', {}),
            'risk_score': analysis_result.get('risk_score', 0.0),
            'recommendation': analysis_result.get('recommendation', 'review'),
            'status': 'success',
            'completed_at': datetime.utcnow().isoformat(),
        }

        # Update final status
        update_job_status(
            job_id,
            status='completed',
            progress=100,
            message='Analysis complete',
            result=result
        )

        logger.info(f"Timing analysis complete: job={job_id}, risk_score={result['risk_score']}")

        # Notify if high risk
        if result['risk_score'] > 0.7:
            _notify_high_risk(session_id, question_id, result)

        return result

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Timing analysis failed: job={job_id}, error={error_msg}", exc_info=True)

        update_job_status(
            job_id,
            status='failed',
            progress=0,
            message=f'Analysis failed: {error_msg}'
        )

        # Re-raise for Celery retry logic
        raise

    finally:
        # Always cleanup temp files, even on failure
        _cleanup_temp_files(temp_files)


def _download_audio(audio_url: str) -> str:
    """Download audio from S3 or presigned URL"""
    import boto3
    from urllib.parse import urlparse

    parsed = urlparse(audio_url)

    # Create temp file
    suffix = '.wav'
    if '.mp3' in audio_url:
        suffix = '.mp3'
    elif '.m4a' in audio_url:
        suffix = '.m4a'

    temp_file = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    temp_path = temp_file.name
    temp_file.close()

    if parsed.scheme == 's3':
        # Direct S3 URL: s3://bucket/key
        bucket = parsed.netloc
        key = parsed.path.lstrip('/')

        s3 = boto3.client('s3', region_name=S3_REGION)
        s3.download_file(bucket, key, temp_path)
    elif 's3.amazonaws.com' in audio_url or 'amazonaws.com' in audio_url:
        # Presigned S3 URL - use HTTP download
        response = requests.get(audio_url, stream=True, timeout=60)
        response.raise_for_status()

        with open(temp_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
    else:
        # Generic HTTP URL
        response = requests.get(audio_url, stream=True, timeout=60)
        response.raise_for_status()

        with open(temp_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

    logger.info(f"Downloaded audio to: {temp_path}")
    return temp_path


def _call_timing_service(endpoint: str, data: Dict, timeout: int = 60) -> Dict:
    """Call internal timing service endpoint with authentication"""
    response = requests.post(
        f"{RESPONSE_TIMING_SERVICE_URL}{endpoint}",
        json=data,
        headers={'X-Internal-Token': INTERNAL_SERVICE_TOKEN},
        timeout=timeout
    )
    response.raise_for_status()
    return response.json()


def _cleanup_temp_files(paths: list):
    """Clean up temporary files"""
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp file {path}: {e}")


def _notify_high_risk(session_id: Optional[str], question_id: str, result: Dict):
    """Send notification for high-risk timing analysis"""
    if not session_id:
        return

    try:
        from celery_app import app

        app.send_task(
            'tasks.security.alert',
            args=[{
                'session_id': session_id,
                'event_type': 'high_risk_timing',
                'severity': 'medium',
                'data': {
                    'question_id': question_id,
                    'risk_score': result.get('risk_score'),
                    'anomalies': result.get('anomalies', {}),
                },
            }],
            exchange='security_events',
        )

        logger.info(f"High-risk timing notification sent: question={question_id}")

    except Exception as e:
        logger.error(f"Failed to send high-risk notification: {e}")
