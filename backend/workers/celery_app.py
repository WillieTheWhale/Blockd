"""
Celery Application Configuration for Blockd Platform
Central configuration for all background task workers
"""

import os
from celery import Celery
from kombu import Queue, Exchange

# Dead Letter Exchange/Queue configuration
DEAD_LETTER_EXCHANGE = 'dlx'
DEAD_LETTER_QUEUE = 'dead_letter_queue'

# Common DLQ arguments for queues
DLQ_ARGUMENTS = {
    'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
    'x-dead-letter-routing-key': 'dead_letter',
}

# RabbitMQ connection settings
RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'rabbitmq')
RABBITMQ_PORT = os.getenv('RABBITMQ_PORT', '5672')
RABBITMQ_USER = os.environ['RABBITMQ_USER']  # Required - no default for security
RABBITMQ_PASS = os.environ['RABBITMQ_PASS']  # Required - no default for security
RABBITMQ_VHOST = os.getenv('RABBITMQ_VHOST', 'blockd')

# Redis for result backend
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = os.getenv('REDIS_PORT', '6379')
REDIS_DB = os.getenv('REDIS_DB', '1')

# Broker URL
broker_url = f'amqp://{RABBITMQ_USER}:{RABBITMQ_PASS}@{RABBITMQ_HOST}:{RABBITMQ_PORT}/{RABBITMQ_VHOST}'

# Result backend URL
result_backend = f'redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}'

# Create Celery app
app = Celery('blockd')

# Configure Celery
app.conf.update(
    broker_url=broker_url,
    result_backend=result_backend,

    # Task settings
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,

    # Task acknowledgment
    task_acks_late=True,  # Acknowledge after task completion
    task_reject_on_worker_lost=True,

    # Retry settings
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,

    # Prefetch settings
    worker_prefetch_multiplier=4,

    # Result expiration
    result_expires=86400,  # 24 hours

    # Task time limits
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3000,  # 50 minutes soft limit

    # Worker settings
    worker_concurrency=4,
    worker_max_tasks_per_child=1000,  # Restart worker after 1000 tasks

    # Task routes - map tasks to specific queues
    task_routes={
        # Video processing tasks
        'tasks.video.encode': {'queue': 'video_encode'},
        'tasks.video.thumbnail': {'queue': 'video_thumbnail'},
        'tasks.video.upload': {'queue': 'video_upload'},

        # AI detection tasks
        'tasks.ai.analyze': {'queue': 'ai_analyze'},
        'tasks.ai.embedding': {'queue': 'embedding_generate'},
        'tasks.ai.cache': {'queue': 'cache_warmup'},

        # Security tasks
        'tasks.security.alert': {'queue': 'security_alert'},
        'tasks.security.log': {'queue': 'security_log'},

        # Gaze analysis tasks
        'tasks.gaze.process': {'queue': 'gaze_process'},
        'tasks.gaze.anomaly': {'queue': 'anomaly_detect'},

        # Timing analysis tasks
        'tasks.timing.analyze': {'queue': 'timing_analyze'},
    },

    # Queue configuration with Dead Letter Queue support
    task_queues=(
        # Dead Letter Queue for failed messages
        Queue(DEAD_LETTER_QUEUE, Exchange(DEAD_LETTER_EXCHANGE, type='direct'),
              routing_key='dead_letter'),

        # Video processing queues
        Queue('video_encode', Exchange('video_processing', type='topic'),
              routing_key='video.encode.*', queue_arguments=DLQ_ARGUMENTS),
        Queue('video_thumbnail', Exchange('video_processing', type='topic'),
              routing_key='video.thumbnail.*', queue_arguments=DLQ_ARGUMENTS),
        Queue('video_upload', Exchange('video_processing', type='topic'),
              routing_key='video.upload.*', queue_arguments=DLQ_ARGUMENTS),

        # AI detection queues
        Queue('ai_analyze', Exchange('ai_detection', type='topic'),
              routing_key='ai.analyze.*', queue_arguments=DLQ_ARGUMENTS),
        Queue('embedding_generate', Exchange('ai_detection', type='topic'),
              routing_key='ai.embedding.*', queue_arguments=DLQ_ARGUMENTS),
        Queue('cache_warmup', Exchange('ai_detection', type='topic'),
              routing_key='ai.cache.*', queue_arguments=DLQ_ARGUMENTS),

        # Security queues
        Queue('security_alert', Exchange('security_events', type='fanout'),
              queue_arguments=DLQ_ARGUMENTS),
        Queue('security_log', Exchange('security_events', type='fanout'),
              queue_arguments=DLQ_ARGUMENTS),

        # Gaze analysis queues
        Queue('gaze_process', Exchange('gaze_analysis', type='topic'),
              routing_key='gaze.process.*', queue_arguments=DLQ_ARGUMENTS),
        Queue('anomaly_detect', Exchange('gaze_analysis', type='topic'),
              routing_key='gaze.anomaly.*', queue_arguments=DLQ_ARGUMENTS),

        # Timing analysis queues
        Queue('timing_analyze', Exchange('timing_analysis', type='topic'),
              routing_key='timing.analyze.*', queue_arguments=DLQ_ARGUMENTS),
    ),
)

# Auto-discover tasks in the tasks package
app.autodiscover_tasks([
    'tasks.video',
    'tasks.ai',
    'tasks.security',
    'tasks.gaze',
    'tasks.timing',
])
