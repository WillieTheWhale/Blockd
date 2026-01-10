"""
Database Models for Response Timing Service.

Comprehensive SQLAlchemy ORM models for storing transcription results,
timing metrics, pause detection, filler words, and anomalies.

Tables:
    - response_timing_analysis: Main analysis results
    - transcriptions: Stored transcriptions with metadata
    - word_timestamps: Word-level timing data
    - pause_events: Detected pauses
    - filler_word_events: Detected filler words
    - timing_anomalies: Detected timing anomalies
    - timing_sessions: Session-level aggregates
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from decimal import Decimal

from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, DateTime,
    ForeignKey, Index, Enum as SQLAlchemyEnum, DECIMAL, JSON,
    UniqueConstraint, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship, backref
from sqlalchemy.ext.hybrid import hybrid_property

from .database import Base


# =============================================================================
# Enums
# =============================================================================

import enum

class AnalysisStatus(str, enum.Enum):
    """Status of timing analysis"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DifficultyLevel(str, enum.Enum):
    """Question difficulty levels"""
    SIMPLE = "simple"
    ANALYTICAL = "analytical"
    COMPLEX = "complex"


class AnomalyType(str, enum.Enum):
    """Types of timing anomalies"""
    INSTANT_RESPONSE = "instant_response"
    UNNATURAL_CONSISTENCY = "unnatural_consistency"
    DELAYED_THEN_FLUENT = "delayed_then_fluent"
    ROBOTIC_SPEECH_PATTERN = "robotic_speech_pattern"
    ABNORMAL_SPEECH_RATE = "abnormal_speech_rate"
    LOW_FILLER_RATIO = "low_filler_ratio"
    EXCESSIVE_PAUSES = "excessive_pauses"


class RiskLevel(str, enum.Enum):
    """Risk assessment levels"""
    MINIMAL = "minimal"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# =============================================================================
# Main Analysis Model
# =============================================================================

