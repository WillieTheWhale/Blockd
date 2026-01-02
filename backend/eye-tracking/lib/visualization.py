"""
Visualization Utilities for Eye Tracking
Generate heatmaps and other visualizations
"""

import cv2
import numpy as np
from typing import List, Tuple, Optional
import structlog
import os

from src.config import settings
from lib.errors import HeatmapGenerationError

logger = structlog.get_logger(__name__)


def generate_gaze_heatmap(
    gaze_points: List[Tuple[float, float]],
    width: int = None,
    height: int = None,
    sigma: int = None,
    colormap: int = cv2.COLORMAP_JET
) -> np.ndarray:
    """
    Generate Gaussian heatmap of gaze points

    Args:
        gaze_points: List of (x, y) gaze coordinates (0-1 normalized)
        width: Heatmap width in pixels
        height: Heatmap height in pixels
        sigma: Gaussian kernel sigma
        colormap: OpenCV colormap to apply

    Returns:
        Colored heatmap image (BGR)

    Raises:
        HeatmapGenerationError: If generation fails
    """
    try:
        width = width or settings.HEATMAP_WIDTH
        height = height or settings.HEATMAP_HEIGHT
        sigma = sigma or settings.HEATMAP_GAUSSIAN_SIGMA

        if not gaze_points:
            # Return blank heatmap
            return np.zeros((height, width, 3), dtype=np.uint8)

        # Initialize heatmap
        heatmap = np.zeros((height, width), dtype=np.float32)

        # Create Gaussian kernel
        kernel_size = settings.HEATMAP_KERNEL_SIZE
        if kernel_size % 2 == 0:
            kernel_size += 1  # Must be odd

        kernel = cv2.getGaussianKernel(kernel_size, sigma)
        kernel_2d = kernel * kernel.T

        # Add Gaussian blob for each gaze point
        for x_norm, y_norm in gaze_points:
            # Convert to pixel coordinates
            x = int(x_norm * width)
            y = int(y_norm * height)

            # Skip invalid points
            if x < 0 or x >= width or y < 0 or y >= height:
                continue

            # Calculate kernel bounds
            kernel_half = kernel_size // 2

            x_start = max(0, x - kernel_half)
            x_end = min(width, x + kernel_half + 1)
            y_start = max(0, y - kernel_half)
            y_end = min(height, y + kernel_half + 1)

            # Calculate kernel region
            kernel_x_start = kernel_half - (x - x_start)
            kernel_x_end = kernel_x_start + (x_end - x_start)
            kernel_y_start = kernel_half - (y - y_start)
            kernel_y_end = kernel_y_start + (y_end - y_start)

            # Add kernel to heatmap
            heatmap[y_start:y_end, x_start:x_end] += kernel_2d[
                kernel_y_start:kernel_y_end,
                kernel_x_start:kernel_x_end
            ]

        # Normalize to 0-255
        if heatmap.max() > 0:
            heatmap = (heatmap / heatmap.max() * 255).astype(np.uint8)
        else:
            heatmap = heatmap.astype(np.uint8)

        # Apply colormap
        heatmap_colored = cv2.applyColorMap(heatmap, colormap)

        logger.info(
            "heatmap_generated",
            num_points=len(gaze_points),
            width=width,
            height=height
        )

        return heatmap_colored

    except Exception as e:
        logger.error("heatmap_generation_error", error=str(e))
        raise HeatmapGenerationError(f"Heatmap generation failed: {e}")


def save_heatmap(
    heatmap: np.ndarray,
    filepath: str
) -> str:
    """
    Save heatmap to file

    Args:
        heatmap: Heatmap image
        filepath: Path to save image

    Returns:
        Path to saved image

    Raises:
        HeatmapGenerationError: If save fails
    """
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        # Save image
        cv2.imwrite(filepath, heatmap)

        logger.info("heatmap_saved", filepath=filepath)

        return filepath

    except Exception as e:
        logger.error("heatmap_save_error", error=str(e))
        raise HeatmapGenerationError(f"Heatmap save failed: {e}")


def overlay_heatmap_on_image(
    heatmap: np.ndarray,
    background_image: np.ndarray,
    alpha: float = 0.5
) -> np.ndarray:
    """
    Overlay heatmap on background image

    Args:
        heatmap: Heatmap image (BGR)
        background_image: Background image (BGR)
        alpha: Heatmap transparency (0-1)

    Returns:
        Overlaid image

    Raises:
        HeatmapGenerationError: If overlay fails
    """
    try:
        # Resize heatmap to match background
        h, w = background_image.shape[:2]
        heatmap_resized = cv2.resize(heatmap, (w, h))

        # Blend images
        overlay = cv2.addWeighted(
            background_image,
            1 - alpha,
            heatmap_resized,
            alpha,
            0
        )

        return overlay

    except Exception as e:
        logger.error("heatmap_overlay_error", error=str(e))
        raise HeatmapGenerationError(f"Heatmap overlay failed: {e}")


