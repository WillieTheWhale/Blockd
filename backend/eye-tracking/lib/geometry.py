"""
3D Geometry Calculations for Eye Tracking
"""

import numpy as np
from typing import Tuple, List
import cv2


def calculate_euclidean_distance(point1: np.ndarray, point2: np.ndarray) -> float:
    """
    Calculate Euclidean distance between two points

    Args:
        point1: First point (x, y) or (x, y, z)
        point2: Second point (x, y) or (x, y, z)

    Returns:
        Distance
    """
    return float(np.linalg.norm(point1 - point2))


def calculate_angle(vector1: np.ndarray, vector2: np.ndarray) -> float:
    """
    Calculate angle between two vectors in radians

    Args:
        vector1: First vector
        vector2: Second vector

    Returns:
        Angle in radians
    """
    # Normalize vectors
    v1_norm = vector1 / (np.linalg.norm(vector1) + 1e-8)
    v2_norm = vector2 / (np.linalg.norm(vector2) + 1e-8)

    # Calculate angle
    cos_angle = np.clip(np.dot(v1_norm, v2_norm), -1.0, 1.0)
    angle = np.arccos(cos_angle)

    return float(angle)


def calculate_direction_vector(from_point: np.ndarray, to_point: np.ndarray) -> np.ndarray:
    """
    Calculate normalized direction vector from one point to another

    Args:
        from_point: Starting point
        to_point: Target point

    Returns:
        Normalized direction vector
    """
    direction = to_point - from_point
    magnitude = np.linalg.norm(direction)

    if magnitude < 1e-8:
        return np.zeros_like(direction)

    return direction / magnitude


def project_point_to_plane(
    point: np.ndarray,
    plane_normal: np.ndarray,
    plane_point: np.ndarray
) -> np.ndarray:
    """
    Project a 3D point onto a plane

    Args:
        point: Point to project
        plane_normal: Normal vector of the plane
        plane_point: A point on the plane

    Returns:
        Projected point
    """
    # Normalize plane normal
    normal = plane_normal / (np.linalg.norm(plane_normal) + 1e-8)

    # Vector from plane point to target point
    v = point - plane_point

    # Distance from point to plane
    dist = np.dot(v, normal)

    # Projected point
    projected = point - dist * normal

    return projected


def calculate_centroid(points: np.ndarray) -> np.ndarray:
    """
    Calculate centroid of a set of points

    Args:
        points: Array of points (N, d) where d is dimensionality

    Returns:
        Centroid point
    """
    return np.mean(points, axis=0)


def rotate_vector_2d(vector: np.ndarray, angle: float) -> np.ndarray:
    """
    Rotate a 2D vector by given angle

    Args:
        vector: 2D vector [x, y]
        angle: Rotation angle in radians

    Returns:
        Rotated vector
    """
    rotation_matrix = np.array([
        [np.cos(angle), -np.sin(angle)],
        [np.sin(angle), np.cos(angle)]
    ])

    return rotation_matrix @ vector


def rotation_matrix_from_euler(pitch: float, yaw: float, roll: float) -> np.ndarray:
    """
    Create 3D rotation matrix from Euler angles

    Args:
        pitch: Rotation around X-axis (radians)
        yaw: Rotation around Y-axis (radians)
        roll: Rotation around Z-axis (radians)

    Returns:
        3x3 rotation matrix
    """
    # Rotation around X-axis (pitch)
    R_x = np.array([
        [1, 0, 0],
        [0, np.cos(pitch), -np.sin(pitch)],
        [0, np.sin(pitch), np.cos(pitch)]
    ])

    # Rotation around Y-axis (yaw)
    R_y = np.array([
        [np.cos(yaw), 0, np.sin(yaw)],
        [0, 1, 0],
        [-np.sin(yaw), 0, np.cos(yaw)]
    ])

    # Rotation around Z-axis (roll)
    R_z = np.array([
        [np.cos(roll), -np.sin(roll), 0],
        [np.sin(roll), np.cos(roll), 0],
        [0, 0, 1]
    ])

    # Combined rotation matrix
    R = R_z @ R_y @ R_x

    return R