class ResponseTimingAnalysis(Base):
    """
    Main response timing analysis result.

    Stores the complete analysis for a single answer including
    timing metrics, transcription reference, anomalies, and risk score.
    """
    __tablename__ = "response_timing_analysis"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    session_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    question_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Audio source
    audio_url = Column(Text, nullable=False)
    audio_duration_seconds = Column(Float, nullable=True)
    audio_format = Column(String(20), nullable=True)
    audio_size_bytes = Column(Integer, nullable=True)

    # Timing context
    question_asked_at = Column(DateTime(timezone=True), nullable=False)
    answer_start_at = Column(DateTime(timezone=True), nullable=False)
    difficulty = Column(
        SQLAlchemyEnum(DifficultyLevel, name='difficulty_level'),
        nullable=False,
        default=DifficultyLevel.ANALYTICAL
    )
    expected_latency_ms = Column(Integer, nullable=True)

    # Core timing metrics
    response_latency_ms = Column(Integer, nullable=True)
    speech_duration_seconds = Column(Float, nullable=True)
    total_duration_seconds = Column(Float, nullable=True)
    speech_rate_wpm = Column(Float, nullable=True)

    # Pause metrics
    pause_count = Column(Integer, nullable=True, default=0)
    pause_percentage = Column(Float, nullable=True)
    avg_pause_duration_seconds = Column(Float, nullable=True)
    max_pause_duration_seconds = Column(Float, nullable=True)
    pause_duration_std_dev = Column(Float, nullable=True)

    # Filler word metrics
    filler_word_count = Column(Integer, nullable=True, default=0)
    filler_word_ratio = Column(Float, nullable=True)
    unique_filler_types = Column(Integer, nullable=True)

    # Word statistics
    total_word_count = Column(Integer, nullable=True)
    unique_word_count = Column(Integer, nullable=True)
    avg_word_length = Column(Float, nullable=True)

    # Anomaly flags (boolean for quick filtering)
    has_instant_response = Column(Boolean, nullable=False, default=False)
    has_unnatural_consistency = Column(Boolean, nullable=False, default=False)
    has_delayed_then_fluent = Column(Boolean, nullable=False, default=False)
    has_robotic_pattern = Column(Boolean, nullable=False, default=False)

    # Risk assessment
    risk_score = Column(DECIMAL(5, 4), nullable=True)  # 0.0000 to 1.0000
    risk_level = Column(
        SQLAlchemyEnum(RiskLevel, name='risk_level'),
        nullable=True
    )
    risk_factors = Column(JSONB, nullable=True, default=dict)
    recommendation = Column(Text, nullable=True)

    # Processing metadata
    status = Column(
        SQLAlchemyEnum(AnalysisStatus, name='analysis_status'),
        nullable=False,
        default=AnalysisStatus.PENDING
    )
    error_message = Column(Text, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    transcription = relationship(
        "Transcription",
        back_populates="analysis",
        uselist=False,
        cascade="all, delete-orphan"
    )
    pause_events = relationship(
        "PauseEvent",
        back_populates="analysis",
        cascade="all, delete-orphan"
    )
    filler_word_events = relationship(
        "FillerWordEvent",
        back_populates="analysis",
        cascade="all, delete-orphan"
    )
    anomalies = relationship(
        "TimingAnomaly",
        back_populates="analysis",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index('idx_timing_analysis_session_question', 'session_id', 'question_id'),
        Index('idx_timing_analysis_risk_score', 'risk_score'),
        Index('idx_timing_analysis_status', 'status'),
        Index('idx_timing_analysis_created', 'created_at'),
        CheckConstraint('risk_score >= 0 AND risk_score <= 1', name='check_risk_score_range'),
    )

    @hybrid_property
    def anomaly_count(self) -> int:
        """Count of anomaly flags that are True"""
        return sum([
            self.has_instant_response,
            self.has_unnatural_consistency,
            self.has_delayed_then_fluent,
            self.has_robotic_pattern
        ])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": str(self.id),
            "session_id": str(self.session_id),
            "question_id": str(self.question_id),
            "timing_metrics": {
                "response_latency_ms": self.response_latency_ms,
                "speech_duration_seconds": self.speech_duration_seconds,
                "total_duration_seconds": self.total_duration_seconds,
                "speech_rate_wpm": self.speech_rate_wpm,
                "pause_count": self.pause_count,
                "pause_percentage": self.pause_percentage,
                "avg_pause_duration_seconds": self.avg_pause_duration_seconds,
                "filler_word_count": self.filler_word_count,
                "filler_word_ratio": self.filler_word_ratio,
            },
            "anomalies": {
                "instant_response": self.has_instant_response,
                "unnatural_consistency": self.has_unnatural_consistency,
                "delayed_then_fluent": self.has_delayed_then_fluent,
                "robotic_speech_pattern": self.has_robotic_pattern,
            },
            "risk_score": float(self.risk_score) if self.risk_score else None,
            "risk_level": self.risk_level.value if self.risk_level else None,
            "recommendation": self.recommendation,
            "status": self.status.value if self.status else None,
            "analyzed_at": self.analyzed_at.isoformat() if self.analyzed_at else None,
        }


# =============================================================================
# Transcription Model
# =============================================================================

