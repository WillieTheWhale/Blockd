"""
Celery Consumer for Blockd Platform
Defines Celery tasks and worker configuration for async job processing
"""

import logging
import time
from typing import Dict, Any, Optional
from datetime import datetime
import json

from celery import Celery, Task
from celery.signals import worker_ready, worker_shutdown, task_prerun, task_postrun
from kombu import Exchange, Queue

logger = logging.getLogger(__name__)

# Celery app configuration
celery_app = Celery(
    'blockd',
    broker='pyamqp://blockd_user:blockd_password_change_in_production@localhost:5672/blockd',
    backend='redis://localhost:6379/0'
)

# Celery configuration
celery_app.conf.update(
    # Serialization
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,

    # Task execution
    task_acks_late=True,  # Acknowledge after task completion
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3300,  # 55 minutes soft limit

    # Result backend
    result_expires=86400,  # 24 hours
    result_backend_transport_options={'master_name': 'blockd'},

    # Worker configuration
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
    worker_disable_rate_limits=False,

    # Broker connection
    broker_connection_retry=True,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
    broker_pool_limit=10,

    # Task retries
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,

    # Performance
    task_compression='gzip',
    result_compression='gzip',

    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
)

# Define exchanges
video_exchange = Exchange('video_processing', type='topic', durable=True)
ai_exchange = Exchange('ai_detection', type='topic', durable=True)
security_exchange = Exchange('security_events', type='fanout', durable=True)
gaze_exchange = Exchange('gaze_analysis', type='topic', durable=True)

# Define queues with routing
celery_app.conf.task_queues = (
    # Video processing queues
    Queue('video_encode', exchange=video_exchange, routing_key='video.encode.*'),
    Queue('video_thumbnail', exchange=video_exchange, routing_key='video.thumbnail.*'),
    Queue('video_upload', exchange=video_exchange, routing_key='video.upload.*'),

    # AI detection queues
    Queue('ai_analyze', exchange=ai_exchange, routing_key='ai.analyze.*'),
    Queue('embedding_generate', exchange=ai_exchange, routing_key='ai.embedding.*'),
    Queue('cache_warmup', exchange=ai_exchange, routing_key='ai.cache.*'),

    # Security queues
    Queue('security_alert', exchange=security_exchange),
    Queue('security_log', exchange=security_exchange),

    # Gaze analysis queues
    Queue('gaze_process', exchange=gaze_exchange, routing_key='gaze.process.*'),
    Queue('anomaly_detect', exchange=gaze_exchange, routing_key='gaze.anomaly.*'),
)

# Task routing
celery_app.conf.task_routes = {
    'tasks.video.encode': {'queue': 'video_encode'},
    'tasks.video.thumbnail': {'queue': 'video_thumbnail'},
    'tasks.video.upload': {'queue': 'video_upload'},
    'tasks.ai.analyze': {'queue': 'ai_analyze'},
    'tasks.ai.embedding': {'queue': 'embedding_generate'},
    'tasks.ai.cache': {'queue': 'cache_warmup'},
    'tasks.security.alert': {'queue': 'security_alert'},
    'tasks.security.log': {'queue': 'security_log'},
    'tasks.gaze.process': {'queue': 'gaze_process'},
    'tasks.gaze.anomaly': {'queue': 'anomaly_detect'},
}


class BlockdTask(Task):
    """
    Base task class with custom error handling and retry logic
    """
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        logger.error(
            f"Task {self.name} [{task_id}] failed: {exc}",
            extra={
                'task_id': task_id,
                'task_name': self.name,
                'args': args,
                'kwargs': kwargs,
                'exception': str(exc)
            }
        )

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """Handle task retry"""
        logger.warning(
            f"Task {self.name} [{task_id}] retrying: {exc}",
            extra={
                'task_id': task_id,
                'task_name': self.name,
                'retry_count': self.request.retries
            }
        )

    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success"""
        logger.info(
            f"Task {self.name} [{task_id}] completed successfully",
            extra={
                'task_id': task_id,
                'task_name': self.name,
                'result': retval
            }
        )


# ==================== VIDEO PROCESSING TASKS ====================

@celery_app.task(base=BlockdTask, name='tasks.video.encode', bind=True)
def encode_video(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Encode video using FFmpeg

    Args:
        data: Video encoding parameters

    Returns:
        Encoding results
    """
    logger.info(f"Encoding video: {data.get('video_id')}")

    try:
        video_id = data['video_id']
        quality = data.get('quality', '1080p')
        codec = data.get('codec', 'h264')

        # Simulate video encoding
        time.sleep(2)

        result = {
            'video_id': video_id,
            'status': 'encoded',
            'quality': quality,
            'codec': codec,
            'output_path': f'/videos/encoded/{video_id}_{quality}.mp4',
            'duration': 120.5,
            'file_size': 52428800,  # 50 MB
            'timestamp': datetime.utcnow().isoformat()
        }

        logger.info(f"Video {video_id} encoded successfully")
        return result

    except Exception as e:
        logger.error(f"Video encoding failed: {str(e)}")
        raise


