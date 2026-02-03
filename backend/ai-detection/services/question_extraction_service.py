"""
Question extraction service using heuristics
Extracts interview questions from transcribed interviewer speech
"""
import re
import hashlib
import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ExtractedQuestion:
    """Represents an extracted question from transcription"""
    text: str
    normalized_text: str
    question_hash: str
    start_index: int
    end_index: int
    confidence: float
    question_type: str  # 'direct', 'indirect', 'tag'


# Common question starters for heuristic detection
DIRECT_QUESTION_STARTERS = [
    r'^what\b',
    r'^how\b',
    r'^why\b',
    r'^when\b',
    r'^where\b',
    r'^who\b',
    r'^which\b',
    r'^can you\b',
    r'^could you\b',
    r'^would you\b',
    r'^will you\b',
    r'^do you\b',
    r'^did you\b',
    r'^does\b',
    r'^is\b',
    r'^are\b',
    r'^was\b',
    r'^were\b',
    r'^have you\b',
    r'^has\b',
]

# Imperative interview patterns (commands that function as questions)
# These get higher confidence since they're explicitly requesting information
IMPERATIVE_INTERVIEW_PATTERNS = [
    r'^tell me\b',
    r'^describe\b',
    r'^explain\b',
    r'^walk me through\b',
    r'^give me an example\b',
    r'^share\b',
    r'^discuss\b',
    r'^elaborate\b',
]

# Interview-specific question patterns
INTERVIEW_PATTERNS = [
    r'tell me about (?:a time|yourself|your experience)',
    r'what (?:is|are|was|were) your (?:experience|approach|thoughts|opinion)',
    r'how (?:would|do|did) you (?:handle|approach|solve|deal with)',
    r'why (?:do|did|should|would) you',
    r'can you (?:describe|explain|tell me|walk me through|give me)',
    r'what (?:would|do|did) you (?:do|say|think|consider)',
    r'describe a (?:situation|time|scenario|project)',
    r'give me an example of',
    r'what challenges (?:did you|have you)',
    r'how have you (?:handled|approached|dealt with)',
]

# Indirect question indicators
INDIRECT_QUESTION_INDICATORS = [
    r'\bi[\'d]? like to know\b',
    r'\bi[\'m]? curious\b',
    r'\bi[\'m]? wondering\b',
    r'\bcould you (?:please\s+)?(?:tell|explain|describe)\b',
    r'\bwould you mind (?:telling|explaining|describing)\b',
]

# Non-question patterns to filter out
NON_QUESTION_PATTERNS = [
    r'^(?:okay|ok|alright|sure|yes|yeah|no|right|great|good|perfect)\s*[,.]?\s*$',
    r'^(?:uh|um|hmm|ah)+\s*$',
    r'^(?:so|and|but|well)\s*$',
    r'^let me\s+(?:just\s+)?(?:say|note|mention)',
    r'^(?:that\'s|it\'s)\s+(?:good|great|interesting)',
]