class Transcription(Base):
    """
    Stored transcription with metadata.

    Contains the full transcription text, confidence scores,
    and optional word-level timestamps.
    """
    __tablename__ = "transcriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(
        UUID(as_uuid=True),
        ForeignKey('response_timing_analysis.id', ondelete='CASCADE'),
        nullable=False,
        unique=True
    )

    # Transcription content
    text = Column(Text, nullable=False)
    text_normalized = Column(Text, nullable=True)  # Lowercase, punctuation removed

    # Confidence
    confidence = Column(Float, nullable=False)
    avg_word_confidence = Column(Float, nullable=True)
    min_word_confidence = Column(Float, nullable=True)

    # Statistics
    word_count = Column(Integer, nullable=False)
    sentence_count = Column(Integer, nullable=True)
    character_count = Column(Integer, nullable=True)

    # Language detection
    detected_language = Column(String(10), nullable=True, default="en")
    language_confidence = Column(Float, nullable=True)

    # Transcription method
    transcription_method = Column(String(50), nullable=False, default="whisper_api")
    model_used = Column(String(50), nullable=True)

    # Raw word timestamps stored as JSONB
    word_timestamps = Column(JSONB, nullable=True, default=list)

    # Processing metadata
    processing_time_ms = Column(Integer, nullable=True)
    audio_duration_seconds = Column(Float, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    # Relationship
    analysis = relationship("ResponseTimingAnalysis", back_populates="transcription")

    __table_args__ = (
        Index('idx_transcription_analysis', 'analysis_id'),
        Index('idx_transcription_confidence', 'confidence'),
    )


class WordTimestamp(Base):
    """
    Individual word-level timestamps.

    For detailed analysis, stores each word with start/end times.
    Used for precise pause detection and speech pattern analysis.
    """
    __tablename__ = "word_timestamps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transcription_id = Column(
        UUID(as_uuid=True),
        ForeignKey('transcriptions.id', ondelete='CASCADE'),
        nullable=False
    )

    # Word data
    word = Column(String(100), nullable=False)
    word_normalized = Column(String(100), nullable=True)  # Lowercase
    word_index = Column(Integer, nullable=False)  # Position in transcription

    # Timing
    start_time = Column(Float, nullable=False)  # Seconds from audio start
    end_time = Column(Float, nullable=False)
    duration = Column(Float, nullable=False)  # end_time - start_time

    # Confidence
    confidence = Column(Float, nullable=False, default=1.0)

    # Classification flags
    is_filler_word = Column(Boolean, nullable=False, default=False)
    is_hesitation = Column(Boolean, nullable=False, default=False)

    # Gap to next word (for pause detection)
    gap_to_next = Column(Float, nullable=True)  # Seconds until next word

    __table_args__ = (
        Index('idx_word_timestamps_transcription', 'transcription_id'),
        Index('idx_word_timestamps_timing', 'start_time', 'end_time'),
        CheckConstraint('end_time >= start_time', name='check_word_time_order'),
    )


# =============================================================================
# Pause Detection Model
# =============================================================================

class PauseEvent(Base):
    """
    Detected pause events.

    Records each pause with timing, duration, and context.
    Used for natural speech pattern analysis.
    """
    __tablename__ = "pause_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(
        UUID(as_uuid=True),
        ForeignKey('response_timing_analysis.id', ondelete='CASCADE'),
        nullable=False
    )

    # Pause timing
    start_time = Column(Float, nullable=False)  # Seconds from audio start
    end_time = Column(Float, nullable=False)
    duration = Column(Float, nullable=False)

    # Pause position
    pause_index = Column(Integer, nullable=False)  # Order in audio
    word_before = Column(String(100), nullable=True)
    word_after = Column(String(100), nullable=True)
    word_index_before = Column(Integer, nullable=True)

    # Classification
    is_sentence_boundary = Column(Boolean, nullable=False, default=False)
    is_breathing_pause = Column(Boolean, nullable=False, default=False)
    is_hesitation_pause = Column(Boolean, nullable=False, default=False)

    # Analysis flags
    is_unusually_long = Column(Boolean, nullable=False, default=False)
    is_unusually_short = Column(Boolean, nullable=False, default=False)

    # Audio metrics
    silence_db = Column(Float, nullable=True)  # Decibel level during pause

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    # Relationship
    analysis = relationship("ResponseTimingAnalysis", back_populates="pause_events")

    __table_args__ = (
        Index('idx_pause_events_analysis', 'analysis_id'),
        Index('idx_pause_events_duration', 'duration'),
        CheckConstraint('end_time > start_time', name='check_pause_time_order'),
        CheckConstraint('duration > 0', name='check_pause_duration_positive'),
    )


# =============================================================================
# Filler Word Detection Model
# =============================================================================

