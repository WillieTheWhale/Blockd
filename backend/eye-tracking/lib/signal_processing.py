"""
Signal Processing Utilities for Gaze Data
Filtering, smoothing, and noise reduction
"""

import numpy as np
from scipy import signal
from typing import List, Tuple, Optional
import structlog

logger = structlog.get_logger(__name__)


def moving_average_filter(
    data: np.ndarray,
    window_size: int = 5
) -> np.ndarray:
    """
    Apply moving average filter to smooth data

    Args:
        data: Input data (1D or 2D array)
        window_size: Window size for averaging

    Returns:
        Smoothed data
    """
    if len(data) < window_size:
        return data

    kernel = np.ones(window_size) / window_size

    if data.ndim == 1:
        return np.convolve(data, kernel, mode='same')
    else:
        # Apply to each column
        return np.array([np.convolve(data[:, i], kernel, mode='same')
                        for i in range(data.shape[1])]).T


def gaussian_filter(
    data: np.ndarray,
    sigma: float = 1.0
) -> np.ndarray:
    """
    Apply Gaussian filter for smoothing

    Args:
        data: Input data (1D or 2D array)
        sigma: Standard deviation for Gaussian kernel

    Returns:
        Smoothed data
    """
    from scipy.ndimage import gaussian_filter1d

    if data.ndim == 1:
        return gaussian_filter1d(data, sigma)
    else:
        # Apply to each column
        return np.array([gaussian_filter1d(data[:, i], sigma)
                        for i in range(data.shape[1])]).T


def savitzky_golay_filter(
    data: np.ndarray,
    window_length: int = 11,
    polyorder: int = 3
) -> np.ndarray:
    """
    Apply Savitzky-Golay filter for smoothing and preserving features

    Args:
        data: Input data (1D or 2D array)
        window_length: Length of the filter window (must be odd)
        polyorder: Order of polynomial fit

    Returns:
        Smoothed data
    """
    if window_length % 2 == 0:
        window_length += 1  # Must be odd

    if len(data) < window_length:
        return data

    if data.ndim == 1:
        return signal.savgol_filter(data, window_length, polyorder)
    else:
        # Apply to each column
        return np.array([signal.savgol_filter(data[:, i], window_length, polyorder)
                        for i in range(data.shape[1])]).T


def median_filter(
    data: np.ndarray,
    kernel_size: int = 5
) -> np.ndarray:
    """
    Apply median filter to remove outliers

    Args:
        data: Input data (1D or 2D array)
        kernel_size: Size of the median filter kernel

    Returns:
        Filtered data
    """
    from scipy.ndimage import median_filter as scipy_median_filter

    if data.ndim == 1:
        return scipy_median_filter(data, size=kernel_size)
    else:
        # Apply to each column
        return np.array([scipy_median_filter(data[:, i], size=kernel_size)
                        for i in range(data.shape[1])]).T


def detect_outliers_zscore(
    data: np.ndarray,
    threshold: float = 3.0
) -> np.ndarray:
    """
    Detect outliers using z-score method

    Args:
        data: Input data
        threshold: Z-score threshold for outliers

    Returns:
        Boolean array indicating outliers
    """
    mean = np.mean(data)
    std = np.std(data)

    if std < 1e-8:
        return np.zeros(len(data), dtype=bool)

    z_scores = np.abs((data - mean) / std)
    return z_scores > threshold


def detect_outliers_iqr(
    data: np.ndarray,
    multiplier: float = 1.5
) -> np.ndarray:
    """
    Detect outliers using Interquartile Range (IQR) method

    Args:
        data: Input data
        multiplier: IQR multiplier for outlier threshold

    Returns:
        Boolean array indicating outliers
    """
    q1 = np.percentile(data, 25)
    q3 = np.percentile(data, 75)
    iqr = q3 - q1

    lower_bound = q1 - multiplier * iqr
    upper_bound = q3 + multiplier * iqr

    return (data < lower_bound) | (data > upper_bound)


