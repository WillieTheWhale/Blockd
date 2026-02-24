"""
Pytest configuration and fixtures for Celery workers tests
"""
import pytest
import os
from datetime import datetime
from unittest.mock import Mock, AsyncMock, patch


@pytest.fixture(scope="session", autouse=True)
def test_config():
    """Set test environment variables"""
    os.environ["ENV"] = "test"
    os.environ["RABBITMQ_HOST"] = "localhost"
    os.environ["RABBITMQ_PORT"] = "5672"
    os.environ["RABBITMQ_USER"] = "test_user"
    os.environ["RABBITMQ_PASS"] = "test_pass"
    os.environ["RABBITMQ_VHOST"] = "test"
    os.environ["REDIS_HOST"] = "localhost"
    os.environ["REDIS_PORT"] = "6379"
    os.environ["REDIS_DB"] = "0"


@pytest.fixture
def sample_gaze_data():
    """Sample gaze data for testing"""
    return [
        {
            'timestamp': datetime.utcnow().isoformat(),
            'gaze_x': 0.5,
            'gaze_y': 0.5,
            'confidence': 0.95,
            'is_off_screen': False,
        },
        {
            'timestamp': datetime.utcnow().isoformat(),
            'gaze_x': 0.51,
            'gaze_y': 0.49,
            'confidence': 0.92,
            'is_off_screen': False,
        },
        {
            'timestamp': datetime.utcnow().isoformat(),
            'gaze_x': 0.52,
            'gaze_y': 0.48,
            'confidence': 0.94,
            'is_off_screen': False,
        },
    ]


@pytest.fixture
def sample_anomaly_data():
    """Sample anomaly data for testing"""
    return {
        'type': 'high_off_screen',
        'ratio': 0.25,
        'events': [
            {'timestamp': '2024-01-01T00:00:00', 'direction': 'left'},
            {'timestamp': '2024-01-01T00:00:01', 'direction': 'right'},
        ]
    }


@pytest.fixture
def mock_redis_client():
    """Mock Redis client"""
    client = Mock()
    client.setex = Mock()
    client.get = Mock(return_value=None)
    return client


@pytest.fixture
def mock_requests():
    """Mock requests module"""
    with patch('requests.post') as mock_post:
        with patch('requests.get') as mock_get:
            mock_post.return_value = Mock(status_code=200)
            mock_post.return_value.raise_for_status = Mock()
            mock_get.return_value = Mock(status_code=200)
            mock_get.return_value.json = Mock(return_value={})
            mock_get.return_value.raise_for_status = Mock()
            yield {'post': mock_post, 'get': mock_get}
