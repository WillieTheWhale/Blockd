"""
Pattern Recognition Service
Detects reading patterns, attention drift, and shifty eyes
"""

import numpy as np
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta
import structlog

from lib.geometry import calculate_saccade_velocity
from lib.signal_processing import detect_saccades, detect_fixations
from src.config import settings
from lib.errors import PatternRecognitionError

logger = structlog.get_logger(__name__)


class GazePoint:
    """Data class for gaze point"""

    def __init__(
        self,
        x: float,
        y: float,
        timestamp: datetime,
        is_off_screen: bool = False,
        off_screen_direction: Optional[str] = None,
        confidence: float = 1.0
    ):
        self.x = x
        self.y = y
        self.timestamp = timestamp
        self.is_off_screen = is_off_screen
        self.off_screen_direction = off_screen_direction
        self.confidence = confidence

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "x": self.x,
            "y": self.y,
            "timestamp": self.timestamp.isoformat(),
            "is_off_screen": self.is_off_screen,
            "off_screen_direction": self.off_screen_direction,
            "confidence": self.confidence
        }


class PatternRecognitionService:
    """
    Service for detecting gaze patterns
    """

    def __init__(self):
        """Initialize pattern recognition service"""
        # Configuration
        self.reading_velocity_threshold = settings.READING_SACCADE_VELOCITY_THRESHOLD
        self.reading_min_horizontal_saccades = settings.READING_MIN_HORIZONTAL_SACCADES
        self.reading_min_line_breaks = settings.READING_MIN_LINE_BREAKS
        self.reading_time_window = settings.READING_TIME_WINDOW

        self.attention_drift_threshold = settings.ATTENTION_DRIFT_THRESHOLD
        self.shifty_eyes_direction_threshold = settings.SHIFTY_EYES_DIRECTION_THRESHOLD
        self.shifty_eyes_time_window = settings.SHIFTY_EYES_TIME_WINDOW

        logger.info("pattern_recognition_service_initialized")

    def detect_reading_pattern(
        self,
        gaze_points: List[GazePoint],
        time_window: float = None
    ) -> Dict:
        """
        Detect left-to-right reading pattern with line breaks

        Args:
            gaze_points: List of gaze points
            time_window: Time window for analysis (seconds)

        Returns:
            Dictionary with detection results
        """
        try:
            time_window = time_window or self.reading_time_window

            if len(gaze_points) < 10:
                return {
                    "is_reading": False,
                    "confidence": 0.0,
                    "horizontal_saccades": 0,
                    "line_breaks": 0
                }

            # Filter points within time window
            if time_window:
                latest_time = gaze_points[-1].timestamp
                cutoff_time = latest_time - timedelta(seconds=time_window)
                gaze_points = [p for p in gaze_points if p.timestamp >= cutoff_time]

            # Convert to arrays for processing
            positions = np.array([[p.x, p.y] for p in gaze_points])
            timestamps = np.array([
                p.timestamp.timestamp() for p in gaze_points
            ])

            # Detect saccades (rapid movements)
            saccades = []
            for i in range(1, len(gaze_points)):
                velocity = calculate_saccade_velocity(
                    (gaze_points[i-1].x, gaze_points[i-1].y),
                    (gaze_points[i].x, gaze_points[i].y),
                    (timestamps[i] - timestamps[i-1])
                )

                if velocity > self.reading_velocity_threshold:
                    dx = gaze_points[i].x - gaze_points[i-1].x
                    dy = gaze_points[i].y - gaze_points[i-1].y
                    direction = np.arctan2(dy, dx)

                    saccades.append({
                        'velocity': velocity,
                        'direction': direction,
                        'dx': dx,
                        'dy': dy
                    })

            # Count horizontal saccades (left-to-right)
            # Horizontal: direction close to 0 or π
            horizontal_saccades = [
                s for s in saccades
                if (abs(s['direction']) < np.pi/4 or abs(s['direction'] - np.pi) < np.pi/4)
                and s['dx'] > 0  # Left to right
            ]

            # Count line breaks (quick vertical return, right to left)
            # Vertical down + left: direction around -3π/4 to -π/2
            line_breaks = [
                s for s in saccades
                if (abs(s['direction'] + 3*np.pi/4) < np.pi/6 and s['dx'] < 0)
            ]

            # Determine if reading pattern detected
            is_reading = (
                len(horizontal_saccades) >= self.reading_min_horizontal_saccades and
                len(line_breaks) >= self.reading_min_line_breaks
            )

            # Calculate confidence based on pattern strength
            confidence = min(
                (len(horizontal_saccades) / (self.reading_min_horizontal_saccades * 2)) +
                (len(line_breaks) / (self.reading_min_line_breaks * 2)),
                1.0
            )

            logger.info(
                "reading_pattern_detection",
                is_reading=is_reading,
                horizontal_saccades=len(horizontal_saccades),
                line_breaks=len(line_breaks),
                confidence=confidence
            )

            return {
                "is_reading": is_reading,
                "confidence": float(confidence),
                "horizontal_saccades": len(horizontal_saccades),
                "line_breaks": len(line_breaks),
                "total_saccades": len(saccades)
            }

        except Exception as e:
            logger.error("reading_pattern_detection_error", error=str(e))
            raise PatternRecognitionError(f"Reading pattern detection failed: {e}")

    def detect_attention_drift(
        self,
        gaze_points: List[GazePoint],
        threshold: float = None
    ) -> Dict:
        """
        Detect prolonged off-screen gaze (attention drift)

        Args:
            gaze_points: List of gaze points
            threshold: Off-screen duration threshold (seconds)

        Returns:
            Dictionary with detection results
        """
        try:
            threshold = threshold or self.attention_drift_threshold

            # Track off-screen durations
            off_screen_durations = []
            current_duration = 0.0
            last_timestamp = None

            for point in gaze_points:
                if point.is_off_screen:
                    if last_timestamp:
                        duration = (point.timestamp - last_timestamp).total_seconds()
                        current_duration += duration
                else:
                    if current_duration > 0:
                        off_screen_durations.append(current_duration)
                        current_duration = 0.0

                last_timestamp = point.timestamp

            # Add final duration if still off-screen
            if current_duration > 0:
                off_screen_durations.append(current_duration)

            # Find maximum off-screen duration
            max_drift = max(off_screen_durations) if off_screen_durations else 0.0

            # Detect drift
            is_drifting = max_drift > threshold

            # Calculate total off-screen time
            total_off_screen_time = sum(off_screen_durations)

            # Calculate percentage of time off-screen
            if gaze_points:
                total_time = (
                    gaze_points[-1].timestamp - gaze_points[0].timestamp
                ).total_seconds()
                off_screen_percentage = (
                    (total_off_screen_time / total_time * 100)
                    if total_time > 0 else 0.0
                )
            else:
                off_screen_percentage = 0.0

            logger.info(
                "attention_drift_detection",
                is_drifting=is_drifting,
                max_drift=max_drift,
                total_off_screen_time=total_off_screen_time,
                off_screen_percentage=off_screen_percentage
            )

            return {
                "is_drifting": is_drifting,
                "max_drift_seconds": float(max_drift),
                "total_off_screen_seconds": float(total_off_screen_time),
                "off_screen_percentage": float(off_screen_percentage),
                "num_drift_events": len(off_screen_durations)
            }

        except Exception as e:
            logger.error("attention_drift_detection_error", error=str(e))
            raise PatternRecognitionError(f"Attention drift detection failed: {e}")

    def detect_shifty_eyes(
        self,
        gaze_points: List[GazePoint],
        direction_threshold: int = None,
        time_window: float = None
    ) -> Dict:
        """
        Detect frequent rapid glances to specific regions (shifty eyes)

        Args:
            gaze_points: List of gaze points
            direction_threshold: Min glances in one direction to flag
            time_window: Time window for analysis (seconds)

        Returns:
            Dictionary with detection results
        """
        try:
            direction_threshold = direction_threshold or self.shifty_eyes_direction_threshold
            time_window = time_window or self.shifty_eyes_time_window

            if not gaze_points:
                return {
                    "detected": False,
                    "direction": None,
                    "glance_count": 0
                }

            # Filter points within time window
            if time_window:
                latest_time = gaze_points[-1].timestamp
                cutoff_time = latest_time - timedelta(seconds=time_window)
                gaze_points = [p for p in gaze_points if p.timestamp >= cutoff_time]

            # Count directional off-screen glances
            directional_counts = {'left': 0, 'right': 0, 'up': 0, 'down': 0}

            for point in gaze_points:
                if point.is_off_screen and point.off_screen_direction:
                    directional_counts[point.off_screen_direction] += 1

            # Find dominant direction
            max_direction = max(directional_counts, key=directional_counts.get)
            max_count = directional_counts[max_direction]

            # Detect shifty eyes
            detected = max_count > direction_threshold

            # Calculate glance frequency
            if gaze_points:
                total_time = (
                    gaze_points[-1].timestamp - gaze_points[0].timestamp
                ).total_seconds()
                glance_frequency = max_count / total_time if total_time > 0 else 0.0
            else:
                glance_frequency = 0.0

            logger.info(
                "shifty_eyes_detection",
                detected=detected,
                direction=max_direction if detected else None,
                count=max_count,
                frequency=glance_frequency
            )

            return {
                "detected": detected,
                "direction": max_direction if detected else None,
                "glance_count": max_count,
                "directional_counts": directional_counts,
                "glance_frequency": float(glance_frequency)  # Glances per second
            }

        except Exception as e:
            logger.error("shifty_eyes_detection_error", error=str(e))
            raise PatternRecognitionError(f"Shifty eyes detection failed: {e}")

    def analyze_all_patterns(
        self,
        gaze_points: List[GazePoint]
    ) -> Dict:
        """
        Run all pattern detection algorithms

        Args:
            gaze_points: List of gaze points

        Returns:
            Dictionary with all pattern results
        """
        try:
            reading = self.detect_reading_pattern(gaze_points)
            drift = self.detect_attention_drift(gaze_points)
            shifty = self.detect_shifty_eyes(gaze_points)

            return {
                "reading": reading,
                "attention_drift": drift,
                "shifty_eyes": shifty
            }

        except Exception as e:
            logger.error("pattern_analysis_error", error=str(e))
            raise PatternRecognitionError(f"Pattern analysis failed: {e}")

    def detect_fixations_and_saccades(
        self,
        gaze_points: List[GazePoint]
    ) -> Dict:
        """
        Detect fixations and saccades in gaze data

        Args:
            gaze_points: List of gaze points

        Returns:
            Dictionary with fixations and saccades
        """
        try:
            if len(gaze_points) < 2:
                return {
                    "fixations": [],
                    "saccades": [],
                    "num_fixations": 0,
                    "num_saccades": 0
                }

            # Convert to arrays
            positions = np.array([[p.x, p.y] for p in gaze_points if not p.is_off_screen])
            timestamps = np.array([
                p.timestamp.timestamp() for p in gaze_points if not p.is_off_screen
            ])

            if len(positions) < 2:
                return {
                    "fixations": [],
                    "saccades": [],
                    "num_fixations": 0,
                    "num_saccades": 0
                }

            # Detect fixations
            fixations = detect_fixations(
                positions,
                timestamps,
                dispersion_threshold=0.05,  # 5% of screen
                min_duration=0.1  # 100ms
            )

            # Detect saccades
            saccades = detect_saccades(
                positions,
                timestamps,
                velocity_threshold=0.3,  # Normalized velocity
                min_duration=0.02  # 20ms
            )

            logger.info(
                "fixations_saccades_detected",
                num_fixations=len(fixations),
                num_saccades=len(saccades)
            )

            return {
                "fixations": fixations,
                "saccades": saccades,
                "num_fixations": len(fixations),
                "num_saccades": len(saccades)
            }

        except Exception as e:
            logger.error("fixation_saccade_detection_error", error=str(e))
            raise PatternRecognitionError(f"Fixation/saccade detection failed: {e}")
