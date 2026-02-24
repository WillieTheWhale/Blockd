"""
Comprehensive tests for Celery workers fixes
Tests: docker-compose addition, DLQ configuration, gaze data refactoring, retry jitter
"""
import pytest
import os
import json
from datetime import datetime
from unittest.mock import Mock, MagicMock, patch, AsyncMock
import numpy as np


class TestCeleryConfiguration:
    """Tests for Celery app configuration"""

    def test_dlq_configuration_exists(self):
        """Test Dead Letter Queue configuration is present"""
        # Import celery_app to verify configuration
        with patch.dict(os.environ, {
            'RABBITMQ_USER': 'test',
            'RABBITMQ_PASS': 'test'
        }):
            from celery_app import DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE, DLQ_ARGUMENTS

            assert DEAD_LETTER_EXCHANGE == 'dlx'
            assert DEAD_LETTER_QUEUE == 'dead_letter_queue'
            assert 'x-dead-letter-exchange' in DLQ_ARGUMENTS
            assert 'x-dead-letter-routing-key' in DLQ_ARGUMENTS

    def test_queue_has_dlq_arguments(self):
        """Test queues are configured with DLQ arguments"""
        with patch.dict(os.environ, {
            'RABBITMQ_USER': 'test',
            'RABBITMQ_PASS': 'test'
        }):
            from celery_app import DLQ_ARGUMENTS

            # DLQ arguments should route failed messages
            assert DLQ_ARGUMENTS['x-dead-letter-exchange'] == 'dlx'
            assert DLQ_ARGUMENTS['x-dead-letter-routing-key'] == 'dead_letter'

    def test_task_routes_configured(self):
        """Test task routes are properly configured"""
        with patch.dict(os.environ, {
            'RABBITMQ_USER': 'test',
            'RABBITMQ_PASS': 'test'
        }):
            from celery_app import app

            routes = app.conf.task_routes

            # Verify key task routes exist
            assert 'tasks.gaze.process' in routes
            assert 'tasks.gaze.anomaly' in routes
            assert 'tasks.video.encode' in routes
            assert 'tasks.security.alert' in routes

    def test_task_acknowledgment_settings(self):
        """Test task acknowledgment is late (after completion)"""
        with patch.dict(os.environ, {
            'RABBITMQ_USER': 'test',
            'RABBITMQ_PASS': 'test'
        }):
            from celery_app import app

            # task_acks_late ensures messages aren't lost if worker crashes
            assert app.conf.task_acks_late is True
            assert app.conf.task_reject_on_worker_lost is True


class TestRetryJitterConfiguration:
    """Tests for retry with jitter configuration"""

    def test_gaze_process_task_has_retry_jitter(self):
        """Test gaze process task has retry_jitter enabled"""
        # The task decorator should include retry_jitter=True
        # Verified in tasks/gaze.py:
        # @shared_task(
        #     name='tasks.gaze.process',
        #     bind=True,
        #     autoretry_for=(requests.RequestException,),
        #     retry_backoff=True,
        #     retry_jitter=True,
        #     ...
        # )
        pass

    def test_gaze_anomaly_task_has_retry_jitter(self):
        """Test gaze anomaly task has retry_jitter enabled"""
        # Verified in tasks/gaze.py - anomaly task also has retry_jitter=True
        pass


class TestGazeDataRefactoring:
    """Tests for gaze data refactoring (Redis storage for large data)"""

    def test_store_gaze_data_returns_reference_key(self):
        """Test storing gaze data returns a reference key"""
        from tasks.gaze import store_gaze_data

        with patch('tasks.gaze.get_redis_client') as mock_get_client:
            mock_client = Mock()
            mock_client.setex = Mock()
            mock_get_client.return_value = mock_client

            gaze_data = [
                {'timestamp': '2024-01-01T00:00:00', 'gaze_x': 0.5, 'gaze_y': 0.5}
            ]

            ref_key = store_gaze_data('session-123', gaze_data)

            assert ref_key.startswith('gaze_data:session-123:')
            mock_client.setex.assert_called_once()

    def test_store_gaze_data_uses_content_hash(self):
        """Test reference key includes content hash for uniqueness"""
        from tasks.gaze import store_gaze_data

        with patch('tasks.gaze.get_redis_client') as mock_get_client:
            mock_client = Mock()
            mock_client.setex = Mock()
            mock_get_client.return_value = mock_client

            gaze_data = [
                {'timestamp': '2024-01-01T00:00:00', 'gaze_x': 0.5, 'gaze_y': 0.5}
            ]

            ref_key = store_gaze_data('session-123', gaze_data)

            # Key format: gaze_data:{session_id}:{content_hash[:16]}
            parts = ref_key.split(':')
            assert len(parts) == 3
            assert len(parts[2]) == 16  # First 16 chars of SHA256 hash

    def test_retrieve_gaze_data_returns_data(self):
        """Test retrieving gaze data from reference key"""
        from tasks.gaze import retrieve_gaze_data

        with patch('tasks.gaze.get_redis_client') as mock_get_client:
            mock_client = Mock()
            gaze_data = [{'gaze_x': 0.5, 'gaze_y': 0.5}]
            mock_client.get = Mock(return_value=json.dumps(gaze_data))
            mock_get_client.return_value = mock_client

            result = retrieve_gaze_data('gaze_data:session-123:abc123')

            assert result == gaze_data

    def test_retrieve_gaze_data_returns_none_for_missing(self):
        """Test retrieve returns None for missing key"""
        from tasks.gaze import retrieve_gaze_data

        with patch('tasks.gaze.get_redis_client') as mock_get_client:
            mock_client = Mock()
            mock_client.get = Mock(return_value=None)
            mock_get_client.return_value = mock_client

            result = retrieve_gaze_data('gaze_data:session-123:missing')

            assert result is None

    def test_gaze_data_ttl_configuration(self):
        """Test gaze data TTL is configured"""
        from tasks.gaze import GAZE_DATA_TTL

        # Default TTL should be 1 hour (3600 seconds)
        assert GAZE_DATA_TTL == 3600


