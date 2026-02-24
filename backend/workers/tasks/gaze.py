"""
Gaze Analysis Tasks
Handles gaze data processing and anomaly detection
"""

import os
import json
import logging
import hashlib
from datetime import datetime
from typing import Dict, Any, List, Optional
from celery import shared_task
import requests
import numpy as np
import redis

logger = logging.getLogger(__name__)

# Redis configuration for large data storage
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '0'))
GAZE_DATA_TTL = int(os.getenv('GAZE_DATA_TTL', '3600'))  # 1 hour default TTL

def get_redis_client():
    """Get configured Redis client"""
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
    )


def store_gaze_data(session_id: str, gaze_data: List[Dict[str, Any]]) -> str:
    """
    Store large gaze data in Redis and return a reference key.

    Args:
        session_id: Interview session ID
        gaze_data: List of gaze data points

    Returns:
        Reference key to retrieve the data
    """
    # Generate unique key based on session and content hash
    data_json = json.dumps(gaze_data, sort_keys=True)
    content_hash = hashlib.sha256(data_json.encode()).hexdigest()[:16]
    reference_key = f"gaze_data:{session_id}:{content_hash}"

    client = get_redis_client()
    client.setex(reference_key, GAZE_DATA_TTL, data_json)

    return reference_key


def retrieve_gaze_data(reference_key: str) -> Optional[List[Dict[str, Any]]]:
    """
    Retrieve gaze data from Redis using reference key.

    Args:
        reference_key: Key returned from store_gaze_data

    Returns:
        List of gaze data points or None if not found
    """
    client = get_redis_client()
    data_json = client.get(reference_key)

    if data_json:
        return json.loads(data_json)
    return None

# Service URLs
EYE_TRACKING_SERVICE_URL = os.getenv('EYE_TRACKING_SERVICE_URL', 'http://eye-tracking:3004')
SESSION_SERVICE_URL = os.getenv('SESSION_SERVICE_URL', 'http://session-service:3002')

# Anomaly detection thresholds
OFF_SCREEN_THRESHOLD = float(os.getenv('OFF_SCREEN_THRESHOLD', '0.2'))  # 20% of time
RAPID_MOVEMENT_THRESHOLD = float(os.getenv('RAPID_MOVEMENT_THRESHOLD', '500'))  # pixels/second
FIXATION_MIN_DURATION = float(os.getenv('FIXATION_MIN_DURATION', '0.1'))  # 100ms


