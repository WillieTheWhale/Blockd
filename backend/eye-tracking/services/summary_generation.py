"""
Summary Generation Service
Generates comprehensive gaze session summaries
"""

import numpy as np
from typing import List, Dict, Optional
from datetime import datetime
import uuid
import structlog

from services.pattern_recognition import PatternRecognitionService, GazePoint
from services.anomaly_detection import AnomalyDetectionService
from lib.visualization import generate_gaze_heatmap, save_heatmap
from src.config import settings
from lib.errors import EyeTrackingError

logger = structlog.get_logger(__name__)


class SummaryGenerationService:
    """
    Service for generating gaze session summaries
    """

    def __init__(self):
        """Initialize summary generation service"""
        self.pattern_service = PatternRecognitionService()
        self.anomaly_service = AnomalyDetectionService()

        logger.info("summary_generation_service_initialized")

    def generate_summary(
        self,
        session_id: uuid.UUID,
        gaze_points: List[GazePoint],
        heatmap_output_dir: str = None
    ) -> Dict:
        """
        Generate comprehensive gaze session summary

        Args:
            session_id: Session ID
            gaze_points: List of gaze points
            heatmap_output_dir: Directory to save heatmap

        Returns:
            Dictionary with session summary

        Raises:
            EyeTrackingError: If summary generation fails
        """
        try:
            if not gaze_points:
                return self._empty_summary(session_id)

            # Calculate duration
            start_time = gaze_points[0].timestamp
            end_time = gaze_points[-1].timestamp
            total_duration = (end_time - start_time).total_seconds()

            # Calculate on-screen percentage
            on_screen_count = sum(1 for p in gaze_points if not p.is_off_screen)
            on_screen_percentage = (on_screen_count / len(gaze_points) * 100)

            # Extract off-screen events
            off_screen_events = self._extract_off_screen_events(gaze_points)

            # Detect patterns
            patterns_detected = self.pattern_service.analyze_all_patterns(gaze_points)

            # Detect anomalies
            anomalies = self.anomaly_service.detect_batch_anomalies(gaze_points)

            # Add statistical anomalies
            statistical_anomalies = self.anomaly_service.detect_statistical_anomalies(
                gaze_points
            )
            anomalies.extend(statistical_anomalies)

            # Calculate average confidence
            average_confidence = np.mean([p.confidence for p in gaze_points])

            # Generate heatmap
            heatmap_url = self._generate_heatmap(
                session_id=session_id,
                gaze_points=gaze_points,
                output_dir=heatmap_output_dir
            )

            # Calculate risk score
            risk_score = self._calculate_risk_score(
                on_screen_percentage=on_screen_percentage,
                patterns_detected=patterns_detected,
                anomalies=anomalies
            )

            # Build summary
            summary = {
                "session_id": str(session_id),
                "total_duration_seconds": float(total_duration),
                "on_screen_percentage": float(on_screen_percentage),
                "off_screen_events": off_screen_events,
                "patterns_detected": {
                    "reading": patterns_detected["reading"]["is_reading"],
                    "attention_drift": patterns_detected["attention_drift"]["is_drifting"],
                    "shifty_eyes": {
                        "detected": patterns_detected["shifty_eyes"]["detected"],
                        "direction": patterns_detected["shifty_eyes"]["direction"]
                    }
                },
                "anomalies": anomalies,
                "heatmap_url": heatmap_url,
                "average_confidence": float(average_confidence),
                "risk_score": float(risk_score),
                "risk_factors": self._identify_risk_factors(
                    on_screen_percentage=on_screen_percentage,
                    patterns_detected=patterns_detected,
                    anomalies=anomalies
                ),
                "statistics": {
                    "total_gaze_points": len(gaze_points),
                    "on_screen_points": on_screen_count,
                    "off_screen_points": len(gaze_points) - on_screen_count,
                    "num_off_screen_events": len(off_screen_events),
                    "num_anomalies": len(anomalies),
                    "pattern_details": patterns_detected
                }
            }

            logger.info(
                "summary_generated",
                session_id=str(session_id),
                duration=total_duration,
                risk_score=risk_score
            )

            return summary

        except Exception as e:
            logger.error("summary_generation_error", error=str(e))
            raise EyeTrackingError(f"Summary generation failed: {e}")

    def _extract_off_screen_events(
        self,
        gaze_points: List[GazePoint]
    ) -> List[Dict]:
        """
        Extract off-screen events from gaze points

        Args:
            gaze_points: List of gaze points

        Returns:
            List of off-screen event dictionaries
        """
        events = []
        in_event = False
        event_start = None
        event_direction = None

        for point in gaze_points:
            if point.is_off_screen and not in_event:
                # Start of off-screen event
                in_event = True
                event_start = point.timestamp
                event_direction = point.off_screen_direction

            elif not point.is_off_screen and in_event:
                # End of off-screen event
                duration = (point.timestamp - event_start).total_seconds()
                events.append({
                    "direction": event_direction,
                    "duration_seconds": float(duration),
                    "timestamp": event_start.isoformat()
                })
                in_event = False

        # Handle case where session ends while off-screen
        if in_event and gaze_points:
            duration = (gaze_points[-1].timestamp - event_start).total_seconds()
            events.append({
                "direction": event_direction,
                "duration_seconds": float(duration),
                "timestamp": event_start.isoformat()
            })

        return events

    def _generate_heatmap(
        self,
        session_id: uuid.UUID,
        gaze_points: List[GazePoint],
        output_dir: str = None
    ) -> Optional[str]:
        """
        Generate and save heatmap

        Args:
            session_id: Session ID
            gaze_points: List of gaze points
            output_dir: Output directory

        Returns:
            URL/path to heatmap image
        """
        try:
            output_dir = output_dir or settings.HEATMAP_OUTPUT_DIR

            # Filter on-screen points
            on_screen_points = [
                (p.x, p.y) for p in gaze_points if not p.is_off_screen
            ]

            if not on_screen_points:
                return None

            # Generate heatmap
            heatmap = generate_gaze_heatmap(on_screen_points)

            # Save heatmap
            filename = f"{session_id}_heatmap.png"
            filepath = f"{output_dir}/{filename}"

            save_heatmap(heatmap, filepath)

            # Return URL (in production, this would be a full URL)
            return f"/heatmaps/{filename}"

        except Exception as e:
            logger.error("heatmap_generation_error", error=str(e))
            return None

    def _calculate_risk_score(
        self,
        on_screen_percentage: float,
        patterns_detected: Dict,
        anomalies: List[Dict]
    ) -> float:
        """
        Calculate risk score based on gaze behavior

        Args:
            on_screen_percentage: Percentage of time on-screen
            patterns_detected: Detected patterns
            anomalies: Detected anomalies

        Returns:
            Risk score (0-1)
        """
        risk = 0.0

        # Off-screen percentage risk
        if on_screen_percentage < 70:
            risk += settings.RISK_OFFSCREEN_WEIGHT_SEVERE
        elif on_screen_percentage < 85:
            risk += settings.RISK_OFFSCREEN_WEIGHT_MODERATE

        # Reading pattern risk
        if patterns_detected["reading"]["is_reading"]:
            risk += settings.RISK_READING_WEIGHT

        # Attention drift risk
        if patterns_detected["attention_drift"]["is_drifting"]:
            risk += settings.RISK_DRIFT_WEIGHT

        # Shifty eyes risk
        if patterns_detected["shifty_eyes"]["detected"]:
            risk += settings.RISK_SHIFTY_WEIGHT

        # Anomalies risk
        anomaly_risk = min(
            len(anomalies) * settings.RISK_ANOMALY_WEIGHT_PER_EVENT,
            settings.RISK_ANOMALY_MAX_WEIGHT
        )
        risk += anomaly_risk

        # Clamp to [0, 1]
        return min(risk, 1.0)

    def _identify_risk_factors(
        self,
        on_screen_percentage: float,
        patterns_detected: Dict,
        anomalies: List[Dict]
    ) -> List[Dict]:
        """
        Identify specific risk factors

        Args:
            on_screen_percentage: Percentage of time on-screen
            patterns_detected: Detected patterns
            anomalies: Detected anomalies

        Returns:
            List of risk factor descriptions
        """
        factors = []

        # Off-screen risk
        if on_screen_percentage < 70:
            factors.append({
                "factor": "low_on_screen_percentage",
                "severity": "high",
                "description": f"Only {on_screen_percentage:.1f}% of time spent on-screen",
                "weight": settings.RISK_OFFSCREEN_WEIGHT_SEVERE
            })
        elif on_screen_percentage < 85:
            factors.append({
                "factor": "moderate_on_screen_percentage",
                "severity": "medium",
                "description": f"Only {on_screen_percentage:.1f}% of time spent on-screen",
                "weight": settings.RISK_OFFSCREEN_WEIGHT_MODERATE
            })

        # Reading pattern
        if patterns_detected["reading"]["is_reading"]:
            factors.append({
                "factor": "reading_pattern_detected",
                "severity": "high",
                "description": "Reading pattern suggests external reference material usage",
                "weight": settings.RISK_READING_WEIGHT,
                "details": patterns_detected["reading"]
            })

        # Attention drift
        if patterns_detected["attention_drift"]["is_drifting"]:
            max_drift = patterns_detected["attention_drift"]["max_drift_seconds"]
            factors.append({
                "factor": "attention_drift",
                "severity": "medium",
                "description": f"Attention drifted off-screen for {max_drift:.1f} seconds",
                "weight": settings.RISK_DRIFT_WEIGHT,
                "details": patterns_detected["attention_drift"]
            })

        # Shifty eyes
        if patterns_detected["shifty_eyes"]["detected"]:
            direction = patterns_detected["shifty_eyes"]["direction"]
            count = patterns_detected["shifty_eyes"]["glance_count"]
            factors.append({
                "factor": "shifty_eyes",
                "severity": "medium",
                "description": f"Frequent glances to {direction} ({count} times)",
                "weight": settings.RISK_SHIFTY_WEIGHT,
                "details": patterns_detected["shifty_eyes"]
            })

        # Anomalies
        if anomalies:
            factors.append({
                "factor": "anomalous_gaze_patterns",
                "severity": "medium",
                "description": f"{len(anomalies)} anomalous gaze patterns detected",
                "weight": min(
                    len(anomalies) * settings.RISK_ANOMALY_WEIGHT_PER_EVENT,
                    settings.RISK_ANOMALY_MAX_WEIGHT
                ),
                "details": {
                    "num_anomalies": len(anomalies),
                    "anomaly_types": list(set(a.get("anomaly_type") for a in anomalies))
                }
            })

        return factors

    def _empty_summary(self, session_id: uuid.UUID) -> Dict:
        """
        Generate empty summary for session with no data

        Args:
            session_id: Session ID

        Returns:
            Empty summary dictionary
        """
        return {
            "session_id": str(session_id),
            "total_duration_seconds": 0.0,
            "on_screen_percentage": 0.0,
            "off_screen_events": [],
            "patterns_detected": {
                "reading": False,
                "attention_drift": False,
                "shifty_eyes": {
                    "detected": False,
                    "direction": None
                }
            },
            "anomalies": [],
            "heatmap_url": None,
            "average_confidence": 0.0,
            "risk_score": 0.0,
            "risk_factors": [],
            "statistics": {
                "total_gaze_points": 0,
                "on_screen_points": 0,
                "off_screen_points": 0,
                "num_off_screen_events": 0,
                "num_anomalies": 0
            }
        }
