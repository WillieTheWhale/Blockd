"""
Utility Library for Eye Tracking
"""

from .errors import (
    EyeTrackingError,
    FaceMeshError,
    NoFaceDetectedError,
    GazeEstimationError,
    CalibrationError,
    AnomalyDetectionError
)
from .geometry import (
    calculate_euclidean_distance,
    calculate_angle,
    calculate_saccade_velocity
)
from .signal_processing import (
    moving_average_filter,
    gaussian_filter,
    detect_saccades,
    detect_fixations
)
from .visualization import (
    generate_gaze_heatmap,
    save_heatmap,
    draw_gaze_path
)

__all__ = [
    # Errors
    'EyeTrackingError',
    'FaceMeshError',
    'NoFaceDetectedError',
    'GazeEstimationError',
    'CalibrationError',
    'AnomalyDetectionError',
    # Geometry
    'calculate_euclidean_distance',
    'calculate_angle',
    'calculate_saccade_velocity',
    # Signal Processing
    'moving_average_filter',
    'gaussian_filter',
    'detect_saccades',
    'detect_fixations',
    # Visualization
    'generate_gaze_heatmap',
    'save_heatmap',
    'draw_gaze_path'
]
