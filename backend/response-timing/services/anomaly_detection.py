"""Anomaly detection service for identifying suspicious timing patterns"""

import logging
from typing import Dict
import numpy as np

from src.config import get_settings
from lib.errors import AnomalyDetectionError

logger = logging.getLogger(__name__)


class AnomalyDetectionService:
    """
    Service for detecting timing anomalies that may indicate cheating

    Detects:
    - Instant responses (pre-prepared answers)
    - Unnatural consistency (AI-generated speech read aloud)
    - Delayed then fluent (reading prepared answer)
    - Robotic speech patterns (TTS or scripted)
    """

    def __init__(self):
        self.settings = get_settings()
        logger.info("Anomaly detection service initialized")

    def detect_all_anomalies(
        self,
        timing_metrics: Dict,
        latency_eval: Dict,
        pause_patterns: Dict,
        filler_analysis: Dict,
        difficulty: str
    ) -> Dict:
        """
        Detect all timing anomalies

        Args:
            timing_metrics: Speech rate, pause metrics, etc.
            latency_eval: Response latency evaluation
            pause_patterns: Pause pattern analysis
            filler_analysis: Filler word analysis
            difficulty: Question difficulty

        Returns:
            {
                'instant_response': bool,
                'unnatural_consistency': bool,
                'delayed_then_fluent': bool,
                'robotic_speech_pattern': bool,
                'no_fillers': bool,
                'excessive_speed': bool,
                'anomaly_count': int,
                'details': {...}
            }

        Raises:
            AnomalyDetectionError: If detection fails
        """
        try:
            anomalies = {}

            # 1. Instant Response Detection
            instant_response = self.detect_instant_response(
                latency_eval,
                difficulty
            )
            anomalies['instant_response'] = instant_response['is_anomaly']

            # 2. Unnatural Consistency Detection
            unnatural_consistency = self.detect_unnatural_consistency(
                pause_patterns,
                timing_metrics
            )
            anomalies['unnatural_consistency'] = unnatural_consistency['is_anomaly']

            # 3. Delayed Then Fluent Detection
            delayed_fluent = self.detect_delayed_then_fluent(
                latency_eval,
                filler_analysis,
                pause_patterns
            )
            anomalies['delayed_then_fluent'] = delayed_fluent['is_anomaly']

            # 4. Robotic Speech Pattern Detection
            robotic_pattern = self.detect_robotic_speech_pattern(
                timing_metrics,
                filler_analysis,
                pause_patterns
            )
            anomalies['robotic_speech_pattern'] = robotic_pattern['is_anomaly']

            # 5. No Fillers Detection
            no_fillers = self.detect_no_fillers(
                filler_analysis
            )
            anomalies['no_fillers'] = no_fillers['is_anomaly']

            # 6. Excessive Speed Detection
            excessive_speed = self.detect_excessive_speed(
                timing_metrics
            )
            anomalies['excessive_speed'] = excessive_speed['is_anomaly']

            # Count anomalies
            anomaly_count = sum([
                anomalies['instant_response'],
                anomalies['unnatural_consistency'],
                anomalies['delayed_then_fluent'],
                anomalies['robotic_speech_pattern'],
                anomalies['no_fillers'],
                anomalies['excessive_speed']
            ])

            # Compile details
            details = {
                'instant_response': instant_response,
                'unnatural_consistency': unnatural_consistency,
                'delayed_then_fluent': delayed_fluent,
                'robotic_speech_pattern': robotic_pattern,
                'no_fillers': no_fillers,
                'excessive_speed': excessive_speed
            }

            result = {
                **anomalies,
                'anomaly_count': anomaly_count,
                'details': details
            }

            logger.info(f"Anomaly detection complete: {anomaly_count} anomalies found")

            return result

        except Exception as e:
            logger.error(f"Anomaly detection failed: {e}")
            raise AnomalyDetectionError(
                f"Failed to detect anomalies: {str(e)}",
                {"error": str(e)}
            )

    def detect_instant_response(
        self,
        latency_eval: Dict,
        difficulty: str
    ) -> Dict:
        """
        Detect suspiciously fast responses

        Complex questions answered instantly may indicate pre-prepared answers
        """
        try:
            is_instant = latency_eval.get('is_instant', False)
            latency_ratio = latency_eval.get('latency_ratio', 1.0)

            # Additional check: very complex questions need thinking time
            if difficulty in ['complex', 'hard', 'expert']:
                # <25% of expected time is highly suspicious
                very_instant = latency_ratio < 0.25
            else:
                very_instant = is_instant

            return {
                'is_anomaly': very_instant or is_instant,
                'latency_ratio': latency_ratio,
                'severity': 'high' if very_instant else 'medium' if is_instant else 'low',
                'description': (
                    f"Response was {latency_ratio*100:.0f}% of expected latency "
                    f"for {difficulty} question"
                )
            }

        except Exception as e:
            logger.error(f"Instant response detection failed: {e}")
            return {'is_anomaly': False, 'error': str(e)}

    def detect_unnatural_consistency(
        self,
        pause_patterns: Dict,
        timing_metrics: Dict
    ) -> Dict:
        """
        Detect unnatural consistency in timing patterns

        AI-generated speech read aloud has very consistent pauses and pacing
        """
        try:
            consistency_score = pause_patterns.get('consistency_score', 0.0)
            pause_std = timing_metrics.get('pause_duration_std', 0.0)

            # High consistency (low variation) is suspicious
            is_unnatural = (
                consistency_score > self.settings.UNNATURAL_CONSISTENCY_THRESHOLD or
                (pause_std < 0.1 and timing_metrics.get('pause_count', 0) > 2)
            )

            return {
                'is_anomaly': is_unnatural,
                'consistency_score': consistency_score,
                'pause_std': pause_std,
                'severity': 'high' if consistency_score > 0.9 else 'medium' if is_unnatural else 'low',
                'description': (
                    f"Pause pattern consistency score: {consistency_score:.2f} "
                    f"(threshold: {self.settings.UNNATURAL_CONSISTENCY_THRESHOLD})"
                )
            }

        except Exception as e:
            logger.error(f"Unnatural consistency detection failed: {e}")
            return {'is_anomaly': False, 'error': str(e)}

    def detect_delayed_then_fluent(
        self,
        latency_eval: Dict,
        filler_analysis: Dict,
        pause_patterns: Dict
    ) -> Dict:
        """
        Detect pattern: long delay before answering, then very fluent response

        This suggests reading a pre-written answer (human or AI-generated)
        Uses weighted scoring instead of boolean AND for more nuanced detection.
        """
        try:
            latency_ratio = latency_eval.get('latency_ratio', 1.0)
            filler_ratio = filler_analysis.get('filler_ratio', 0.0)
            pause_percentage = pause_patterns.get('pause_percentage', 0.0)

            # Calculate weighted score for each indicator
            # Delay score: higher when latency_ratio > 2.0 (delayed)
            delay_score = min(1.0, max(0.0, (latency_ratio - 1.0) / 2.0)) if latency_ratio > 1.0 else 0.0

            # Fluency score: higher when filler_ratio is low
            fluency_score = max(0.0, 1.0 - (filler_ratio / self.settings.LOW_FILLER_THRESHOLD)) if filler_ratio < self.settings.LOW_FILLER_THRESHOLD else 0.0

            # Minimal pauses score: higher when pause_percentage is low
            pause_score = max(0.0, 1.0 - (pause_percentage / self.settings.PAUSE_PERCENTAGE_THRESHOLD)) if pause_percentage < self.settings.PAUSE_PERCENTAGE_THRESHOLD else 0.0

            # Weighted combination (weights sum to 1.0)
            delay_weight = 0.4
            fluency_weight = 0.35
            pause_weight = 0.25

            combined_score = (
                delay_weight * delay_score +
                fluency_weight * fluency_score +
                pause_weight * pause_score
            )

            # Threshold for anomaly detection
            is_anomaly = combined_score >= 0.6

            # Determine severity based on combined score
            if combined_score >= 0.8:
                severity = 'high'
            elif combined_score >= 0.6:
                severity = 'medium'
            else:
                severity = 'low'

            return {
                'is_anomaly': is_anomaly,
                'combined_score': round(combined_score, 3),
                'delay_score': round(delay_score, 3),
                'fluency_score': round(fluency_score, 3),
                'pause_score': round(pause_score, 3),
                'latency_ratio': latency_ratio,
                'filler_ratio': filler_ratio,
                'pause_percentage': pause_percentage,
                'severity': severity,
                'description': (
                    f"Delayed-then-fluent score: {combined_score:.2f} "
                    f"(delay={delay_score:.2f}, fluency={fluency_score:.2f}, pause={pause_score:.2f})"
                )
            }

        except Exception as e:
            logger.error(f"Delayed-then-fluent detection failed: {e}")
            return {'is_anomaly': False, 'error': str(e)}

    def detect_robotic_speech_pattern(
        self,
        timing_metrics: Dict,
        filler_analysis: Dict,
        pause_patterns: Dict
    ) -> Dict:
        """
        Detect robotic/TTS-like speech patterns

        Characteristics:
        - Consistent WPM in normal range
        - Minimal pauses
        - No or very few filler words
        - Regular pause intervals
        """
        try:
            wpm = timing_metrics.get('speech_rate_wpm', 0)
            filler_ratio = filler_analysis.get('filler_ratio', 0.0)
            pause_percentage = timing_metrics.get('pause_percentage', 0.0)
            regular_spacing = pause_patterns.get('regular_spacing', False)
            uniform_duration = pause_patterns.get('uniform_duration', False)

            # Check if WPM in normal range (AI TTS is usually 140-160 WPM)
            in_normal_range = (
                self.settings.SPEECH_RATE_NORMAL_MIN <= wpm <= self.settings.SPEECH_RATE_NORMAL_MAX
            )

            # Robotic pattern indicators
            minimal_fillers = filler_ratio < 0.02  # <2%
            minimal_pauses = pause_percentage < 10.0
            regular_patterns = regular_spacing or uniform_duration

            # Combine indicators
            is_robotic = (
                in_normal_range and
                minimal_fillers and
                minimal_pauses and
                regular_patterns
            )

            return {
                'is_anomaly': is_robotic,
                'wpm': wpm,
                'in_normal_range': in_normal_range,
                'minimal_fillers': minimal_fillers,
                'minimal_pauses': minimal_pauses,
                'regular_patterns': regular_patterns,
                'severity': 'high' if is_robotic else 'low',
                'description': (
                    f"Speech pattern: {wpm:.0f} WPM, {filler_ratio*100:.1f}% fillers, "
                    f"{pause_percentage:.1f}% pauses, regular={regular_patterns}"
                )
            }

        except Exception as e:
            logger.error(f"Robotic pattern detection failed: {e}")
            return {'is_anomaly': False, 'error': str(e)}

    def detect_no_fillers(
        self,
        filler_analysis: Dict
    ) -> Dict:
        """
        Detect complete or near-complete absence of filler words

        Natural speech almost always contains some filler words
        """
        try:
            filler_ratio = filler_analysis.get('filler_ratio', 0.0)
            total_words = filler_analysis.get('total_words', 0)

            # Anomaly if <1% fillers and sufficient sample size
            is_anomaly = (
                filler_ratio < self.settings.LOW_FILLER_THRESHOLD and
                total_words > 50  # Only flag if enough words to expect fillers
            )

            return {
                'is_anomaly': is_anomaly,
                'filler_ratio': filler_ratio,
                'total_words': total_words,
                'severity': 'medium' if is_anomaly else 'low',
                'description': (
                    f"Filler word ratio: {filler_ratio*100:.2f}% "
                    f"({total_words} total words)"
                )
            }

        except Exception as e:
            logger.error(f"No fillers detection failed: {e}")
            return {'is_anomaly': False, 'error': str(e)}

    def detect_excessive_speed(
        self,
        timing_metrics: Dict
    ) -> Dict:
        """
        Detect unusually fast speech (>200 WPM)

        Very fast speech suggests reading rather than spontaneous speaking
        """
        try:
            wpm = timing_metrics.get('speech_rate_wpm', 0)

            # >200 WPM is typical of reading aloud
            is_excessive = wpm > self.settings.SPEECH_RATE_FAST

            return {
                'is_anomaly': is_excessive,
                'wpm': wpm,
                'threshold': self.settings.SPEECH_RATE_FAST,
                'severity': 'high' if wpm > 250 else 'medium' if is_excessive else 'low',
                'description': (
                    f"Speech rate: {wpm:.0f} WPM "
                    f"(threshold: {self.settings.SPEECH_RATE_FAST} WPM)"
                )
            }

        except Exception as e:
            logger.error(f"Excessive speed detection failed: {e}")
            return {'is_anomaly': False, 'error': str(e)}

    def calculate_risk_score(self, anomalies: Dict) -> Dict:
        """
        Calculate overall risk score based on detected anomalies

        Args:
            anomalies: Dictionary of detected anomalies

        Returns:
            {
                'risk_score': float,  # 0-1
                'risk_level': str,    # 'low', 'medium', 'high', 'critical'
                'contributing_factors': [str],
                'recommendation': str
            }
        """
        try:
            risk = 0.0
            factors = []

            # Get raw weights from settings
            raw_weights = {
                'instant_response': self.settings.RISK_WEIGHT_INSTANT_RESPONSE,
                'unnatural_consistency': self.settings.RISK_WEIGHT_UNNATURAL_CONSISTENCY,
                'delayed_then_fluent': self.settings.RISK_WEIGHT_DELAYED_FLUENT,
                'robotic_speech_pattern': self.settings.RISK_WEIGHT_ROBOTIC_PATTERN,
                'no_fillers': self.settings.RISK_WEIGHT_LOW_FILLER,
                'excessive_speed': self.settings.RISK_WEIGHT_HIGH_SPEED,
            }

            # Normalize weights to sum to 1.0
            total_weight = sum(raw_weights.values())
            normalized_weights = {k: v / total_weight for k, v in raw_weights.items()}

            # Instant response
            if anomalies.get('instant_response', False):
                risk += normalized_weights['instant_response']
                factors.append("Instant response to complex question")

            # Unnatural consistency
            if anomalies.get('unnatural_consistency', False):
                risk += normalized_weights['unnatural_consistency']
                factors.append("Unnatural consistency in pause patterns")

            # Delayed then fluent
            if anomalies.get('delayed_then_fluent', False):
                risk += normalized_weights['delayed_then_fluent']
                factors.append("Delayed response followed by fluent speech")

            # Robotic pattern
            if anomalies.get('robotic_speech_pattern', False):
                risk += normalized_weights['robotic_speech_pattern']
                factors.append("Robotic or TTS-like speech pattern")

            # No fillers
            if anomalies.get('no_fillers', False):
                risk += normalized_weights['no_fillers']
                factors.append("Absence of natural filler words")

            # Excessive speed
            if anomalies.get('excessive_speed', False):
                risk += normalized_weights['excessive_speed']
                factors.append("Excessive speech rate (reading)")

            # Risk is already bounded 0-1 due to normalized weights
            risk = min(risk, 1.0)

            # Determine risk level
            if risk < 0.25:
                risk_level = 'low'
                recommendation = "Timing patterns appear natural"
            elif risk < 0.50:
                risk_level = 'medium'
                recommendation = "Some timing anomalies detected - review recommended"
            elif risk < 0.75:
                risk_level = 'high'
                recommendation = "Multiple timing anomalies detected - manual review required"
            else:
                risk_level = 'critical'
                recommendation = "Severe timing anomalies - likely AI-assisted or pre-prepared response"

            result = {
                'risk_score': round(risk, 4),
                'risk_level': risk_level,
                'contributing_factors': factors,
                'recommendation': recommendation
            }

            logger.info(f"Risk score: {risk:.4f} ({risk_level}), factors: {len(factors)}")

            return result

        except Exception as e:
            logger.error(f"Risk score calculation failed: {e}")
            raise AnomalyDetectionError(
                f"Failed to calculate risk score: {str(e)}",
                {"error": str(e)}
            )
