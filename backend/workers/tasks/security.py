"""
Security Event Tasks
Handles security alerts, logging, and notifications
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from celery import shared_task
import requests
import redis

logger = logging.getLogger(__name__)

# Service URLs
SESSION_SERVICE_URL = os.getenv('SESSION_SERVICE_URL', 'http://session-service:3002')
WEBSOCKET_SERVICE_URL = os.getenv('WEBSOCKET_SERVICE_URL', 'http://websocket-service:3007')

# Redis configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))

# Notification settings
SLACK_WEBHOOK_URL = os.getenv('SLACK_WEBHOOK_URL', '')
PAGERDUTY_ROUTING_KEY = os.getenv('PAGERDUTY_ROUTING_KEY', '')


def get_redis_client():
    """Get configured Redis client"""
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=0,
        decode_responses=True,
    )


@shared_task(
    name='tasks.security.alert',
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=10,
    time_limit=15,
)
def alert(
    self,
    event: Dict[str, Any],
    **kwargs
) -> Dict[str, Any]:
    """
    Process security alert and send notifications.

    Args:
        event: Security event data containing:
            - session_id: Interview session ID
            - event_type: Type of security event
            - severity: Event severity (low, medium, high, critical)
            - data: Additional event data

    Returns:
        Dict with alert processing status
    """
    session_id = event.get('session_id')
    event_type = event.get('event_type')
    severity = event.get('severity', 'medium')
    data = event.get('data', {})

    logger.info(f"Processing security alert: session={session_id}, type={event_type}, severity={severity}")

    try:
        # Send real-time notification via WebSocket
        _send_websocket_notification(session_id, event)

        # Update session risk score
        _update_risk_score(session_id, severity)

        # Send external notifications for high/critical severity
        if severity in ('high', 'critical'):
            _send_external_notifications(event)

        # Store alert in Redis for real-time dashboard
        _cache_alert(session_id, event)

        logger.info(f"Security alert processed: session={session_id}, type={event_type}")

        return {
            'session_id': session_id,
            'event_type': event_type,
            'severity': severity,
            'notified': True,
            'status': 'success',
        }

    except Exception as e:
        logger.error(f"Security alert processing failed: {e}")
        raise


@shared_task(
    name='tasks.security.log',
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
    soft_time_limit=30,
    time_limit=45,
)
def log(
    self,
    event: Dict[str, Any],
    **kwargs
) -> Dict[str, Any]:
    """
    Log security event for audit trail.

    Args:
        event: Security event data to log

    Returns:
        Dict with logging status
    """
    session_id = event.get('session_id')
    event_type = event.get('event_type')
    severity = event.get('severity', 'medium')
    data = event.get('data', {})
    timestamp = event.get('timestamp', datetime.utcnow().isoformat())

    logger.info(f"Logging security event: session={session_id}, type={event_type}")

    try:
        # Store in session-service (which persists to PostgreSQL/TimescaleDB)
        response = requests.post(
            f"{SESSION_SERVICE_URL}/sessions/{session_id}/security-events",
            json={
                'event_type': event_type,
                'severity': severity,
                'description': event.get('description', ''),
                'metadata': {
                    **data,
                    'logged_at': timestamp,
                    'source': 'celery_worker',
                },
            },
            timeout=10,
        )
        response.raise_for_status()
        log_result = response.json()

        logger.info(f"Security event logged: session={session_id}, event_id={log_result.get('id')}")

        return {
            'session_id': session_id,
            'event_id': log_result.get('id'),
            'event_type': event_type,
            'logged': True,
            'status': 'success',
        }

    except requests.RequestException as e:
        logger.error(f"Security event logging failed: {e}")
        raise


def _send_websocket_notification(session_id: str, event: Dict[str, Any]):
    """Send real-time notification via WebSocket service"""
    try:
        response = requests.post(
            f"{WEBSOCKET_SERVICE_URL}/notify",
            json={
                'session_id': session_id,
                'event': 'security_alert',
                'data': {
                    'type': event.get('event_type'),
                    'severity': event.get('severity'),
                    'timestamp': datetime.utcnow().isoformat(),
                    'details': event.get('data', {}),
                },
            },
            timeout=5,
        )
        response.raise_for_status()
        logger.debug(f"WebSocket notification sent: session={session_id}")
    except requests.RequestException as e:
        logger.warning(f"Failed to send WebSocket notification: {e}")


def _update_risk_score(session_id: str, severity: str):
    """Update session risk score based on event severity"""
    severity_weights = {
        'low': 0.05,
        'medium': 0.1,
        'high': 0.2,
        'critical': 0.3,
    }

    weight = severity_weights.get(severity, 0.1)

    try:
        # Get current risk score
        response = requests.get(
            f"{SESSION_SERVICE_URL}/sessions/{session_id}",
            timeout=5,
        )
        response.raise_for_status()
        session = response.json()

        current_score = session.get('risk_score', 0.0) or 0.0
        new_score = min(1.0, current_score + weight)

        # Update risk score
        requests.patch(
            f"{SESSION_SERVICE_URL}/sessions/{session_id}",
            json={'risk_score': new_score},
            timeout=5,
        )

        logger.debug(f"Risk score updated: session={session_id}, score={new_score}")

    except requests.RequestException as e:
        logger.warning(f"Failed to update risk score: {e}")


def _send_external_notifications(event: Dict[str, Any]):
    """Send notifications to external services (Slack, PagerDuty)"""
    session_id = event.get('session_id')
    event_type = event.get('event_type')
    severity = event.get('severity')

    # Slack notification
    if SLACK_WEBHOOK_URL:
        try:
            color = 'danger' if severity == 'critical' else 'warning'
            requests.post(
                SLACK_WEBHOOK_URL,
                json={
                    'attachments': [{
                        'color': color,
                        'title': f'Security Alert: {event_type}',
                        'text': f'Session: {session_id}\nSeverity: {severity}',
                        'fields': [
                            {'title': 'Session ID', 'value': session_id, 'short': True},
                            {'title': 'Severity', 'value': severity.upper(), 'short': True},
                        ],
                        'ts': datetime.utcnow().timestamp(),
                    }],
                },
                timeout=5,
            )
            logger.debug("Slack notification sent")
        except requests.RequestException as e:
            logger.warning(f"Failed to send Slack notification: {e}")

    # PagerDuty notification (critical only)
    if severity == 'critical' and PAGERDUTY_ROUTING_KEY:
        try:
            requests.post(
                'https://events.pagerduty.com/v2/enqueue',
                json={
                    'routing_key': PAGERDUTY_ROUTING_KEY,
                    'event_action': 'trigger',
                    'dedup_key': f'{session_id}:{event_type}',
                    'payload': {
                        'summary': f'Critical security event: {event_type}',
                        'severity': 'critical',
                        'source': 'blockd-security',
                        'custom_details': {
                            'session_id': session_id,
                            'event_type': event_type,
                            'data': event.get('data', {}),
                        },
                    },
                },
                timeout=5,
            )
            logger.debug("PagerDuty notification sent")
        except requests.RequestException as e:
            logger.warning(f"Failed to send PagerDuty notification: {e}")


def _cache_alert(session_id: str, event: Dict[str, Any]):
    """Cache alert in Redis for real-time dashboard"""
    try:
        redis_client = get_redis_client()
        cache_key = f"security_alerts:{session_id}"

        alert_data = json.dumps({
            'event_type': event.get('event_type'),
            'severity': event.get('severity'),
            'timestamp': datetime.utcnow().isoformat(),
            'data': event.get('data', {}),
        })

        # Store in sorted set by timestamp
        redis_client.zadd(
            cache_key,
            {alert_data: datetime.utcnow().timestamp()},
        )

        # Keep only last 100 alerts
        redis_client.zremrangebyrank(cache_key, 0, -101)

        # Set expiration
        redis_client.expire(cache_key, 86400)  # 24 hours

    except redis.RedisError as e:
        logger.warning(f"Failed to cache alert: {e}")
