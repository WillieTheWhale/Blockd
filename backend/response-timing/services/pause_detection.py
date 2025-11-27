"""Pause detection service for identifying silence and pauses in audio"""

import logging
from typing import Dict, List, Tuple
import numpy as np
import librosa

from src.config import get_settings
from lib.errors import PauseDetectionError

logger = logging.getLogger(__name__)


class PauseDetectionService:
    """
    Service for detecting pauses and silence in audio

    Features:
    - Energy-based silence detection
    - Pause frequency and duration analysis
    - Natural vs artificial pause pattern detection
    """

    def __init__(self):
        self.settings = get_settings()
        logger.info("Pause detection service initialized")

    async def detect_pauses(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        threshold_db: float = None,
        min_silence_duration: float = None
    ) -> List[Dict]:
        """
        Detect pauses/silence in audio using energy-based method

        Args:
            audio_data: Audio signal as numpy array
            sample_rate: Sample rate in Hz
            threshold_db: Energy threshold in dB (default: -40dB)
            min_silence_duration: Minimum silence duration in seconds (default: 0.5s)

        Returns:
            List of pause dictionaries:
            [
                {
                    'start': float,      # Start time in seconds
                    'end': float,        # End time in seconds
                    'duration': float,   # Duration in seconds
                    'energy_db': float   # Average energy during pause
                },
                ...
            ]

        Raises:
            PauseDetectionError: If detection fails
        """
        threshold_db = threshold_db or self.settings.SILENCE_THRESHOLD_DB
        min_silence_duration = min_silence_duration or self.settings.MIN_SILENCE_DURATION

        try:
            logger.info(f"Detecting pauses (threshold: {threshold_db}dB, min_duration: {min_silence_duration}s)")

            # Calculate frame parameters
            frame_length = 2048
            hop_length = 512

            # Calculate RMS energy
            energy = librosa.feature.rms(
                y=audio_data,
                frame_length=frame_length,
                hop_length=hop_length
            )[0]

            # Convert to dB
            energy_db = librosa.amplitude_to_db(energy, ref=np.max(energy))

            # Find silence frames (below threshold)
            silence_frames = energy_db < threshold_db

            # Convert frame indices to time
            times = librosa.frames_to_time(
                np.arange(len(silence_frames)),
                sr=sample_rate,
                hop_length=hop_length
            )

            # Group consecutive silence frames into pauses
            pauses = self._group_silence_frames(
                silence_frames,
                times,
                energy_db,
                min_silence_duration
            )

            logger.info(f"Detected {len(pauses)} pauses")

            return pauses

        except Exception as e:
            logger.error(f"Pause detection failed: {e}")
            raise PauseDetectionError(
                f"Failed to detect pauses: {str(e)}",
                {"error": str(e)}
            )

    def _group_silence_frames(
        self,
        silence_frames: np.ndarray,
        times: np.ndarray,
        energy_db: np.ndarray,
        min_duration: float
    ) -> List[Dict]:
        """
        Group consecutive silence frames into pause events

        Args:
            silence_frames: Boolean array indicating silence
            times: Time array for each frame
            energy_db: Energy values in dB
            min_duration: Minimum pause duration

        Returns:
            List of pause dictionaries
        """
        pauses = []
        in_pause = False
        pause_start = None
        pause_start_idx = None

        for i, is_silence in enumerate(silence_frames):
            if is_silence and not in_pause:
                # Start of pause
                in_pause = True
                pause_start = times[i]
                pause_start_idx = i

            elif not is_silence and in_pause:
                # End of pause
                pause_end = times[i]
                pause_duration = pause_end - pause_start

                # Only include if meets minimum duration
                if pause_duration >= min_duration:
                    # Calculate average energy during pause
                    avg_energy = np.mean(energy_db[pause_start_idx:i])

                    pauses.append({
                        'start': float(pause_start),
                        'end': float(pause_end),
                        'duration': float(pause_duration),
                        'energy_db': float(avg_energy)
                    })

                in_pause = False

        # Handle pause extending to end of audio
        if in_pause:
            pause_end = times[-1]
            pause_duration = pause_end - pause_start

            if pause_duration >= min_duration:
                avg_energy = np.mean(energy_db[pause_start_idx:])
                pauses.append({
                    'start': float(pause_start),
                    'end': float(pause_end),
                    'duration': float(pause_duration),
                    'energy_db': float(avg_energy)
                })

        return pauses

    def calculate_pause_metrics(
        self,
        pauses: List[Dict],
        total_duration: float
    ) -> Dict:
        """
        Calculate pause statistics

        Args:
            pauses: List of pause dictionaries
            total_duration: Total audio duration

        Returns:
            {
                'pause_count': int,
                'total_pause_time': float,
                'avg_pause_duration': float,
                'median_pause_duration': float,
                'pause_percentage': float,
                'pause_frequency': float,  # pauses per minute
                'min_pause_duration': float,
                'max_pause_duration': float,
                'pause_duration_std': float
            }

        Raises:
            PauseDetectionError: If calculation fails
        """
        try:
            if not pauses:
                return {
                    'pause_count': 0,
                    'total_pause_time': 0.0,
                    'avg_pause_duration': 0.0,
                    'median_pause_duration': 0.0,
                    'pause_percentage': 0.0,
                    'pause_frequency': 0.0,
                    'min_pause_duration': 0.0,
                    'max_pause_duration': 0.0,
                    'pause_duration_std': 0.0
                }

            pause_durations = [p['duration'] for p in pauses]
            total_pause_time = sum(pause_durations)

            metrics = {
                'pause_count': len(pauses),
                'total_pause_time': round(total_pause_time, 2),
                'avg_pause_duration': round(np.mean(pause_durations), 2),
                'median_pause_duration': round(np.median(pause_durations), 2),
                'pause_percentage': round((total_pause_time / total_duration * 100), 2) if total_duration > 0 else 0.0,
                'pause_frequency': round((len(pauses) / (total_duration / 60)), 2) if total_duration > 0 else 0.0,
                'min_pause_duration': round(min(pause_durations), 2),
                'max_pause_duration': round(max(pause_durations), 2),
                'pause_duration_std': round(np.std(pause_durations), 2)
            }

            logger.info(f"Pause metrics: {metrics['pause_count']} pauses, "
                       f"{metrics['pause_percentage']:.1f}% of total time, "
                       f"avg {metrics['avg_pause_duration']:.2f}s")

            return metrics

        except Exception as e:
            logger.error(f"Failed to calculate pause metrics: {e}")
            raise PauseDetectionError(
                f"Failed to calculate metrics: {str(e)}",
                {"error": str(e)}
            )

    def detect_unnatural_pause_patterns(
        self,
        pauses: List[Dict]
    ) -> Dict:
        """
        Detect unnatural pause patterns that may indicate AI-generated speech

        Args:
            pauses: List of pause dictionaries

        Returns:
            {
                'is_unnatural': bool,
                'consistency_score': float,  # 0-1, higher = more consistent (less natural)
                'regular_spacing': bool,     # Pauses at regular intervals
                'uniform_duration': bool     # Similar pause durations
            }
        """
        try:
            if len(pauses) < 3:
                return {
                    'is_unnatural': False,
                    'consistency_score': 0.0,
                    'regular_spacing': False,
                    'uniform_duration': False
                }

            pause_durations = [p['duration'] for p in pauses]
            pause_starts = [p['start'] for p in pauses]

            # Calculate coefficient of variation for durations
            mean_duration = np.mean(pause_durations)
            std_duration = np.std(pause_durations)
            cv_duration = std_duration / mean_duration if mean_duration > 0 else 0

            # Check if durations are too uniform (CV < 0.2 is suspicious)
            uniform_duration = cv_duration < 0.2

            # Calculate spacing between pauses
            if len(pause_starts) > 1:
                spacings = np.diff(pause_starts)
                mean_spacing = np.mean(spacings)
                std_spacing = np.std(spacings)
                cv_spacing = std_spacing / mean_spacing if mean_spacing > 0 else 0

                # Check if spacing is too regular (CV < 0.3 is suspicious)
                regular_spacing = cv_spacing < 0.3
            else:
                regular_spacing = False

            # Calculate overall consistency score
            consistency_score = 1.0 - min(cv_duration, 1.0)

            # Determine if unnatural
            is_unnatural = (
                consistency_score > self.settings.UNNATURAL_CONSISTENCY_THRESHOLD or
                (uniform_duration and regular_spacing)
            )

            result = {
                'is_unnatural': is_unnatural,
                'consistency_score': round(consistency_score, 3),
                'regular_spacing': regular_spacing,
                'uniform_duration': uniform_duration
            }

            logger.info(f"Pause pattern analysis: unnatural={is_unnatural}, "
                       f"consistency={consistency_score:.3f}, "
                       f"regular_spacing={regular_spacing}, uniform_duration={uniform_duration}")

            return result

        except Exception as e:
            logger.error(f"Failed to detect unnatural patterns: {e}")
            raise PauseDetectionError(
                f"Failed to detect unnatural patterns: {str(e)}",
                {"error": str(e)}
            )

    def filter_short_pauses(
        self,
        pauses: List[Dict],
        min_duration: float = None
    ) -> List[Dict]:
        """
        Filter out very short pauses (breathing, etc.)

        Args:
            pauses: List of pause dictionaries
            min_duration: Minimum pause duration (default: 0.3s)

        Returns:
            Filtered list of pauses
        """
        min_duration = min_duration or self.settings.MIN_PAUSE_DURATION
        filtered = [p for p in pauses if p['duration'] >= min_duration]

        logger.info(f"Filtered pauses: {len(pauses)} -> {len(filtered)} (min duration: {min_duration}s)")

        return filtered