class QuestionExtractionService:
    """
    Service for extracting questions from transcribed interviewer speech
    using heuristic-based detection.

    Uses multiple signals:
    1. Question mark presence
    2. Question word starters (what, how, why, etc.)
    3. Interview-specific patterns
    4. Sentence structure analysis
    """

    def __init__(self):
        """Initialize question extraction service"""
        # Compile regex patterns for efficiency
        self.direct_patterns = [re.compile(p, re.IGNORECASE) for p in DIRECT_QUESTION_STARTERS]
        self.imperative_patterns = [re.compile(p, re.IGNORECASE) for p in IMPERATIVE_INTERVIEW_PATTERNS]
        self.interview_patterns = [re.compile(p, re.IGNORECASE) for p in INTERVIEW_PATTERNS]
        self.indirect_patterns = [re.compile(p, re.IGNORECASE) for p in INDIRECT_QUESTION_INDICATORS]
        self.non_question_patterns = [re.compile(p, re.IGNORECASE) for p in NON_QUESTION_PATTERNS]

        logger.info("Question extraction service initialized")

    def extract_questions(
        self,
        transcription_text: str,
        min_length: int = 15,
        min_confidence: float = 0.5
    ) -> List[ExtractedQuestion]:
        """
        Extract questions from transcribed interviewer speech.

        Args:
            transcription_text: The transcribed text from interviewer audio
            min_length: Minimum character length for a valid question
            min_confidence: Minimum confidence threshold (0-1)

        Returns:
            List of ExtractedQuestion objects
        """
        if not transcription_text or len(transcription_text.strip()) < min_length:
            return []

        # Split into sentences
        sentences = self._split_into_sentences(transcription_text)
        extracted_questions = []
        current_position = 0

        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < min_length:
                current_position += len(sentence) + 1
                continue

            # Check if this is a non-question utterance
            if self._is_non_question(sentence):
                current_position += len(sentence) + 1
                continue

            # Analyze if this is a question
            is_question, confidence, question_type = self._analyze_sentence(sentence)

            if is_question and confidence >= min_confidence:
                # Find position in original text
                start_idx = transcription_text.find(sentence, current_position)
                if start_idx == -1:
                    start_idx = current_position
                end_idx = start_idx + len(sentence)

                # Normalize the question
                normalized = self._normalize_question(sentence)

                # Generate hash
                question_hash = self._hash_question(normalized)

                extracted_questions.append(ExtractedQuestion(
                    text=sentence,
                    normalized_text=normalized,
                    question_hash=question_hash,
                    start_index=start_idx,
                    end_index=end_idx,
                    confidence=confidence,
                    question_type=question_type
                ))

                logger.debug(f"Extracted question: '{sentence[:50]}...' (confidence: {confidence:.2f})")

            current_position += len(sentence) + 1

        logger.info(f"Extracted {len(extracted_questions)} questions from transcription")
        return extracted_questions

    def _split_into_sentences(self, text: str) -> List[str]:
        """
        Split text into sentences, handling common edge cases.

        Args:
            text: Input text

        Returns:
            List of sentences
        """
        # Replace common abbreviations to avoid splitting on them
        text = re.sub(r'\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|i\.e|e\.g)\.',
                      r'\1<DOT>', text, flags=re.IGNORECASE)

        # Split on sentence boundaries
        sentences = re.split(r'(?<=[.!?])\s+', text)

        # Restore dots in abbreviations
        sentences = [s.replace('<DOT>', '.') for s in sentences]

        # Also split on question marks within sentences
        result = []
        for sentence in sentences:
            # Check if there are multiple questions in one segment
            parts = re.split(r'(\?)', sentence)
            current = ''
            for part in parts:
                current += part
                if part == '?':
                    result.append(current.strip())
                    current = ''
            if current.strip():
                result.append(current.strip())

        return [s for s in result if s]

    def _is_non_question(self, sentence: str) -> bool:
        """
        Check if a sentence is a non-question utterance (filler, acknowledgment, etc.)

        Args:
            sentence: Sentence to check

        Returns:
            True if this is not a question
        """
        for pattern in self.non_question_patterns:
            if pattern.search(sentence):
                return True
        return False

    def _analyze_sentence(self, sentence: str) -> Tuple[bool, float, str]:
        """
        Analyze a sentence to determine if it's a question.

        Args:
            sentence: Sentence to analyze

        Returns:
            Tuple of (is_question, confidence, question_type)
        """
        confidence = 0.0
        question_type = 'unknown'

        # Signal 1: Question mark (strongest signal)
        has_question_mark = '?' in sentence
        if has_question_mark:
            confidence += 0.5
            question_type = 'direct'

        sentence_lower = sentence.lower().strip()

        # Signal 2: Imperative interview patterns (tell me, explain, describe, etc.)
        # These get high confidence since they're explicit requests for information
        for pattern in self.imperative_patterns:
            if pattern.search(sentence_lower):
                confidence += 0.5  # High confidence - these are clearly seeking answers
                if question_type == 'unknown':
                    question_type = 'imperative'
                break

        # Signal 3: Direct question starters (what, how, why, etc.)
        for pattern in self.direct_patterns:
            if pattern.search(sentence_lower):
                confidence += 0.3
                if question_type == 'unknown':
                    question_type = 'direct'
                break

        # Signal 4: Interview-specific patterns
        for pattern in self.interview_patterns:
            if pattern.search(sentence_lower):
                confidence += 0.25
                if question_type == 'unknown':
                    question_type = 'direct'
                break

        # Signal 5: Indirect question indicators
        for pattern in self.indirect_patterns:
            if pattern.search(sentence_lower):
                confidence += 0.2
                if question_type == 'unknown':
                    question_type = 'indirect'
                break

        # Signal 6: Rising intonation indicator (words suggesting question)
        if re.search(r'\b(right|correct|yes|no)\s*\??\s*$', sentence_lower):
            if question_type == 'unknown':
                question_type = 'tag'
            confidence += 0.1

        # Cap confidence at 1.0
        confidence = min(confidence, 1.0)

        # Determine if it's a question (threshold: 0.3)
        is_question = confidence >= 0.3

        return is_question, confidence, question_type

    def _normalize_question(self, question: str) -> str:
        """
        Normalize a question for comparison and hashing.

        Args:
            question: Original question text

        Returns:
            Normalized question text
        """
        # Convert to lowercase
        normalized = question.lower()

        # Remove extra whitespace
        normalized = ' '.join(normalized.split())

        # Remove filler words at the start
        normalized = re.sub(r'^(?:so|well|okay|ok|um|uh|now|alright),?\s*', '', normalized)

        # Remove trailing punctuation variations
        normalized = re.sub(r'[.!?]+$', '', normalized).strip()

        # Standardize common contractions
        contractions = {
            "what's": "what is",
            "how's": "how is",
            "where's": "where is",
            "who's": "who is",
            "that's": "that is",
            "it's": "it is",
            "i'm": "i am",
            "you're": "you are",
            "they're": "they are",
            "we're": "we are",
            "don't": "do not",
            "doesn't": "does not",
            "didn't": "did not",
            "can't": "cannot",
            "couldn't": "could not",
            "wouldn't": "would not",
            "shouldn't": "should not",
            "haven't": "have not",
            "hasn't": "has not",
            "won't": "will not",
        }
        for contraction, expansion in contractions.items():
            normalized = normalized.replace(contraction, expansion)

        return normalized.strip()

    def _hash_question(self, normalized_question: str) -> str:
        """
        Generate a SHA-256 hash for a normalized question.

        Args:
            normalized_question: Normalized question text

        Returns:
            64-character hex hash
        """
        return hashlib.sha256(normalized_question.encode('utf-8')).hexdigest()

    def find_similar_questions(
        self,
        question: str,
        existing_questions: List[Dict],
        threshold: float = 0.85
    ) -> Optional[Dict]:
        """
        Find a similar existing question using normalized text comparison.

        For production use with many questions, this should use embedding-based
        similarity via the SimilarityService. This is a simple fallback.

        Args:
            question: The question to match
            existing_questions: List of dicts with 'normalized_text' and 'question_hash'
            threshold: Similarity threshold (not used in exact match, kept for interface)

        Returns:
            Matching question dict or None
        """
        normalized = self._normalize_question(question)
        question_hash = self._hash_question(normalized)

        # Exact hash match
        for eq in existing_questions:
            if eq.get('question_hash') == question_hash:
                return eq

        # Note: For semantic similarity matching, use SimilarityService with embeddings
        return None


# Singleton instance
_question_extraction_service: Optional[QuestionExtractionService] = None


def get_question_extraction_service() -> QuestionExtractionService:
    """
    Get singleton question extraction service instance

    Returns:
        QuestionExtractionService instance
    """
    global _question_extraction_service
    if _question_extraction_service is None:
        _question_extraction_service = QuestionExtractionService()
    return _question_extraction_service
