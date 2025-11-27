"""Audio processing service for normalization and format conversion"""

import logging
import os
import tempfile
from typing import Optional, Tuple
from pydub import AudioSegment
import librosa
import soundfile as sf

from src.config import get_settings
from lib.errors import AudioProcessingError

logger = logging.getLogger(__name__)


class AudioProcessingService:
    """
    Service for audio file processing and normalization

    Features:
    - Format conversion (mp3, wav, m4a, etc.)
    - Audio normalization
    - Sample rate conversion
    - Duration extraction
    """

    def __init__(self):
        self.settings = get_settings()
        logger.info("Audio processing service initialized")

    async def process_audio(
        self,
        input_path: str,
        normalize: bool = True,
        target_sample_rate: Optional[int] = None
    ) -> str:
        """
        Process audio file: normalize and convert to standard format

        Args:
            input_path: Path to input audio file
            normalize: Whether to normalize audio levels
            target_sample_rate: Target sample rate (default: 16kHz)

        Returns:
            Path to processed audio file (WAV format)

        Raises:
            AudioProcessingError: If processing fails
        """
        if not os.path.exists(input_path):
            raise AudioProcessingError(
                f"Audio file not found: {input_path}",
                {"path": input_path}
            )

        target_sample_rate = target_sample_rate or self.settings.AUDIO_SAMPLE_RATE

        try:
            # Create temporary output file
            output_fd, output_path = tempfile.mkstemp(suffix='.wav')
            os.close(output_fd)

            # Load audio
            logger.info(f"Loading audio from {input_path}")
            audio = AudioSegment.from_file(input_path)

            # Normalize audio levels
            if normalize:
                logger.info("Normalizing audio")
                audio = self._normalize_audio(audio)

            # Convert to mono
            if audio.channels > 1:
                logger.info("Converting to mono")
                audio = audio.set_channels(1)

            # Resample
            if audio.frame_rate != target_sample_rate:
                logger.info(f"Resampling from {audio.frame_rate}Hz to {target_sample_rate}Hz")
                audio = audio.set_frame_rate(target_sample_rate)

            # Export as WAV
            audio.export(output_path, format='wav')
            logger.info(f"Audio processed and saved to {output_path}")

            return output_path

        except Exception as e:
            logger.error(f"Audio processing failed: {e}")
            raise AudioProcessingError(
                f"Failed to process audio: {str(e)}",
                {"path": input_path, "error": str(e)}
            )

    def _normalize_audio(self, audio: AudioSegment, target_dBFS: float = -20.0) -> AudioSegment:
        """
        Normalize audio to target dBFS level

        Args:
            audio: AudioSegment to normalize
            target_dBFS: Target loudness level in dBFS

        Returns:
            Normalized AudioSegment
        """
        # Calculate change needed
        change_in_dBFS = target_dBFS - audio.dBFS

        # Apply normalization
        return audio.apply_gain(change_in_dBFS)

    async def get_audio_duration(self, audio_path: str) -> float:
        """
        Get audio duration in seconds

        Args:
            audio_path: Path to audio file

        Returns:
            Duration in seconds

        Raises:
            AudioProcessingError: If reading fails
        """
        try:
            audio = AudioSegment.from_file(audio_path)
            duration = len(audio) / 1000.0  # Convert ms to seconds
            logger.info(f"Audio duration: {duration:.2f}s")
            return duration

        except Exception as e:
            logger.error(f"Failed to get audio duration: {e}")
            raise AudioProcessingError(
                f"Failed to get audio duration: {str(e)}",
                {"path": audio_path, "error": str(e)}
            )

    async def load_audio_for_analysis(
        self,
        audio_path: str,
        sample_rate: Optional[int] = None
    ) -> Tuple[any, int]:
        """
        Load audio file for analysis using librosa

        Args:
            audio_path: Path to audio file
            sample_rate: Target sample rate

        Returns:
            Tuple of (audio_data, sample_rate)

        Raises:
            AudioProcessingError: If loading fails
        """
        sample_rate = sample_rate or self.settings.AUDIO_SAMPLE_RATE

        try:
            logger.info(f"Loading audio for analysis: {audio_path}")
            y, sr = librosa.load(audio_path, sr=sample_rate, mono=True)
            logger.info(f"Audio loaded: {len(y)} samples at {sr}Hz")
            return y, sr

        except Exception as e:
            logger.error(f"Failed to load audio for analysis: {e}")
            raise AudioProcessingError(
                f"Failed to load audio: {str(e)}",
                {"path": audio_path, "error": str(e)}
            )

    async def validate_audio_file(self, audio_path: str) -> bool:
        """
        Validate audio file format and size

        Args:
            audio_path: Path to audio file

        Returns:
            True if valid, raises exception otherwise

        Raises:
            AudioProcessingError: If validation fails
        """
        # Check file exists
        if not os.path.exists(audio_path):
            raise AudioProcessingError(
                f"Audio file not found: {audio_path}",
                {"path": audio_path}
            )

        # Check file size
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        if file_size_mb > self.settings.AUDIO_MAX_SIZE_MB:
            raise AudioProcessingError(
                f"Audio file too large: {file_size_mb:.2f}MB (max: {self.settings.AUDIO_MAX_SIZE_MB}MB)",
                {"path": audio_path, "size_mb": file_size_mb}
            )

        # Check file format
        file_ext = os.path.splitext(audio_path)[1].lower().lstrip('.')
        if file_ext not in self.settings.AUDIO_FORMATS:
            raise AudioProcessingError(
                f"Unsupported audio format: {file_ext}",
                {"path": audio_path, "format": file_ext, "supported": self.settings.AUDIO_FORMATS}
            )

        # Try to load file
        try:
            audio = AudioSegment.from_file(audio_path)
            duration = len(audio) / 1000.0

            if duration == 0:
                raise AudioProcessingError(
                    "Audio file is empty (0 duration)",
                    {"path": audio_path}
                )

            logger.info(f"Audio file validated: {file_size_mb:.2f}MB, {duration:.2f}s")
            return True

        except Exception as e:
            raise AudioProcessingError(
                f"Invalid audio file: {str(e)}",
                {"path": audio_path, "error": str(e)}
            )

    async def convert_to_wav(self, input_path: str, output_path: Optional[str] = None) -> str:
        """
        Convert audio file to WAV format

        Args:
            input_path: Path to input audio file
            output_path: Optional output path (temp file if not provided)

        Returns:
            Path to WAV file

        Raises:
            AudioProcessingError: If conversion fails
        """
        try:
            if output_path is None:
                output_fd, output_path = tempfile.mkstemp(suffix='.wav')
                os.close(output_fd)

            audio = AudioSegment.from_file(input_path)
            audio.export(output_path, format='wav')

            logger.info(f"Audio converted to WAV: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"WAV conversion failed: {e}")
            raise AudioProcessingError(
                f"Failed to convert to WAV: {str(e)}",
                {"input_path": input_path, "error": str(e)}
            )
