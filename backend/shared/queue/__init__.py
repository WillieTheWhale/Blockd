"""
Blockd Message Queue Package
Provides RabbitMQ publisher and Celery consumer functionality
"""

from .publisher import (
    RabbitMQPublisher,
    publish_video_task,
    publish_ai_task,
    publish_security_event,
    publish_gaze_task
)

from .consumer import (
    celery_app,
    encode_video,
    generate_thumbnail,
    upload_video,
    analyze_answer,
    generate_embedding,
    warmup_cache,
    process_security_alert,
    log_security_event,
    process_gaze_data,
    detect_gaze_anomaly
)

__version__ = "1.0.0"

__all__ = [
    # Publisher
    "RabbitMQPublisher",
    "publish_video_task",
    "publish_ai_task",
    "publish_security_event",
    "publish_gaze_task",

    # Consumer
    "celery_app",
    "encode_video",
    "generate_thumbnail",
    "upload_video",
    "analyze_answer",
    "generate_embedding",
    "warmup_cache",
    "process_security_alert",
    "log_security_event",
    "process_gaze_data",
    "detect_gaze_anomaly",
]