def draw_gaze_path(
    image: np.ndarray,
    gaze_points: List[Tuple[float, float]],
    color: Tuple[int, int, int] = (0, 255, 0),
    thickness: int = 2
) -> np.ndarray:
    """
    Draw gaze path on image

    Args:
        image: Input image (BGR)
        gaze_points: List of (x, y) gaze coordinates (0-1 normalized)
        color: Line color (BGR)
        thickness: Line thickness

    Returns:
        Image with gaze path drawn
    """
    try:
        result = image.copy()
        h, w = image.shape[:2]

        # Convert normalized coordinates to pixels
        pixel_points = [
            (int(x * w), int(y * h))
            for x, y in gaze_points
        ]

        # Draw lines between consecutive points
        for i in range(1, len(pixel_points)):
            cv2.line(result, pixel_points[i-1], pixel_points[i], color, thickness)

        # Draw points
        for point in pixel_points:
            cv2.circle(result, point, 3, color, -1)

        return result

    except Exception as e:
        logger.error("gaze_path_drawing_error", error=str(e))
        return image


def draw_fixations(
    image: np.ndarray,
    fixations: List[Tuple[int, int, Tuple[float, float]]],
    color: Tuple[int, int, int] = (255, 0, 0),
    show_duration: bool = True
) -> np.ndarray:
    """
    Draw fixation points on image

    Args:
        image: Input image (BGR)
        fixations: List of (start_idx, end_idx, centroid) tuples
        color: Fixation color (BGR)
        show_duration: Whether to show duration text

    Returns:
        Image with fixations drawn
    """
    try:
        result = image.copy()
        h, w = image.shape[:2]

        for start_idx, end_idx, (x, y) in fixations:
            # Convert to pixel coordinates
            px = int(x * w)
            py = int(y * h)

            # Calculate duration (approximate)
            duration = end_idx - start_idx

            # Draw circle (size based on duration)
            radius = min(int(5 + duration * 0.5), 50)
            cv2.circle(result, (px, py), radius, color, 2)

            # Draw center point
            cv2.circle(result, (px, py), 3, color, -1)

            # Draw duration text
            if show_duration:
                cv2.putText(
                    result,
                    f"{duration}",
                    (px + 10, py - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    color,
                    1
                )

        return result

    except Exception as e:
        logger.error("fixation_drawing_error", error=str(e))
        return image


def draw_saccades(
    image: np.ndarray,
    gaze_points: List[Tuple[float, float]],
    saccades: List[Tuple[int, int]],
    color: Tuple[int, int, int] = (0, 0, 255),
    thickness: int = 2
) -> np.ndarray:
    """
    Draw saccade lines on image

    Args:
        image: Input image (BGR)
        gaze_points: List of all gaze points
        saccades: List of (start_idx, end_idx) saccade tuples
        color: Saccade color (BGR)
        thickness: Line thickness

    Returns:
        Image with saccades drawn
    """
    try:
        result = image.copy()
        h, w = image.shape[:2]

        for start_idx, end_idx in saccades:
            if start_idx < len(gaze_points) and end_idx < len(gaze_points):
                # Get start and end points
                x1, y1 = gaze_points[start_idx]
                x2, y2 = gaze_points[end_idx]

                # Convert to pixels
                px1 = int(x1 * w)
                py1 = int(y1 * h)
                px2 = int(x2 * w)
                py2 = int(y2 * h)

                # Draw arrow
                cv2.arrowedLine(result, (px1, py1), (px2, py2), color, thickness)

        return result

    except Exception as e:
        logger.error("saccade_drawing_error", error=str(e))
        return image


def create_scanpath_visualization(
    width: int,
    height: int,
    gaze_points: List[Tuple[float, float]],
    fixations: Optional[List] = None,
    saccades: Optional[List] = None,
    background_color: Tuple[int, int, int] = (255, 255, 255)
) -> np.ndarray:
    """
    Create comprehensive scanpath visualization

    Args:
        width: Image width
        height: Image height
        gaze_points: List of gaze points
        fixations: Optional fixation data
        saccades: Optional saccade data
        background_color: Background color (BGR)

    Returns:
        Scanpath visualization image
    """
    try:
        # Create blank image
        image = np.full((height, width, 3), background_color, dtype=np.uint8)

        # Draw gaze path
        image = draw_gaze_path(image, gaze_points)

        # Draw fixations
        if fixations:
            image = draw_fixations(image, fixations)

        # Draw saccades
        if saccades:
            image = draw_saccades(image, gaze_points, saccades)

        return image

    except Exception as e:
        logger.error("scanpath_visualization_error", error=str(e))
        return np.full((height, width, 3), background_color, dtype=np.uint8)


def generate_attention_map(
    gaze_points: List[Tuple[float, float]],
    width: int = None,
    height: int = None,
    grid_size: int = 20
) -> np.ndarray:
    """
    Generate grid-based attention map

    Args:
        gaze_points: List of gaze points
        width: Map width
        height: Map height
        grid_size: Size of grid cells

    Returns:
        Attention map array (grid_height, grid_width)
    """
    try:
        width = width or settings.HEATMAP_WIDTH
        height = height or settings.HEATMAP_HEIGHT

        # Calculate grid dimensions
        grid_width = width // grid_size
        grid_height = height // grid_size

        # Initialize attention map
        attention_map = np.zeros((grid_height, grid_width), dtype=np.float32)

        # Count gaze points in each grid cell
        for x_norm, y_norm in gaze_points:
            x = int(x_norm * width)
            y = int(y_norm * height)

            grid_x = min(x // grid_size, grid_width - 1)
            grid_y = min(y // grid_size, grid_height - 1)

            attention_map[grid_y, grid_x] += 1

        # Normalize
        if attention_map.max() > 0:
            attention_map = attention_map / attention_map.max()

        return attention_map

    except Exception as e:
        logger.error("attention_map_generation_error", error=str(e))
        return np.zeros((height // grid_size, width // grid_size), dtype=np.float32)
