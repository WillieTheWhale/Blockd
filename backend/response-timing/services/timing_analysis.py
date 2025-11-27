"""Timing analysis service for response latency and speech rate calculation"""

import logging
from datetime import datetime
from typing import Dict, List, Optional
import numpy as np

from src.config import get_settings, get_expected_latency
from lib.errors import TimingAnalysisError

logger = logging.getLogger(__name__)


class TimingAnalysisService:
    """
    Service for analyzing response timing metrics

    Features:
    - Response latency calculation
    - Speech rate (WPM) calculation
    - Speech duration vs pause duration
    - Timing pattern analysis
    """

    def __init__(self):
        self.settings = get_settings()
        logger.info("Timing analysis service initialized")

    def calculate_response_latency(
        self,
        question_asked_at: datetime,
        answer_start_timestamp: datetime
    ) -> int:
        """
        Calculate time between question asked and answer start

        Args:
            question_asked_at: When question was asked
            answer_start_timestamp: When answer started

        Returns:
            Latency in milliseconds

        Raises:
            TimingAnalysisError: If timestamps are invalid
        """
        try:
            if answer_start_timestamp < question_asked_at:
                raise TimingAnalysisError(
                    "Answer timestamp before question timestamp",
                    {
                        "question_asked_at": question_asked_at.isoformat(),
                        "answer_start_timestamp": answer_start_timestamp.isoformat()
                    }
                )

            latency_seconds = (answer_start_timestamp - question_asked_at).total_seconds()
            latency_ms = int(latency_seconds * 1000)

            logger.info(f"Response latency: {latency_ms}ms")
            return latency_ms

        except Exception as e:
            logger.error(f"Failed to calculate response latency: {e}")
            raise TimingAnalysisError(
                f"Failed to calculate latency: {str(e)}",
                {"error": str(e)}
            )

    def calculate_speech_rate(
        self,
        words: List[Dict],
        speech_duration_seconds: float,
        exclude_fillers: bool = True
    ) -> float:
        """
        Calculate words per minute (WPM)

        Args:
            words: List of word dictionaries with timestamps
            speech_duration_seconds: Total speech duration (excluding pauses)
            exclude_fillers: Whether to exclude filler words from count

        Returns:
            Speech rate in WPM

        Raises:
            TimingAnalysisError: If calculation fails
        """
        try:
            if speech_duration_seconds <= 0:
                logger.warning("Speech duration is zero, cannot calculate WPM")
                return 0.0

            # Filter words
            if exclude_fillers:
                filler_words = set(self.settings.FILLER_WORDS)
                filtered_words = [
                    w for w in words
                    if w.get('word', '').lower().strip('.,!?') not in filler_words
                ]
            else:
                filtered_words = words

            word_count = len(filtered_words)
            minutes = speech_duration_seconds / 60.0

            if minutes == 0:
                return 0.0

            wpm = word_count / minutes

            logger.info(f"Speech rate: {wpm:.1f} WPM ({word_count} words in {speech_duration_seconds:.1f}s)")
            return round(wpm, 1)

        except Exception as e:
            logger.error(f"Failed to calculate speech rate: {e}")
            raise TimingAnalysisError(
                f"Failed to calculate WPM: {str(e)}",
                {"error": str(e)}
            )

    def calculate_speech_duration(
        self,
        words: List[Dict],
        pauses: List[Dict],
        total_duration: float
    ) -> Dict[str, float]:
        """
        Calculate speech duration vs pause duration

        Args:
            words: List of word dictionaries with timestamps
            pauses: List of pause dictionaries with start/end/duration
            total_duration: Total audio duration

        Returns:
            {
                'speech_duration': float,
                'pause_duration': float,
                'speech_percentage': float,
                'pause_percentage': float
            }
        """
        try:
            # Calculate total pause time
            pause_duration = sum(p.get('duration', 0) for p in pauses)

            # Speech duration = total - pauses
            speech_duration = max(0, total_duration - pause_duration)

            # Calculate percentages
            speech_percentage = (speech_duration / total_duration * 100) if total_duration > 0 else 0
            pause_percentage = (pause_duration / total_duration * 100) if total_duration > 0 else 0

            result = {
                'speech_duration': round(speech_duration, 2),
                'pause_duration': round(pause_duration, 2),
                'speech_percentage': round(speech_percentage, 2),
                'pause_percentage': round(pause_percentage, 2)
            }

            logger.info(f"Speech duration: {speech_duration:.2f}s ({speech_percentage:.1f}%), "
                       f"Pause duration: {pause_duration:.2f}s ({pause_percentage:.1f}%)")

            return result

        except Exception as e:
            logger.error(f"Failed to calculate speech duration: {e}")
            raise TimingAnalysisError(
                f"Failed to calculate speech duration: {str(e)}",
                {"error": str(e)}
            )

    def analyze_timing_patterns(
        self,
        words: List[Dict],
        pauses: List[Dict]
    ) -> Dict:
        """
        Analyze timing patterns in speech

        Args:
            words: List of word dictionaries with timestamps
            pauses: List of pause dictionaries

        Returns:
            {
                'word_duration_mean': float,
                'word_duration_std': float,
                'pause_duration_mean': float,
                'pause_duration_std': float,
                'consistency_score': float  # 0-1, lower = more natural variation
            }
        """
        try:
            result = {
                'word_duration_mean': 0.0,
                'word_duration_std': 0.0,
                'pause_duration_mean': 0.0,
                'pause_duration_std': 0.0,
                'consistency_score': 0.0
            }

            # Analyze word durations
            if words:
                word_durations = [
                    w.get('end', 0) - w.get('start', 0)
                    for w in words
                    if w.get('end', 0) > w.get('start', 0)
                ]

                if word_durations:
                    result['word_duration_mean'] = float(np.mean(word_durations))
                    result['word_duration_std'] = float(np.std(word_durations))

            # Analyze pause durations
            if pauses:
                pause_durations = [p.get('duration', 0) for p in pauses if p.get('duration', 0) > 0]

                if pause_durations:
                    result['pause_duration_mean'] = float(np.mean(pause_durations))
                    result['pause_duration_std'] = float(np.std(pause_durations))

            # Calculate consistency score
            # Lower std dev relative to mean = more consistent = less natural
            if result['pause_duration_mean'] > 0:
                coefficient_of_variation = result['pause_duration_std'] / result['pause_duration_mean']
                # Normalize to 0-1, invert so low variation = high consistency score
                result['consistency_score'] = max(0, min(1, 1 - coefficient_of_variation))
            else:
                result['consistency_score'] = 1.0  # Perfect consistency (unnatural)

            logger.info(f"Timing patterns: word_duration={result['word_duration_mean']:.3f}±{result['word_duration_std']:.3f}s, "
                       f"pause_duration={result['pause_duration_mean']:.3f}±{result['pause_duration_std']:.3f}s, "
                       f"consistency={result['consistency_score']:.2f}")

            return result

        except Exception as e:
            logger.error(f"Failed to analyze timing patterns: {e}")
            raise TimingAnalysisError(
                f"Failed to analyze patterns: {str(e)}",
                {"error": str(e)}
            )

    def evaluate_latency_against_baseline(
        self,
        actual_latency_ms: int,
        difficulty: str
    ) -> Dict:
        """
        Evaluate response latency against expected baseline

        Args:
            actual_latency_ms: Actual response latency
            difficulty: Question difficulty level

        Returns:
            {
                'expected_latency_ms': int,
                'actual_latency_ms': int,
                'latency_ratio': float,  # actual / expected
                'is_instant': bool,      # Too fast
                'is_delayed': bool       # Too slow
            }
        """
        try:
            expected_latency = get_expected_latency(difficulty)

            latency_ratio = actual_latency_ms / expected_latency if expected_latency > 0 else 0

            # Check if instant (< 50% of expected)
            is_instant = latency_ratio < self.settings.INSTANT_RESPONSE_THRESHOLD

            # Check if delayed (> 200% of expected)
            is_delayed = latency_ratio > 2.0

            result = {
                'expected_latency_ms': expected_latency,
                'actual_latency_ms': actual_latency_ms,
                'latency_ratio': round(latency_ratio, 2),
                'is_instant': is_instant,
                'is_delayed': is_delayed
            }

            logger.info(f"Latency evaluation: {actual_latency_ms}ms vs {expected_latency}ms "
                       f"(ratio: {latency_ratio:.2f}, instant: {is_instant}, delayed: {is_delayed})")

            return result

        except Exception as e:
            logger.error(f"Failed to evaluate latency: {e}")
            raise TimingAnalysisError(
                f"Failed to evaluate latency: {str(e)}",
                {"error": str(e)}
            )

    def classify_speech_rate(self, wpm: float) -> str:
        """
        Classify speech rate as slow/normal/fast

        Args:
            wpm: Words per minute

        Returns:
            Classification: 'very_slow', 'slow', 'normal', 'fast', 'very_fast'
        """
        if wpm < self.settings.SPEECH_RATE_SLOW:
            return 'very_slow'
        elif wpm < self.settings.SPEECH_RATE_NORMAL_MIN:
            return 'slow'
        elif wpm <= self.settings.SPEECH_RATE_NORMAL_MAX:
            return 'normal'
        elif wpm <= self.settings.SPEECH_RATE_FAST:
            return 'fast'
        else:
            return 'very_fast'