@celery_app.task(base=BlockdTask, name='tasks.video.thumbnail', bind=True)
def generate_thumbnail(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate video thumbnail

    Args:
        data: Thumbnail generation parameters

    Returns:
        Thumbnail results
    """
    logger.info(f"Generating thumbnail: {data.get('video_id')}")

    try:
        video_id = data['video_id']
        timestamp = data.get('timestamp', 0)

        # Simulate thumbnail generation
        time.sleep(0.5)

        result = {
            'video_id': video_id,
            'status': 'generated',
            'thumbnail_path': f'/videos/thumbnails/{video_id}_thumb.jpg',
            'timestamp': timestamp,
            'width': 1920,
            'height': 1080
        }

        return result

    except Exception as e:
        logger.error(f"Thumbnail generation failed: {str(e)}")
        raise


@celery_app.task(base=BlockdTask, name='tasks.video.upload', bind=True)
def upload_video(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Upload video to S3/cloud storage

    Args:
        data: Upload parameters

    Returns:
        Upload results
    """
    logger.info(f"Uploading video: {data.get('video_id')}")

    try:
        video_id = data['video_id']
        file_path = data['file_path']

        # Simulate upload
        time.sleep(1.5)

        result = {
            'video_id': video_id,
            'status': 'uploaded',
            'url': f'https://cdn.blockd.com/videos/{video_id}.mp4',
            'cdn_url': f'https://cdn.blockd.com/videos/{video_id}.mp4',
            'file_path': file_path
        }

        return result

    except Exception as e:
        logger.error(f"Video upload failed: {str(e)}")
        raise


# ==================== AI DETECTION TASKS ====================

@celery_app.task(base=BlockdTask, name='tasks.ai.analyze', bind=True)
def analyze_answer(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze answer for AI detection

    Args:
        data: Answer analysis parameters

    Returns:
        Analysis results
    """
    logger.info(f"Analyzing answer: {data.get('exam_id')}")

    try:
        exam_id = data['exam_id']
        answer_id = data.get('answer_id')
        text = data.get('text', '')

        # Simulate AI analysis
        time.sleep(1)

        result = {
            'exam_id': exam_id,
            'answer_id': answer_id,
            'status': 'analyzed',
            'ai_probability': 0.35,
            'confidence': 0.89,
            'flags': ['unusual_pattern', 'high_complexity'],
            'timestamp': datetime.utcnow().isoformat()
        }

        return result

    except Exception as e:
        logger.error(f"Answer analysis failed: {str(e)}")
        raise


@celery_app.task(base=BlockdTask, name='tasks.ai.embedding', bind=True)
def generate_embedding(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate text embedding for similarity search

    Args:
        data: Embedding generation parameters

    Returns:
        Embedding results
    """
    logger.info(f"Generating embedding: {data.get('exam_id')}")

    try:
        exam_id = data['exam_id']
        text = data.get('text', '')

        # Simulate embedding generation
        time.sleep(0.8)

        # Fake 768-dimensional embedding
        embedding = [0.1] * 768

        result = {
            'exam_id': exam_id,
            'status': 'generated',
            'embedding': embedding,
            'dimension': 768,
            'model': 'sentence-transformers/all-mpnet-base-v2'
        }

        return result

    except Exception as e:
        logger.error(f"Embedding generation failed: {str(e)}")
        raise


@celery_app.task(base=BlockdTask, name='tasks.ai.cache', bind=True)
def warmup_cache(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Pre-populate cache with frequently accessed data

    Args:
        data: Cache warmup parameters

    Returns:
        Cache warmup results
    """
    logger.info(f"Warming up cache: {data.get('cache_key')}")

    try:
        cache_key = data.get('cache_key')

        # Simulate cache warmup
        time.sleep(0.3)

        result = {
            'cache_key': cache_key,
            'status': 'warmed',
            'items_cached': 150,
            'timestamp': datetime.utcnow().isoformat()
        }

        return result

    except Exception as e:
        logger.error(f"Cache warmup failed: {str(e)}")
        raise


# ==================== SECURITY TASKS ====================

@celery_app.task(base=BlockdTask, name='tasks.security.alert', bind=True)
def process_security_alert(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process security alert in real-time

    Args:
        data: Security alert data

    Returns:
        Alert processing results
    """
    logger.warning(f"Security alert: {data.get('event_type')}")

    try:
        event_type = data['event_type']
        severity = data.get('severity', 'info')

        # Process alert (send notifications, update dashboard, etc.)
        time.sleep(0.2)

        result = {
            'event_type': event_type,
            'severity': severity,
            'status': 'processed',
            'actions_taken': ['notification_sent', 'dashboard_updated'],
            'timestamp': datetime.utcnow().isoformat()
        }

        return result

    except Exception as e:
        logger.error(f"Security alert processing failed: {str(e)}")
        raise


@celery_app.task(base=BlockdTask, name='tasks.security.log', bind=True)
def log_security_event(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Log security event for audit trail

    Args:
        data: Security event data

    Returns:
        Logging results
    """
    logger.info(f"Logging security event: {data.get('event_type')}")

    try:
        event_type = data['event_type']

        # Log to database/file
        time.sleep(0.1)

        result = {
            'event_type': event_type,
            'status': 'logged',
            'log_id': f"log_{int(time.time())}",
            'timestamp': datetime.utcnow().isoformat()
        }

        return result

    except Exception as e:
        logger.error(f"Security logging failed: {str(e)}")
        raise


# ==================== GAZE ANALYSIS TASKS ====================

@celery_app.task(base=BlockdTask, name='tasks.gaze.process', bind=True)
def process_gaze_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process eye tracking data

    Args:
        data: Gaze processing parameters

    Returns:
        Processing results
    """
    logger.info(f"Processing gaze data: {data.get('session_id')}")

    try:
        session_id = data['session_id']
        gaze_data = data.get('gaze_data', [])

        # Simulate gaze processing
        time.sleep(0.5)

        result = {
            'session_id': session_id,
            'status': 'processed',
            'points_processed': len(gaze_data),
            'average_fixation': 250,  # ms
            'off_screen_percentage': 5.2,
            'timestamp': datetime.utcnow().isoformat()
        }

        return result

    except Exception as e:
        logger.error(f"Gaze processing failed: {str(e)}")
        raise


@celery_app.task(base=BlockdTask, name='tasks.gaze.anomaly', bind=True)
def detect_gaze_anomaly(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Detect anomalies in gaze patterns

    Args:
        data: Anomaly detection parameters

    Returns:
        Detection results
    """
    logger.info(f"Detecting gaze anomalies: {data.get('session_id')}")

    try:
        session_id = data['session_id']

        # Simulate anomaly detection
        time.sleep(0.7)

        result = {
            'session_id': session_id,
            'status': 'analyzed',
            'anomalies_detected': 2,
            'anomaly_types': ['prolonged_off_screen', 'irregular_pattern'],
            'risk_score': 0.68,
            'timestamp': datetime.utcnow().isoformat()
        }

        return result

    except Exception as e:
        logger.error(f"Gaze anomaly detection failed: {str(e)}")
        raise


# ==================== CELERY SIGNALS ====================

@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """Called when worker is ready to receive tasks"""
    logger.info(f"Celery worker {sender} is ready")


@worker_shutdown.connect
def on_worker_shutdown(sender, **kwargs):
    """Called when worker is shutting down"""
    logger.info(f"Celery worker {sender} is shutting down")


@task_prerun.connect
def on_task_prerun(sender, task_id, task, **kwargs):
    """Called before task execution"""
    logger.debug(f"Starting task {task.name} [{task_id}]")


@task_postrun.connect
def on_task_postrun(sender, task_id, task, **kwargs):
    """Called after task execution"""
    logger.debug(f"Completed task {task.name} [{task_id}]")


if __name__ == '__main__':
    # Start worker with logging
    logging.basicConfig(level=logging.INFO)
    celery_app.start()