class FillerWordEvent(Base):
    """
    Detected filler word events.

    Records each filler word with timing and type.
    Used for natural speech pattern analysis and AI detection.
    """
    __tablename__ = "filler_word_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(
        UUID(as_uuid=True),
        ForeignKey('response_timing_analysis.id', ondelete='CASCADE'),
        nullable=False
    )

    # Filler word
    filler_word = Column(String(50), nullable=False)
    filler_type = Column(String(30), nullable=False)  # hesitation, discourse_marker, verbal_tic

    # Timing
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    duration = Column(Float, nullable=False)

    # Position
    word_index = Column(Integer, nullable=False)

    # Context
    preceding_word = Column(String(100), nullable=True)
    following_word = Column(String(100), nullable=True)
    sentence_position = Column(String(20), nullable=True)  # start, middle, end

    # Confidence
    detection_confidence = Column(Float, nullable=False, default=1.0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    # Relationship
    analysis = relationship("ResponseTimingAnalysis", back_populates="filler_word_events")

    __table_args__ = (
        Index('idx_filler_events_analysis', 'analysis_id'),
        Index('idx_filler_events_type', 'filler_type'),
    )


# =============================================================================
# Timing Anomaly Model
# =============================================================================

class TimingAnomaly(Base):
    """
    Detected timing anomalies.

    Records each anomaly with type, severity, and evidence.
    Used for risk scoring and AI detection.
    """
    __tablename__ = "timing_anomalies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(
        UUID(as_uuid=True),
        ForeignKey('response_timing_analysis.id', ondelete='CASCADE'),
        nullable=False
    )

    # Anomaly classification
    anomaly_type = Column(
        SQLAlchemyEnum(AnomalyType, name='anomaly_type'),
        nullable=False
    )
    severity = Column(String(20), nullable=False, default="medium")  # low, medium, high

    # Detection details
    confidence = Column(Float, nullable=False)
    description = Column(Text, nullable=False)

    # Evidence
    expected_value = Column(Float, nullable=True)
    actual_value = Column(Float, nullable=True)
    deviation_percentage = Column(Float, nullable=True)

    # Risk contribution
    risk_weight = Column(Float, nullable=False, default=0.0)
    risk_contribution = Column(Float, nullable=True)  # Actual contribution to risk score

    # Context data
    context_data = Column(JSONB, nullable=True, default=dict)

    # Timestamps
    detected_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    # Relationship
    analysis = relationship("ResponseTimingAnalysis", back_populates="anomalies")

    __table_args__ = (
        Index('idx_timing_anomalies_analysis', 'analysis_id'),
        Index('idx_timing_anomalies_type', 'anomaly_type'),
        Index('idx_timing_anomalies_severity', 'severity'),
    )


# =============================================================================
# Session Aggregate Model
# =============================================================================

class TimingSession(Base):
    """
    Session-level timing aggregates.

    Pre-computed statistics for all answers in an interview session.
    Used for overall risk assessment and reporting.
    """
    __tablename__ = "timing_sessions"

    # Primary key is session_id (from interview_sessions)
    session_id = Column(UUID(as_uuid=True), primary_key=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Session metadata
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    # Answer counts
    total_answers = Column(Integer, nullable=False, default=0)
    analyzed_answers = Column(Integer, nullable=False, default=0)
    failed_analyses = Column(Integer, nullable=False, default=0)

    # Aggregate timing metrics
    avg_response_latency_ms = Column(Float, nullable=True)
    avg_speech_rate_wpm = Column(Float, nullable=True)
    avg_pause_percentage = Column(Float, nullable=True)
    avg_filler_ratio = Column(Float, nullable=True)

    # Consistency metrics
    latency_std_dev = Column(Float, nullable=True)
    speech_rate_std_dev = Column(Float, nullable=True)
    pause_duration_std_dev = Column(Float, nullable=True)

    # Anomaly aggregates
    total_anomalies = Column(Integer, nullable=False, default=0)
    instant_response_count = Column(Integer, nullable=False, default=0)
    unnatural_consistency_count = Column(Integer, nullable=False, default=0)
    delayed_fluent_count = Column(Integer, nullable=False, default=0)
    robotic_pattern_count = Column(Integer, nullable=False, default=0)

    # Risk assessment
    avg_risk_score = Column(DECIMAL(5, 4), nullable=True)
    max_risk_score = Column(DECIMAL(5, 4), nullable=True)
    overall_risk_level = Column(
        SQLAlchemyEnum(RiskLevel, name='risk_level'),
        nullable=True
    )
    risk_factors = Column(JSONB, nullable=True, default=dict)

    # Speech profile
    speech_profile = Column(JSONB, nullable=True, default=dict)
    # Example: {"type": "measured", "consistency": 0.85, "naturalness": 0.9}

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_timing_sessions_user', 'user_id'),
        Index('idx_timing_sessions_risk', 'avg_risk_score'),
        Index('idx_timing_sessions_created', 'created_at'),
    )

    def update_from_analysis(self, analysis: ResponseTimingAnalysis):
        """Update session aggregates with new analysis"""
        self.analyzed_answers += 1

        # Update anomaly counts
        if analysis.has_instant_response:
            self.instant_response_count += 1
        if analysis.has_unnatural_consistency:
            self.unnatural_consistency_count += 1
        if analysis.has_delayed_then_fluent:
            self.delayed_fluent_count += 1
        if analysis.has_robotic_pattern:
            self.robotic_pattern_count += 1

        self.total_anomalies = (
            self.instant_response_count +
            self.unnatural_consistency_count +
            self.delayed_fluent_count +
            self.robotic_pattern_count
        )

        self.updated_at = datetime.utcnow()


