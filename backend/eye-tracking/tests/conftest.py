"""
Pytest configuration and fixtures for eye-tracking service
"""
import pytest
import os
import numpy as np
from datetime import datetime


@pytest.fixture(scope="session", autouse=True)
def test_config():
    """Set test environment variables"""
    os.environ["ENV"] = "test"
    os.environ["DEBUG"] = "true"
    os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_blockd"
    os.environ["REDIS_HOST"] = "localhost"
    os.environ["REDIS_PORT"] = "6379"
    os.environ["LOG_LEVEL"] = "DEBUG"


@pytest.fixture
def sample_eye_landmarks():
    """Sample eye landmark data from MediaPipe FaceMesh"""
    return {
        "left_eye": [
            [0.35, 0.45, 0.02],  # Eye corner
            [0.38, 0.44, 0.01],
            [0.40, 0.45, 0.01],
            [0.38, 0.46, 0.01],
        ],
        "right_eye": [
            [0.65, 0.45, 0.02],
            [0.62, 0.44, 0.01],
            [0.60, 0.45, 0.01],
            [0.62, 0.46, 0.01],
        ],
        "left_iris": [[0.37, 0.45, 0.01]],
        "right_iris": [[0.63, 0.45, 0.01]],
    }


@pytest.fixture
def sample_eye_data():
    """Sample processed eye data for gaze calculation"""
    return {
        "left_eye_center": np.array([100, 100, 50]),
        "right_eye_center": np.array([150, 100, 50]),
        "left_iris_center": np.array([102, 101, 51]),
        "right_iris_center": np.array([152, 101, 51]),
        "left_eye_aspect_ratio": 0.3,
        "right_eye_aspect_ratio": 0.3,
    }


@pytest.fixture
def sample_gaze_event():
    """Sample gaze event for database storage"""
    return {
        "session_id": "test-session-123",
        "timestamp": datetime.utcnow().isoformat(),
        "gaze_x": 0.52,
        "gaze_y": 0.48,
        "is_off_screen": False,
        "off_screen_direction": None,
        "confidence": 0.95,
        "pupil_diameter_left": 3.2,
        "pupil_diameter_right": 3.1,
    }


@pytest.fixture
def sample_calibration_data():
    """Sample calibration data (ground truth and observed points)"""
    ground_truth = [
        (0.1, 0.1),   # Top-left
        (0.9, 0.1),   # Top-right
        (0.5, 0.5),   # Center
        (0.1, 0.9),   # Bottom-left
        (0.9, 0.9),   # Bottom-right
    ]
    observed = [
        (0.12, 0.11),
        (0.88, 0.12),
        (0.51, 0.49),
        (0.11, 0.89),
        (0.87, 0.88),
    ]
    return {"ground_truth": ground_truth, "observed": observed}


@pytest.fixture
def sample_gaze_sequence():
    """Sample sequence of gaze events for pattern analysis"""
    np.random.seed(42)
    base_time = datetime.utcnow()
    events = []

    # Simulate natural gaze with some noise
    for i in range(100):
        # Oscillating gaze around center with noise
        gaze_x = 0.5 + 0.1 * np.sin(i * 0.1) + np.random.normal(0, 0.02)
        gaze_y = 0.5 + 0.05 * np.cos(i * 0.15) + np.random.normal(0, 0.02)

        events.append({
            "timestamp": (base_time.timestamp() + i * 0.033) * 1000,  # ~30 FPS
            "gaze_x": max(0, min(1, gaze_x)),
            "gaze_y": max(0, min(1, gaze_y)),
            "confidence": np.random.uniform(0.85, 1.0),
        })

    return events


@pytest.fixture
def mock_facemesh_result():
    """Mock MediaPipe FaceMesh detection result"""
    # Simplified 468-point landmark mock
    landmarks = []
    for i in range(468):
        landmarks.append({
            "x": np.random.uniform(0.2, 0.8),
            "y": np.random.uniform(0.2, 0.8),
            "z": np.random.uniform(-0.1, 0.1),
        })
    return {"multi_face_landmarks": [{"landmark": landmarks}]}