def calculate_eye_aspect_ratio(eye_landmarks: np.ndarray) -> float:
    """
    Calculate Eye Aspect Ratio (EAR) for blink detection

    Args:
        eye_landmarks: Eye outline landmarks (6 or 8 points)

    Returns:
        EAR value (lower means eye more closed)
    """
    # Vertical distances
    if len(eye_landmarks) >= 6:
        v1 = calculate_euclidean_distance(eye_landmarks[1], eye_landmarks[5])
        v2 = calculate_euclidean_distance(eye_landmarks[2], eye_landmarks[4])

        # Horizontal distance
        h = calculate_euclidean_distance(eye_landmarks[0], eye_landmarks[3])

        # EAR formula
        ear = (v1 + v2) / (2.0 * h + 1e-8)

        return float(ear)
    else:
        return 0.3  # Default value


def estimate_focal_length_from_fov(
    image_width: int,
    horizontal_fov_degrees: float
) -> float:
    """
    Estimate camera focal length from field of view

    Args:
        image_width: Image width in pixels
        horizontal_fov_degrees: Horizontal field of view in degrees

    Returns:
        Focal length in pixels
    """
    fov_radians = np.radians(horizontal_fov_degrees)
    focal_length = image_width / (2 * np.tan(fov_radians / 2))

    return float(focal_length)


def triangulate_point(
    point1_2d: np.ndarray,
    point2_2d: np.ndarray,
    camera_matrix1: np.ndarray,
    camera_matrix2: np.ndarray,
    pose1: np.ndarray,
    pose2: np.ndarray
) -> np.ndarray:
    """
    Triangulate 3D point from two 2D observations

    Args:
        point1_2d: 2D point in first camera
        point2_2d: 2D point in second camera
        camera_matrix1: First camera intrinsic matrix
        camera_matrix2: Second camera intrinsic matrix
        pose1: First camera pose matrix (3x4)
        pose2: Second camera pose matrix (3x4)

    Returns:
        3D point in world coordinates
    """
    # Triangulate using OpenCV
    point_4d = cv2.triangulatePoints(
        pose1,
        pose2,
        point1_2d.reshape(2, 1),
        point2_2d.reshape(2, 1)
    )

    # Convert from homogeneous to 3D coordinates
    point_3d = point_4d[:3] / point_4d[3]

    return point_3d.flatten()


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    """
    Normalize a vector to unit length

    Args:
        vector: Input vector

    Returns:
        Normalized vector
    """
    magnitude = np.linalg.norm(vector)

    if magnitude < 1e-8:
        return np.zeros_like(vector)

    return vector / magnitude


def calculate_saccade_velocity(
    point1: Tuple[float, float],
    point2: Tuple[float, float],
    time_delta: float,
    screen_width: int = 1920,
    screen_height: int = 1080
) -> float:
    """
    Calculate saccade velocity in pixels per second

    Args:
        point1: (x, y) gaze point (normalized 0-1)
        point2: (x, y) gaze point (normalized 0-1)
        time_delta: Time difference in seconds
        screen_width: Screen width in pixels
        screen_height: Screen height in pixels

    Returns:
        Velocity in pixels/second
    """
    # Convert to pixel coordinates
    x1, y1 = point1[0] * screen_width, point1[1] * screen_height
    x2, y2 = point2[0] * screen_width, point2[1] * screen_height

    # Calculate distance
    dx = x2 - x1
    dy = y2 - y1
    distance = np.sqrt(dx**2 + dy**2)

    # Calculate velocity
    if time_delta > 0:
        velocity = distance / time_delta
    else:
        velocity = 0

    return float(velocity)


def is_point_in_polygon(point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
    """
    Check if a point is inside a polygon using ray casting algorithm

    Args:
        point: (x, y) point to check
        polygon: List of (x, y) polygon vertices

    Returns:
        True if point is inside polygon
    """
    x, y = point
    n = len(polygon)
    inside = False

    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]

        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside

        p1x, p1y = p2x, p2y

    return inside