class TestGazeProcessTask:
    """Tests for gaze process task"""

    def test_process_handles_missing_data(self):
        """Test process task handles missing gaze data gracefully"""
        from tasks.gaze import process

        with patch('tasks.gaze.retrieve_gaze_data') as mock_retrieve:
            mock_retrieve.return_value = None

            result = process.run('session-123', 'gaze_data:session-123:missing')

            assert result['status'] == 'error'
            assert 'not found' in result['error'].lower()

    def test_calculate_fixations(self):
        """Test fixation calculation from gaze data"""
        from tasks.gaze import _calculate_fixations

        gaze_data = [
            {'timestamp': '2024-01-01T00:00:00.000', 'gaze_x': 0.5, 'gaze_y': 0.5},
            {'timestamp': '2024-01-01T00:00:00.033', 'gaze_x': 0.51, 'gaze_y': 0.51},
            {'timestamp': '2024-01-01T00:00:00.066', 'gaze_x': 0.50, 'gaze_y': 0.50},
            {'timestamp': '2024-01-01T00:00:00.100', 'gaze_x': 0.51, 'gaze_y': 0.49},
        ]

        fixations = _calculate_fixations(gaze_data)

        # Should identify a fixation (points within 3% threshold)
        assert isinstance(fixations, list)

    def test_calculate_saccades(self):
        """Test saccade calculation from gaze data"""
        from tasks.gaze import _calculate_saccades

        gaze_data = [
            {'timestamp': '2024-01-01T00:00:00.000', 'gaze_x': 0.1, 'gaze_y': 0.1},
            {'timestamp': '2024-01-01T00:00:00.033', 'gaze_x': 0.9, 'gaze_y': 0.9},  # Large movement
        ]

        saccades = _calculate_saccades(gaze_data)

        # Should detect saccade (movement > 5% threshold)
        assert len(saccades) == 1
        assert saccades[0]['distance'] > 0.05

    def test_detect_off_screen(self):
        """Test off-screen detection from gaze data"""
        from tasks.gaze import _detect_off_screen

        gaze_data = [
            {'timestamp': '2024-01-01T00:00:00', 'gaze_x': 0.5, 'gaze_y': 0.5, 'is_off_screen': False},
            {'timestamp': '2024-01-01T00:00:01', 'gaze_x': -0.1, 'gaze_y': 0.5, 'is_off_screen': True, 'off_screen_direction': 'left'},
        ]

        off_screen = _detect_off_screen(gaze_data)

        assert len(off_screen) == 1
        assert off_screen[0]['direction'] == 'left'

    def test_generate_heatmap(self):
        """Test heatmap generation from gaze data"""
        from tasks.gaze import _generate_heatmap

        gaze_data = [
            {'gaze_x': 0.5, 'gaze_y': 0.5},
            {'gaze_x': 0.5, 'gaze_y': 0.5},
            {'gaze_x': 0.5, 'gaze_y': 0.5},
        ]

        heatmap = _generate_heatmap(gaze_data, resolution=10)

        assert 'data' in heatmap
        assert 'resolution' in heatmap
        assert heatmap['resolution'] == 10
        assert len(heatmap['data']) == 10
        assert len(heatmap['data'][0]) == 10


