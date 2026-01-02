"""Filler word detection service for identifying hesitation markers"""

import logging
from typing import Dict, List, Set
import re

from src.config import get_settings
from lib.errors import FillerDetectionError

logger = logging.getLogger(__name__)


class FillerDetectionService:
    """
    Service for detecting filler words and hesitation markers

    Features:
    - Detects um, uh, like, you know, etc.
    - Calculates filler word ratios
    - Identifies unnatural absence of filler words
    """

    def __init__(self):
        self.settings = get_settings()
        self.filler_words = set(self.settings.FILLER_WORDS)

        # Add variations
        self._expand_filler_words()

        logger.info(f"Filler detection service initialized with {len(self.filler_words)} filler patterns")

    def _expand_filler_words(self):
        """Expand filler words to include common variations"""
        expanded = set(self.filler_words)

        # Add plural forms
        for word in list(self.filler_words):
            if not word.endswith('s'):
                expanded.add(word + 's')

        # Add repeated forms (uh uh, um um)
        for word in ['um', 'uh', 'er', 'ah']:
            if word in self.filler_words:
                expanded.add(f"{word} {word}")

        self.filler_words = expanded

    def is_filler_word(self, word: str) -> bool:
        """
        Check if a word is a filler word

        Args:
            word: Word to check

        Returns:
            True if filler word, False otherwise
        """
        # Normalize word
        normalized = word.lower().strip('.,!?\'"')

        return normalized in self.filler_words

    def detect_filler_words(self, words: List[Dict]) -> Dict:
        """
        Detect filler words in transcription

        Args:
            words: List of word dictionaries with 'word', 'start', 'end' fields

        Returns:
            {
                'filler_count': int,
                'filler_ratio': float,       # 0-1
                'filler_instances': [
                    {
                        'word': str,
                        'timestamp': float,
                        'position': int       # Word position in sequence
                    },
                    ...
                ],
                'filler_types': {
                    'um': int,
                    'uh': int,
                    'like': int,
                    ...
                },
                'total_words': int
            }

        Raises:
            FillerDetectionError: If detection fails
        """
        try:
            if not words:
                return {
                    'filler_count': 0,
                    'filler_ratio': 0.0,
                    'filler_instances': [],
                    'filler_types': {},
                    'total_words': 0
                }

            filler_count = 0
            filler_instances = []
            filler_types = {}

            for i, word_data in enumerate(words):
                word = word_data.get('word', '')
                normalized = word.lower().strip('.,!?\'"')

                if self.is_filler_word(normalized):
                    filler_count += 1

                    # Track instance
                    filler_instances.append({
                        'word': word,
                        'timestamp': word_data.get('start', 0.0),
                        'position': i
                    })

                    # Count by type
                    base_filler = self._get_base_filler(normalized)
                    filler_types[base_filler] = filler_types.get(base_filler, 0) + 1

            total_words = len(words)
            filler_ratio = filler_count / total_words if total_words > 0 else 0.0

            result = {
                'filler_count': filler_count,
                'filler_ratio': round(filler_ratio, 4),
                'filler_instances': filler_instances,
                'filler_types': filler_types,
                'total_words': total_words
            }

            logger.info(f"Detected {filler_count} filler words out of {total_words} "
                       f"({filler_ratio*100:.1f}%)")

            return result

        except Exception as e:
            logger.error(f"Filler detection failed: {e}")
            raise FillerDetectionError(
                f"Failed to detect filler words: {str(e)}",
                {"error": str(e)}
            )

    def _get_base_filler(self, normalized: str) -> str:
        """Get base form of filler word"""
        # Map variations to base forms
        base_map = {
            'umm': 'um',
            'ummm': 'um',
            'uhh': 'uh',
            'uhhh': 'uh',
            'err': 'er',
            'ahh': 'ah',
            'yeah': 'yeah',
            'yep': 'yeah',
            'yup': 'yeah',
        }

        return base_map.get(normalized, normalized)

    def analyze_filler_distribution(
        self,
        filler_instances: List[Dict],
        total_duration: float
    ) -> Dict:
        """
        Analyze temporal distribution of filler words

        Args:
            filler_instances: List of filler word instances with timestamps
            total_duration: Total audio duration

        Returns:
            {
                'fillers_per_minute': float,
                'avg_interval': float,      # Average time between fillers
                'clustered': bool,          # Fillers clustered together
                'cluster_score': float      # 0-1, higher = more clustered
            }
        """
        try:
            if not filler_instances:
                return {
                    'fillers_per_minute': 0.0,
                    'avg_interval': 0.0,
                    'clustered': False,
                    'cluster_score': 0.0
                }

            # Calculate fillers per minute
            minutes = total_duration / 60.0
            fillers_per_minute = len(filler_instances) / minutes if minutes > 0 else 0

            # Calculate intervals between fillers
            timestamps = sorted([f['timestamp'] for f in filler_instances])
            intervals = []

            if len(timestamps) > 1:
                intervals = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]
                avg_interval = sum(intervals) / len(intervals)

                # Check for clustering (intervals < 5 seconds)
                short_intervals = [iv for iv in intervals if iv < 5.0]
                cluster_score = len(short_intervals) / len(intervals) if intervals else 0
                clustered = cluster_score > 0.5
            else:
                avg_interval = total_duration
                cluster_score = 0.0
                clustered = False

            result = {
                'fillers_per_minute': round(fillers_per_minute, 2),
                'avg_interval': round(avg_interval, 2),
                'clustered': clustered,
                'cluster_score': round(cluster_score, 2)
            }

            logger.info(f"Filler distribution: {fillers_per_minute:.1f} per minute, "
                       f"avg interval {avg_interval:.1f}s, clustered={clustered}")

            return result

        except Exception as e:
            logger.error(f"Failed to analyze filler distribution: {e}")
            raise FillerDetectionError(
                f"Failed to analyze distribution: {str(e)}",
                {"error": str(e)}
            )

    def detect_unnatural_filler_absence(
        self,
        filler_ratio: float,
        speech_duration: float
    ) -> Dict:
        """
        Detect unnaturally low filler word usage (may indicate reading)

        Args:
            filler_ratio: Ratio of filler words to total words
            speech_duration: Total speech duration in seconds

        Returns:
            {
                'is_unnatural': bool,
                'expected_min_ratio': float,
                'actual_ratio': float,
                'confidence': float  # 0-1
            }
        """
        try:
            # Expected minimum filler ratio for natural speech
            # Longer speeches tend to have more fillers
            if speech_duration < 30:
                expected_min = 0.005  # 0.5% for short answers
            elif speech_duration < 120:
                expected_min = 0.01   # 1% for medium answers
            else:
                expected_min = 0.02   # 2% for long answers

            is_unnatural = filler_ratio < expected_min

            # Calculate confidence based on how far below expected
            if filler_ratio == 0:
                confidence = 1.0
            else:
                ratio_diff = (expected_min - filler_ratio) / expected_min
                confidence = max(0, min(1, ratio_diff))

            result = {
                'is_unnatural': is_unnatural,
                'expected_min_ratio': expected_min,
                'actual_ratio': filler_ratio,
                'confidence': round(confidence, 2)
            }

            logger.info(f"Filler absence check: unnatural={is_unnatural}, "
                       f"expected≥{expected_min:.3f}, actual={filler_ratio:.3f}")

            return result

        except Exception as e:
            logger.error(f"Failed to detect filler absence: {e}")
            raise FillerDetectionError(
                f"Failed to detect filler absence: {str(e)}",
                {"error": str(e)}
            )

    def detect_excessive_fillers(
        self,
        filler_ratio: float
    ) -> Dict:
        """
        Detect excessive filler word usage (nervousness or thinking)

        Args:
            filler_ratio: Ratio of filler words to total words

        Returns:
            {
                'is_excessive': bool,
                'severity': str,  # 'normal', 'moderate', 'high', 'very_high'
                'threshold': float
            }
        """
        try:
            threshold = self.settings.HIGH_FILLER_THRESHOLD

            is_excessive = filler_ratio > threshold

            # Categorize severity
            if filler_ratio < 0.05:
                severity = 'normal'
            elif filler_ratio < 0.10:
                severity = 'moderate'
            elif filler_ratio < 0.20:
                severity = 'high'
            else:
                severity = 'very_high'

            result = {
                'is_excessive': is_excessive,
                'severity': severity,
                'threshold': threshold
            }

            logger.info(f"Excessive filler check: excessive={is_excessive}, "
                       f"severity={severity}, ratio={filler_ratio:.3f}")

            return result

        except Exception as e:
            logger.error(f"Failed to detect excessive fillers: {e}")
            raise FillerDetectionError(
                f"Failed to detect excessive fillers: {str(e)}",
                {"error": str(e)}
            )