@shared_task(
    name='tasks.gaze.process',
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=30,
    time_limit=45,
)
def process(
    self,
    session_id: str,
    gaze_data_ref: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Process batch of gaze data points.

    Args:
        session_id: Interview session ID
        gaze_data_ref: Reference key to gaze data stored in Redis
            The actual gaze data contains:
            - timestamp: ISO timestamp
            - gaze_x: X coordinate (0-1)
            - gaze_y: Y coordinate (0-1)
            - confidence: Detection confidence (0-1)

    Returns:
        Dict with processing results
    """
    # Retrieve gaze data from Redis using reference key
    gaze_data = retrieve_gaze_data(gaze_data_ref)
    if gaze_data is None:
        logger.error(f"Gaze data not found for reference: {gaze_data_ref}")
        return {
            'session_id': session_id,
            'status': 'error',
            'error': 'Gaze data not found or expired',
        }

    logger.info(f"Processing gaze data: session={session_id}, points={len(gaze_data)}")

    try:
        # Calculate fixations and saccades
        fixations = _calculate_fixations(gaze_data)
        saccades = _calculate_saccades(gaze_data)

        # Calculate off-screen events
        off_screen_events = _detect_off_screen(gaze_data)

        # Generate heatmap data
        heatmap = _generate_heatmap(gaze_data)

        # Store processed data
        response = requests.post(
            f"{EYE_TRACKING_SERVICE_URL}/gaze/batch",
            json={
                'session_id': session_id,
                'gaze_data': gaze_data,
                'fixations': fixations,
                'saccades': saccades,
                'off_screen_events': off_screen_events,
                'heatmap': heatmap,
            },
            timeout=15,
        )
        response.raise_for_status()

        # Check for anomalies and trigger detection
        off_screen_ratio = len(off_screen_events) / max(len(gaze_data), 1)
        if off_screen_ratio > OFF_SCREEN_THRESHOLD:
            # Trigger anomaly detection
            from celery_app import app
            app.send_task(
                'tasks.gaze.anomaly',
                args=[session_id, {
                    'type': 'high_off_screen',
                    'ratio': off_screen_ratio,
                    'events': off_screen_events[:10],  # First 10 events
                }],
                routing_key=f'gaze.anomaly.{session_id}',
                exchange='gaze_analysis',
            )

        logger.info(f"Gaze processing complete: session={session_id}, "
                   f"fixations={len(fixations)}, saccades={len(saccades)}, "
                   f"off_screen={len(off_screen_events)}")

        return {
            'session_id': session_id,
            'points_processed': len(gaze_data),
            'fixations_count': len(fixations),
            'saccades_count': len(saccades),
            'off_screen_count': len(off_screen_events),
            'status': 'success',
        }

    except requests.RequestException as e:
        logger.error(f"Gaze processing failed: {e}")
        raise


@shared_task(
    name='tasks.gaze.anomaly',
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=30,
    time_limit=45,
)
def anomaly(
    self,
    session_id: str,
    anomaly_data: Dict[str, Any],
    **kwargs
) -> Dict[str, Any]:
    """
    Detect and handle gaze anomalies.

    Args:
        session_id: Interview session ID
        anomaly_data: Anomaly information containing:
            - type: Anomaly type
            - ratio: Metric value
            - events: Related events

    Returns:
        Dict with anomaly detection results
    """
    anomaly_type = anomaly_data.get('type')
    ratio = anomaly_data.get('ratio', 0)
    events = anomaly_data.get('events', [])

    logger.info(f"Processing gaze anomaly: session={session_id}, type={anomaly_type}")

    try:
        # Determine severity based on anomaly type and metrics
        severity = _determine_severity(anomaly_type, ratio)

        # Get additional context from eye-tracking service
        response = requests.get(
            f"{EYE_TRACKING_SERVICE_URL}/gaze/analysis/{session_id}",
            timeout=10,
        )
        response.raise_for_status()
        analysis = response.json()

        # Calculate risk contribution
        risk_contribution = _calculate_risk_contribution(anomaly_type, ratio, analysis)

        # Create security event if severity is high enough
        if severity in ('medium', 'high', 'critical'):
            from celery_app import app

            app.send_task(
                'tasks.security.alert',
                args=[{
                    'session_id': session_id,
                    'event_type': f'gaze_{anomaly_type}',
                    'severity': severity,
                    'data': {
                        'anomaly_type': anomaly_type,
                        'ratio': ratio,
                        'risk_contribution': risk_contribution,
                        'sample_events': events[:5],
                    },
                }],
                exchange='security_events',
            )

        # Store anomaly detection result
        response = requests.post(
            f"{EYE_TRACKING_SERVICE_URL}/gaze/anomalies",
            json={
                'session_id': session_id,
                'anomaly_type': anomaly_type,
                'severity': severity,
                'ratio': ratio,
                'risk_contribution': risk_contribution,
                'events': events,
            },
            timeout=10,
        )
        response.raise_for_status()

        logger.info(f"Anomaly detection complete: session={session_id}, "
                   f"type={anomaly_type}, severity={severity}")

        return {
            'session_id': session_id,
            'anomaly_type': anomaly_type,
            'severity': severity,
            'risk_contribution': risk_contribution,
            'status': 'success',
        }

    except requests.RequestException as e:
        logger.error(f"Anomaly detection failed: {e}")
        raise


def _calculate_fixations(gaze_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Calculate fixation points from gaze data"""
    fixations = []
    current_fixation = None

    for i, point in enumerate(gaze_data):
        if i == 0:
            current_fixation = {
                'start_time': point['timestamp'],
                'x': point['gaze_x'],
                'y': point['gaze_y'],
                'points': [point],
            }
            continue

        # Check if point is within fixation threshold
        dx = abs(point['gaze_x'] - current_fixation['x'])
        dy = abs(point['gaze_y'] - current_fixation['y'])
        distance = np.sqrt(dx**2 + dy**2)

        if distance < 0.03:  # 3% of screen
            current_fixation['points'].append(point)
        else:
            # End current fixation if long enough
            if len(current_fixation['points']) >= 3:
                current_fixation['end_time'] = current_fixation['points'][-1]['timestamp']
                current_fixation['duration'] = len(current_fixation['points'])
                current_fixation['centroid_x'] = np.mean([p['gaze_x'] for p in current_fixation['points']])
                current_fixation['centroid_y'] = np.mean([p['gaze_y'] for p in current_fixation['points']])
                del current_fixation['points']
                fixations.append(current_fixation)

            # Start new fixation
            current_fixation = {
                'start_time': point['timestamp'],
                'x': point['gaze_x'],
                'y': point['gaze_y'],
                'points': [point],
            }

    return fixations


def _calculate_saccades(gaze_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Calculate saccadic movements from gaze data"""
    saccades = []

    for i in range(1, len(gaze_data)):
        prev = gaze_data[i - 1]
        curr = gaze_data[i]

        dx = curr['gaze_x'] - prev['gaze_x']
        dy = curr['gaze_y'] - prev['gaze_y']
        distance = np.sqrt(dx**2 + dy**2)

        # Saccade if movement > 5% of screen
        if distance > 0.05:
            saccades.append({
                'start_time': prev['timestamp'],
                'end_time': curr['timestamp'],
                'start_x': prev['gaze_x'],
                'start_y': prev['gaze_y'],
                'end_x': curr['gaze_x'],
                'end_y': curr['gaze_y'],
                'distance': distance,
            })

    return saccades


def _detect_off_screen(gaze_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect off-screen gaze events"""
    off_screen_events = []

    for point in gaze_data:
        if point.get('is_off_screen', False):
            off_screen_events.append({
                'timestamp': point['timestamp'],
                'direction': point.get('off_screen_direction', 'unknown'),
                'confidence': point.get('confidence', 0),
            })

    return off_screen_events


def _generate_heatmap(gaze_data: List[Dict[str, Any]], resolution: int = 50) -> Dict[str, Any]:
    """Generate heatmap from gaze data"""
    heatmap = np.zeros((resolution, resolution))

    for point in gaze_data:
        x = int(point['gaze_x'] * (resolution - 1))
        y = int(point['gaze_y'] * (resolution - 1))

        # Clamp to valid range
        x = max(0, min(resolution - 1, x))
        y = max(0, min(resolution - 1, y))

        heatmap[y, x] += 1

    # Normalize
    max_val = heatmap.max()
    if max_val > 0:
        heatmap = heatmap / max_val

    return {
        'data': heatmap.tolist(),
        'resolution': resolution,
        'max_value': float(max_val),
    }


def _determine_severity(anomaly_type: str, ratio: float) -> str:
    """Determine severity based on anomaly type and metrics"""
    if anomaly_type == 'high_off_screen':
        if ratio > 0.5:
            return 'critical'
        elif ratio > 0.3:
            return 'high'
        elif ratio > 0.2:
            return 'medium'
        return 'low'

    elif anomaly_type == 'rapid_movement':
        if ratio > 800:
            return 'high'
        elif ratio > 500:
            return 'medium'
        return 'low'

    elif anomaly_type == 'reading_pattern':
        if ratio > 0.7:
            return 'high'
        elif ratio > 0.5:
            return 'medium'
        return 'low'

    return 'medium'


def _calculate_risk_contribution(
    anomaly_type: str,
    ratio: float,
    analysis: Dict[str, Any]
) -> float:
    """Calculate risk score contribution from anomaly"""
    base_weights = {
        'high_off_screen': 0.3,
        'rapid_movement': 0.1,
        'reading_pattern': 0.2,
        'irregular_pattern': 0.15,
    }

    base_weight = base_weights.get(anomaly_type, 0.1)

    # Adjust based on ratio/severity
    multiplier = min(2.0, 1.0 + ratio)

    return min(1.0, base_weight * multiplier)