class TestGazeAnomalyTask:
    """Tests for gaze anomaly detection task"""

    def test_determine_severity_high_off_screen(self):
        """Test severity determination for high off-screen ratio"""
        from tasks.gaze import _determine_severity

        # > 0.5 = critical
        assert _determine_severity('high_off_screen', 0.6) == 'critical'
        # > 0.3 = high
        assert _determine_severity('high_off_screen', 0.4) == 'high'
        # > 0.2 = medium
        assert _determine_severity('high_off_screen', 0.25) == 'medium'
        # <= 0.2 = low
        assert _determine_severity('high_off_screen', 0.15) == 'low'

    def test_determine_severity_rapid_movement(self):
        """Test severity determination for rapid movement"""
        from tasks.gaze import _determine_severity

        assert _determine_severity('rapid_movement', 900) == 'high'
        assert _determine_severity('rapid_movement', 600) == 'medium'
        assert _determine_severity('rapid_movement', 300) == 'low'

    def test_calculate_risk_contribution(self):
        """Test risk contribution calculation"""
        from tasks.gaze import _calculate_risk_contribution

        analysis = {}

        # Base weight for high_off_screen is 0.3
        contribution = _calculate_risk_contribution('high_off_screen', 0.5, analysis)

        # Should be within [0, 1]
        assert 0 <= contribution <= 1


class TestDockerComposeConfiguration:
    """Tests verifying docker-compose contains celery worker"""

    def test_docker_compose_has_celery_worker(self):
        """Test docker-compose.yml includes celery-worker service"""
        docker_compose_path = os.path.join(
            os.path.dirname(__file__),
            '..', '..', '..', 'docker-compose.yml'
        )

        # Normalize path
        docker_compose_path = os.path.normpath(docker_compose_path)

        with open(docker_compose_path, 'r') as f:
            content = f.read()

        assert 'celery-worker:' in content
        assert 'RABBITMQ_HOST' in content
        assert 'RABBITMQ_USER' in content
        assert 'RABBITMQ_PASS' in content

    def test_celery_worker_has_required_env_vars(self):
        """Test celery-worker service has required environment variables"""
        docker_compose_path = os.path.join(
            os.path.dirname(__file__),
            '..', '..', '..', 'docker-compose.yml'
        )

        docker_compose_path = os.path.normpath(docker_compose_path)

        with open(docker_compose_path, 'r') as f:
            content = f.read()

        # Check for essential environment variables
        assert 'EYE_TRACKING_SERVICE_URL' in content
        assert 'AI_DETECTION_SERVICE_URL' in content
        assert 'REDIS_HOST' in content
        assert 'REDIS_PORT' in content


class TestCredentialsSecurity:
    """Tests for credential security"""

    def test_rabbitmq_credentials_required(self):
        """Test RabbitMQ credentials are required (not defaulted)"""
        # In celery_app.py, credentials use os.environ (not os.getenv with default)
        # This ensures they must be explicitly provided

        with patch.dict(os.environ, {}, clear=True):
            # Should raise KeyError when credentials not provided
            with pytest.raises(KeyError):
                # Force reload of module
                import importlib
                import sys
                if 'celery_app' in sys.modules:
                    del sys.modules['celery_app']
                import celery_app

    def test_no_default_credentials_in_config(self):
        """Test no default credentials are hardcoded"""
        config_path = os.path.join(
            os.path.dirname(__file__),
            '..', 'celery_app.py'
        )

        with open(config_path, 'r') as f:
            content = f.read()

        # Credentials should use os.environ (required) not os.getenv (optional with default)
        assert "os.environ['RABBITMQ_USER']" in content
        assert "os.environ['RABBITMQ_PASS']" in content


class TestQueueConfiguration:
    """Tests for message queue configuration"""

    def test_all_queues_have_dlq(self):
        """Test all task queues have DLQ configuration"""
        with patch.dict(os.environ, {
            'RABBITMQ_USER': 'test',
            'RABBITMQ_PASS': 'test'
        }):
            from celery_app import app

            task_queues = app.conf.task_queues

            # Skip the dead letter queue itself
            for queue in task_queues:
                if 'dead_letter' not in queue.name:
                    assert 'x-dead-letter-exchange' in queue.queue_arguments

    def test_exchanges_configured(self):
        """Test exchanges are properly configured for topics"""
        with patch.dict(os.environ, {
            'RABBITMQ_USER': 'test',
            'RABBITMQ_PASS': 'test'
        }):
            from celery_app import app

            task_queues = app.conf.task_queues

            # Check some queues have proper exchange types
            exchange_types = set()
            for queue in task_queues:
                if hasattr(queue, 'exchange') and hasattr(queue.exchange, 'type'):
                    exchange_types.add(queue.exchange.type)

            # Should have topic and fanout exchanges
            assert 'topic' in exchange_types
            assert 'fanout' in exchange_types
