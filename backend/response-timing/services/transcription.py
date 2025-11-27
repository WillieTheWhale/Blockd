"""Whisper transcription service for speech-to-text conversion"""

import logging
import os
from typing import Dict, List, Optional
import openai
from openai import OpenAI

from src.config import get_settings
from lib.errors import TranscriptionError

logger = logging.getLogger(__name__)


class TranscriptionService:
    """
    Service for transcribing audio using OpenAI Whisper

    Supports both API and local modes:
    - API mode: Uses OpenAI Whisper API (cloud)
    - Local mode: Uses whisper library (self-hosted)
    """

    def __init__(self):
        self.settings = get_settings()
        self.client = None

        if self.settings.WHISPER_MODE == "api":
            if not self.settings.OPENAI_API_KEY:
                raise TranscriptionError(
                    "OPENAI_API_KEY not set for API mode",
                    {"mode": "api"}
                )
            self.client = OpenAI(api_key=self.settings.OPENAI_API_KEY)
            logger.info("Transcription service initialized (API mode)")
        else:
            # Local mode using whisper library
            try:
                import whisper
                self.model = whisper.load_model(self.settings.LOCAL_WHISPER_MODEL)
                logger.info(f"Transcription service initialized (Local mode: {self.settings.LOCAL_WHISPER_MODEL})")
            except ImportError:
                raise TranscriptionError(
                    "whisper library not installed for local mode",
                    {"mode": "local", "solution": "pip install openai-whisper"}
                )

    async def transcribe_audio(self, audio_file_path: str) -> Dict:
        """
        Transcribe audio file to text with word-level timestamps

        Args:
            audio_file_path: Path to audio file

        Returns:
            {
                'text': str,
                'duration': float,
                'words': [{'word': str, 'start': float, 'end': float, 'confidence': float}],
                'language': str,
                'confidence': float
            }

        Raises:
            TranscriptionError: If transcription fails
        """
        if not os.path.exists(audio_file_path):
            raise TranscriptionError(
                f"Audio file not found: {audio_file_path}",
                {"path": audio_file_path}
            )

        try:
            if self.settings.WHISPER_MODE == "api":
                return await self._transcribe_api(audio_file_path)
            else:
                return await self._transcribe_local(audio_file_path)

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise TranscriptionError(
                f"Failed to transcribe audio: {str(e)}",
                {"path": audio_file_path, "error": str(e)}
            )

    async def _transcribe_api(self, audio_file_path: str) -> Dict:
        """Transcribe using OpenAI Whisper API"""
        try:
            with open(audio_file_path, 'rb') as audio_file:
                # Request verbose JSON with word timestamps
                response = self.client.audio.transcriptions.create(
                    model=self.settings.WHISPER_MODEL,
                    file=audio_file,
                    response_format="verbose_json",
                    timestamp_granularities=["word"]
                )

            # Parse response
            result = {
                'text': response.text,
                'duration': response.duration if hasattr(response, 'duration') else 0,
                'language': response.language if hasattr(response, 'language') else 'en',
                'words': [],
                'confidence': 0.0
            }

            # Extract word-level timestamps
            if hasattr(response, 'words') and response.words:
                words = []
                confidences = []

                for word_data in response.words:
                    word_dict = {
                        'word': word_data.word if hasattr(word_data, 'word') else word_data.get('word', ''),
                        'start': word_data.start if hasattr(word_data, 'start') else word_data.get('start', 0.0),
                        'end': word_data.end if hasattr(word_data, 'end') else word_data.get('end', 0.0),
                        'confidence': word_data.confidence if hasattr(word_data, 'confidence') else word_data.get('confidence', 1.0)
                    }
                    words.append(word_dict)
                    confidences.append(word_dict['confidence'])

                result['words'] = words
                result['confidence'] = sum(confidences) / len(confidences) if confidences else 1.0
            else:
                # Fallback: estimate word timestamps from text
                result['words'] = self._estimate_word_timestamps(
                    result['text'],
                    result['duration']
                )
                result['confidence'] = 0.95  # API generally high confidence

            logger.info(f"Transcription complete (API): {len(result['words'])} words, duration: {result['duration']:.2f}s")
            return result

        except openai.APIError as e:
            raise TranscriptionError(
                f"OpenAI API error: {str(e)}",
                {"error": str(e)}
            )

    async def _transcribe_local(self, audio_file_path: str) -> Dict:
        """Transcribe using local Whisper model"""
        import whisper

        # Transcribe with word timestamps
        result_raw = self.model.transcribe(
            audio_file_path,
            word_timestamps=True,
            verbose=False
        )

        # Parse result
        result = {
            'text': result_raw.get('text', ''),
            'duration': result_raw.get('duration', 0),
            'language': result_raw.get('language', 'en'),
            'words': [],
            'confidence': 0.0
        }

        # Extract word-level data
        if 'segments' in result_raw:
            words = []
            confidences = []

            for segment in result_raw['segments']:
                if 'words' in segment:
                    for word_data in segment['words']:
                        word_dict = {
                            'word': word_data.get('word', '').strip(),
                            'start': word_data.get('start', 0.0),
                            'end': word_data.get('end', 0.0),
                            'confidence': word_data.get('probability', 0.95)
                        }
                        words.append(word_dict)
                        confidences.append(word_dict['confidence'])

            result['words'] = words
            result['confidence'] = sum(confidences) / len(confidences) if confidences else 0.95
        else:
            # Fallback
            result['words'] = self._estimate_word_timestamps(
                result['text'],
                result['duration']
            )
            result['confidence'] = 0.90

        logger.info(f"Transcription complete (Local): {len(result['words'])} words, duration: {result['duration']:.2f}s")
        return result

    def _estimate_word_timestamps(self, text: str, duration: float) -> List[Dict]:
        """
        Estimate word timestamps when word-level data not available

        Assumes uniform distribution of words over duration
        """
        words = text.split()
        word_count = len(words)

        if word_count == 0 or duration == 0:
            return []

        time_per_word = duration / word_count
        word_timestamps = []

        for i, word in enumerate(words):
            start = i * time_per_word
            end = (i + 1) * time_per_word
            word_timestamps.append({
                'word': word,
                'start': start,
                'end': end,
                'confidence': 0.85  # Lower confidence for estimates
            })

        return word_timestamps

    async def transcribe_with_retry(
        self,
        audio_file_path: str,
        max_retries: int = 3
    ) -> Optional[Dict]:
        """
        Transcribe with automatic retry on failure

        Args:
            audio_file_path: Path to audio file
            max_retries: Maximum retry attempts

        Returns:
            Transcription result or None if all retries fail
        """
        for attempt in range(max_retries):
            try:
                return await self.transcribe_audio(audio_file_path)
            except TranscriptionError as e:
                logger.warning(f"Transcription attempt {attempt + 1} failed: {e.message}")
                if attempt == max_retries - 1:
                    logger.error("Max retries reached, transcription failed")
                    return None

        return None