# =============================================================================
# Filler Word Reference Table
# =============================================================================

class FillerWordReference(Base):
    """
    Reference table for filler words.

    Configurable list of filler words by language and type.
    """
    __tablename__ = "filler_word_reference"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    word = Column(String(50), nullable=False)
    language = Column(String(10), nullable=False, default="en")

    # Classification
    filler_type = Column(String(30), nullable=False)
    # Types: hesitation (um, uh), discourse_marker (like, you know), verbal_tic (basically)

    # Usage
    frequency_weight = Column(Float, nullable=False, default=1.0)  # How common
    suspicion_weight = Column(Float, nullable=False, default=1.0)  # How suspicious if absent

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint('word', 'language', name='uq_filler_word_language'),
        Index('idx_filler_reference_language', 'language'),
    )


# =============================================================================
# Database Manager
# =============================================================================

class TimingDatabaseManager:
    """
    Database operations manager for response timing service.

    Provides high-level methods for CRUD operations on all models.
    """

    def __init__(self, session):
        self.session = session

    # -------------------------------------------------------------------------
    # Analysis Operations
    # -------------------------------------------------------------------------

    def create_analysis(
        self,
        session_id: uuid.UUID,
        question_id: uuid.UUID,
        audio_url: str,
        question_asked_at: datetime,
        answer_start_at: datetime,
        difficulty: str = "analytical",
        expected_latency_ms: Optional[int] = None
    ) -> ResponseTimingAnalysis:
        """Create a new analysis record"""
        analysis = ResponseTimingAnalysis(
            session_id=session_id,
            question_id=question_id,
            audio_url=audio_url,
            question_asked_at=question_asked_at,
            answer_start_at=answer_start_at,
            difficulty=DifficultyLevel(difficulty),
            expected_latency_ms=expected_latency_ms,
            status=AnalysisStatus.PENDING
        )
        self.session.add(analysis)
        self.session.commit()
        self.session.refresh(analysis)
        return analysis

    def get_analysis(self, analysis_id: uuid.UUID) -> Optional[ResponseTimingAnalysis]:
        """Get analysis by ID"""
        return self.session.query(ResponseTimingAnalysis).filter(
            ResponseTimingAnalysis.id == analysis_id
        ).first()

    def get_analyses_by_session(
        self,
        session_id: uuid.UUID
    ) -> List[ResponseTimingAnalysis]:
        """Get all analyses for a session"""
        return self.session.query(ResponseTimingAnalysis).filter(
            ResponseTimingAnalysis.session_id == session_id
        ).order_by(ResponseTimingAnalysis.created_at).all()

    def update_analysis_results(
        self,
        analysis_id: uuid.UUID,
        timing_metrics: Dict[str, Any],
        anomalies: Dict[str, bool],
        risk_score: float,
        risk_level: str,
        recommendation: str
    ) -> ResponseTimingAnalysis:
        """Update analysis with results"""
        analysis = self.get_analysis(analysis_id)
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")

        # Update timing metrics
        for key, value in timing_metrics.items():
            if hasattr(analysis, key):
                setattr(analysis, key, value)

        # Update anomaly flags
        analysis.has_instant_response = anomalies.get("instant_response", False)
        analysis.has_unnatural_consistency = anomalies.get("unnatural_consistency", False)
        analysis.has_delayed_then_fluent = anomalies.get("delayed_then_fluent", False)
        analysis.has_robotic_pattern = anomalies.get("robotic_speech_pattern", False)

        # Update risk assessment
        analysis.risk_score = Decimal(str(risk_score))
        analysis.risk_level = RiskLevel(risk_level)
        analysis.recommendation = recommendation

        # Update status
        analysis.status = AnalysisStatus.COMPLETED
        analysis.analyzed_at = datetime.utcnow()

        self.session.commit()
        self.session.refresh(analysis)
        return analysis

    def mark_analysis_failed(
        self,
        analysis_id: uuid.UUID,
        error_message: str
    ) -> ResponseTimingAnalysis:
        """Mark analysis as failed"""
        analysis = self.get_analysis(analysis_id)
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")

        analysis.status = AnalysisStatus.FAILED
        analysis.error_message = error_message

        self.session.commit()
        self.session.refresh(analysis)
        return analysis

    # -------------------------------------------------------------------------
    # Transcription Operations
    # -------------------------------------------------------------------------

    def save_transcription(
        self,
        analysis_id: uuid.UUID,
        text: str,
        confidence: float,
        word_timestamps: Optional[List[Dict]] = None,
        transcription_method: str = "whisper_api",
        model_used: Optional[str] = None,
        processing_time_ms: Optional[int] = None
    ) -> Transcription:
        """Save transcription result"""
        transcription = Transcription(
            analysis_id=analysis_id,
            text=text,
            text_normalized=text.lower(),
            confidence=confidence,
            word_count=len(text.split()),
            word_timestamps=word_timestamps or [],
            transcription_method=transcription_method,
            model_used=model_used,
            processing_time_ms=processing_time_ms
        )
        self.session.add(transcription)
        self.session.commit()
        self.session.refresh(transcription)
        return transcription

    # -------------------------------------------------------------------------
    # Pause Event Operations
    # -------------------------------------------------------------------------

    def save_pause_events(
        self,
        analysis_id: uuid.UUID,
        pauses: List[Dict[str, Any]]
    ) -> List[PauseEvent]:
        """Save multiple pause events"""
        pause_events = []
        for i, pause in enumerate(pauses):
            event = PauseEvent(
                analysis_id=analysis_id,
                pause_index=i,
                start_time=pause["start"],
                end_time=pause["end"],
                duration=pause["duration"],
                word_before=pause.get("word_before"),
                word_after=pause.get("word_after"),
                is_sentence_boundary=pause.get("is_sentence_boundary", False),
                is_unusually_long=pause.get("is_unusually_long", False),
                silence_db=pause.get("silence_db")
            )
            self.session.add(event)
            pause_events.append(event)

        self.session.commit()
        return pause_events

    # -------------------------------------------------------------------------
    # Filler Word Operations
    # -------------------------------------------------------------------------

    def save_filler_events(
        self,
        analysis_id: uuid.UUID,
        fillers: List[Dict[str, Any]]
    ) -> List[FillerWordEvent]:
        """Save multiple filler word events"""
        filler_events = []
        for filler in fillers:
            event = FillerWordEvent(
                analysis_id=analysis_id,
                filler_word=filler["word"],
                filler_type=filler.get("type", "hesitation"),
                start_time=filler["start"],
                end_time=filler["end"],
                duration=filler["end"] - filler["start"],
                word_index=filler["word_index"],
                preceding_word=filler.get("preceding_word"),
                following_word=filler.get("following_word"),
                detection_confidence=filler.get("confidence", 1.0)
            )
            self.session.add(event)
            filler_events.append(event)

        self.session.commit()
        return filler_events

    # -------------------------------------------------------------------------
    # Anomaly Operations
    # -------------------------------------------------------------------------

    def save_anomaly(
        self,
        analysis_id: uuid.UUID,
        anomaly_type: str,
        severity: str,
        confidence: float,
        description: str,
        expected_value: Optional[float] = None,
        actual_value: Optional[float] = None,
        risk_weight: float = 0.0,
        context_data: Optional[Dict] = None
    ) -> TimingAnomaly:
        """Save a timing anomaly"""
        deviation = None
        if expected_value and actual_value:
            deviation = abs(actual_value - expected_value) / expected_value * 100

        anomaly = TimingAnomaly(
            analysis_id=analysis_id,
            anomaly_type=AnomalyType(anomaly_type),
            severity=severity,
            confidence=confidence,
            description=description,
            expected_value=expected_value,
            actual_value=actual_value,
            deviation_percentage=deviation,
            risk_weight=risk_weight,
            context_data=context_data or {}
        )
        self.session.add(anomaly)
        self.session.commit()
        self.session.refresh(anomaly)
        return anomaly

    # -------------------------------------------------------------------------
    # Session Operations
    # -------------------------------------------------------------------------

    def get_or_create_session(
        self,
        session_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> TimingSession:
        """Get or create timing session"""
        timing_session = self.session.query(TimingSession).filter(
            TimingSession.session_id == session_id
        ).first()

        if not timing_session:
            timing_session = TimingSession(
                session_id=session_id,
                user_id=user_id
            )
            self.session.add(timing_session)
            self.session.commit()
            self.session.refresh(timing_session)

        return timing_session

    def update_session_aggregates(
        self,
        session_id: uuid.UUID
    ) -> TimingSession:
        """Recalculate session aggregates from all analyses"""
        timing_session = self.session.query(TimingSession).filter(
            TimingSession.session_id == session_id
        ).first()

        if not timing_session:
            raise ValueError(f"Timing session {session_id} not found")

        # Get all completed analyses for this session
        analyses = self.session.query(ResponseTimingAnalysis).filter(
            ResponseTimingAnalysis.session_id == session_id,
            ResponseTimingAnalysis.status == AnalysisStatus.COMPLETED
        ).all()

        if not analyses:
            return timing_session

        # Calculate aggregates
        timing_session.analyzed_answers = len(analyses)

        latencies = [a.response_latency_ms for a in analyses if a.response_latency_ms]
        speech_rates = [a.speech_rate_wpm for a in analyses if a.speech_rate_wpm]
        pause_percentages = [a.pause_percentage for a in analyses if a.pause_percentage]
        filler_ratios = [a.filler_word_ratio for a in analyses if a.filler_word_ratio]
        risk_scores = [float(a.risk_score) for a in analyses if a.risk_score]

        if latencies:
            timing_session.avg_response_latency_ms = sum(latencies) / len(latencies)
        if speech_rates:
            timing_session.avg_speech_rate_wpm = sum(speech_rates) / len(speech_rates)
        if pause_percentages:
            timing_session.avg_pause_percentage = sum(pause_percentages) / len(pause_percentages)
        if filler_ratios:
            timing_session.avg_filler_ratio = sum(filler_ratios) / len(filler_ratios)
        if risk_scores:
            timing_session.avg_risk_score = Decimal(str(sum(risk_scores) / len(risk_scores)))
            timing_session.max_risk_score = Decimal(str(max(risk_scores)))

        # Count anomalies
        timing_session.instant_response_count = sum(1 for a in analyses if a.has_instant_response)
        timing_session.unnatural_consistency_count = sum(1 for a in analyses if a.has_unnatural_consistency)
        timing_session.delayed_fluent_count = sum(1 for a in analyses if a.has_delayed_then_fluent)
        timing_session.robotic_pattern_count = sum(1 for a in analyses if a.has_robotic_pattern)
        timing_session.total_anomalies = (
            timing_session.instant_response_count +
            timing_session.unnatural_consistency_count +
            timing_session.delayed_fluent_count +
            timing_session.robotic_pattern_count
        )

        # Determine overall risk level
        if timing_session.avg_risk_score:
            avg_risk = float(timing_session.avg_risk_score)
            if avg_risk >= 0.85:
                timing_session.overall_risk_level = RiskLevel.CRITICAL
            elif avg_risk >= 0.70:
                timing_session.overall_risk_level = RiskLevel.HIGH
            elif avg_risk >= 0.50:
                timing_session.overall_risk_level = RiskLevel.MEDIUM
            elif avg_risk >= 0.30:
                timing_session.overall_risk_level = RiskLevel.LOW
            else:
                timing_session.overall_risk_level = RiskLevel.MINIMAL

        self.session.commit()
        self.session.refresh(timing_session)
        return timing_session