def interpolate_missing_values(
    data: np.ndarray,
    mask: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Interpolate missing or outlier values

    Args:
        data: Input data with missing values (use np.nan)
        mask: Optional boolean mask for values to interpolate

    Returns:
        Data with interpolated values
    """
    if mask is not None:
        data_copy = data.copy()
        data_copy[mask] = np.nan
    else:
        data_copy = data.copy()

    # Find non-NaN indices
    valid_indices = np.where(~np.isnan(data_copy))[0]

    if len(valid_indices) == 0:
        return data_copy

    # Interpolate
    all_indices = np.arange(len(data_copy))
    interpolated = np.interp(
        all_indices,
        valid_indices,
        data_copy[valid_indices]
    )

    return interpolated


def calculate_velocity(
    positions: np.ndarray,
    timestamps: np.ndarray
) -> np.ndarray:
    """
    Calculate velocity from position time series

    Args:
        positions: Position data (N, d) where d is dimensionality
        timestamps: Timestamps for each position

    Returns:
        Velocity data (N-1, d)
    """
    if len(positions) < 2:
        return np.array([])

    # Calculate differences
    position_diffs = np.diff(positions, axis=0)
    time_diffs = np.diff(timestamps)

    # Avoid division by zero
    time_diffs = np.where(time_diffs > 0, time_diffs, 1e-8)

    # Calculate velocity
    velocities = position_diffs / time_diffs[:, np.newaxis]

    return velocities


def calculate_acceleration(
    velocities: np.ndarray,
    timestamps: np.ndarray
) -> np.ndarray:
    """
    Calculate acceleration from velocity time series

    Args:
        velocities: Velocity data (N, d)
        timestamps: Timestamps for each velocity

    Returns:
        Acceleration data (N-1, d)
    """
    if len(velocities) < 2:
        return np.array([])

    # Calculate differences
    velocity_diffs = np.diff(velocities, axis=0)
    time_diffs = np.diff(timestamps)

    # Avoid division by zero
    time_diffs = np.where(time_diffs > 0, time_diffs, 1e-8)

    # Calculate acceleration
    accelerations = velocity_diffs / time_diffs[:, np.newaxis]

    return accelerations


def detect_saccades(
    gaze_positions: np.ndarray,
    timestamps: np.ndarray,
    velocity_threshold: float = 30.0,
    min_duration: float = 0.01
) -> List[Tuple[int, int]]:
    """
    Detect saccades (rapid eye movements) in gaze data

    Args:
        gaze_positions: Gaze positions (N, 2)
        timestamps: Timestamps for each position
        velocity_threshold: Velocity threshold for saccade detection (deg/s)
        min_duration: Minimum duration for saccade (seconds)

    Returns:
        List of (start_index, end_index) tuples for detected saccades
    """
    if len(gaze_positions) < 2:
        return []

    # Calculate velocities
    velocities = calculate_velocity(gaze_positions, timestamps)
    velocity_magnitudes = np.linalg.norm(velocities, axis=1)

    # Detect when velocity exceeds threshold
    is_saccade = velocity_magnitudes > velocity_threshold

    # Find continuous saccade intervals
    saccades = []
    in_saccade = False
    start_idx = 0

    for i, is_sacc in enumerate(is_saccade):
        if is_sacc and not in_saccade:
            # Start of saccade
            start_idx = i
            in_saccade = True
        elif not is_sacc and in_saccade:
            # End of saccade
            end_idx = i
            duration = timestamps[end_idx] - timestamps[start_idx]

            if duration >= min_duration:
                saccades.append((start_idx, end_idx))

            in_saccade = False

    return saccades


def detect_fixations(
    gaze_positions: np.ndarray,
    timestamps: np.ndarray,
    dispersion_threshold: float = 1.0,
    min_duration: float = 0.1
) -> List[Tuple[int, int, Tuple[float, float]]]:
    """
    Detect fixations (stable gaze points) in gaze data

    Args:
        gaze_positions: Gaze positions (N, 2)
        timestamps: Timestamps for each position
        dispersion_threshold: Maximum dispersion for fixation (degrees)
        min_duration: Minimum duration for fixation (seconds)

    Returns:
        List of (start_index, end_index, centroid) tuples
    """
    fixations = []
    i = 0

    while i < len(gaze_positions):
        window_start = i
        window_end = i + 1

        # Expand window while dispersion is below threshold
        while window_end < len(gaze_positions):
            window_points = gaze_positions[window_start:window_end+1]
            dispersion = np.max(window_points, axis=0) - np.min(window_points, axis=0)
            max_dispersion = np.max(dispersion)

            if max_dispersion <= dispersion_threshold:
                window_end += 1
            else:
                break

        # Check duration
        duration = timestamps[window_end-1] - timestamps[window_start]

        if duration >= min_duration:
            # Calculate centroid
            centroid = np.mean(gaze_positions[window_start:window_end], axis=0)
            fixations.append((window_start, window_end-1, tuple(centroid)))

        i = window_end

    return fixations


def apply_low_pass_filter(
    data: np.ndarray,
    cutoff_frequency: float,
    sampling_rate: float,
    order: int = 4
) -> np.ndarray:
    """
    Apply Butterworth low-pass filter

    Args:
        data: Input data
        cutoff_frequency: Cutoff frequency (Hz)
        sampling_rate: Sampling rate (Hz)
        order: Filter order

    Returns:
        Filtered data
    """
    nyquist = sampling_rate / 2
    normalized_cutoff = cutoff_frequency / nyquist

    # Design filter
    b, a = signal.butter(order, normalized_cutoff, btype='low')

    # Apply filter
    if data.ndim == 1:
        return signal.filtfilt(b, a, data)
    else:
        return np.array([signal.filtfilt(b, a, data[:, i])
                        for i in range(data.shape[1])]).T


def downsample(
    data: np.ndarray,
    timestamps: np.ndarray,
    target_rate: float
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Downsample data to target sampling rate

    Args:
        data: Input data (N, d)
        timestamps: Timestamps
        target_rate: Target sampling rate (Hz)

    Returns:
        Tuple of (downsampled_data, downsampled_timestamps)
    """
    if len(data) < 2:
        return data, timestamps

    # Calculate target number of samples
    duration = timestamps[-1] - timestamps[0]
    target_samples = int(duration * target_rate)

    if target_samples >= len(data):
        return data, timestamps

    # Create target timestamps
    target_timestamps = np.linspace(
        timestamps[0],
        timestamps[-1],
        target_samples
    )

    # Interpolate data
    if data.ndim == 1:
        downsampled_data = np.interp(target_timestamps, timestamps, data)
    else:
        downsampled_data = np.array([
            np.interp(target_timestamps, timestamps, data[:, i])
            for i in range(data.shape[1])
        ]).T

    return downsampled_data, target_timestamps
