"""
Tests for Response Timing Database Models.

Tests the SQLAlchemy ORM models and their functionality.
"""
import pytest
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch, MagicMock

# Mock the database module before importing models
import sys
sys.modules['src.database'] = MagicMock()

from src.models import (
    AnalysisStatus,
    DifficultyLevel,
    AnomalyType,
    RiskLevel,
    ResponseTimingAnalysis,
    Transcription,
    WordTimestamp,
    PauseEvent,
    FillerWordEvent,
    TimingAnomaly,
    TimingSession,
    FillerWordReference,
    TimingDatabaseManager,
)


class TestEnums:
    """Tests for enum types"""

    def test_analysis_status_values(self):
        """Test AnalysisStatus enum values"""
        assert AnalysisStatus.PENDING.value == "pending"
        assert AnalysisStatus.PROCESSING.value == "processing"
        assert AnalysisStatus.COMPLETED.value == "completed"
        assert AnalysisStatus.FAILED.value == "failed"

    def test_difficulty_level_values(self):
        """Test DifficultyLevel enum values"""
        assert DifficultyLevel.SIMPLE.value == "simple"
        assert DifficultyLevel.ANALYTICAL.value == "analytical"
        assert DifficultyLevel.COMPLEX.value == "complex"

    def test_anomaly_type_values(self):
        """Test AnomalyType enum values"""
        assert AnomalyType.INSTANT_RESPONSE.value == "instant_response"
        assert AnomalyType.UNNATURAL_CONSISTENCY.value == "unnatural_consistency"
        assert AnomalyType.DELAYED_THEN_FLUENT.value == "delayed_then_fluent"
        assert AnomalyType.ROBOTIC_SPEECH_PATTERN.value == "robotic_speech_pattern"

    def test_risk_level_values(self):
        """Test RiskLevel enum values"""
        assert RiskLevel.MINIMAL.value == "minimal"
        assert RiskLevel.LOW.value == "low"
        assert RiskLevel.MEDIUM.value == "medium"
        assert RiskLevel.HIGH.value == "high"
        assert RiskLevel.CRITICAL.value == "critical"


class TestResponseTimingAnalysis:
    """Tests for ResponseTimingAnalysis model"""

    def test_model_creation(self):
        """Test creating a ResponseTimingAnalysis instance"""
        session_id = uuid.uuid4()
        question_id = uuid.uuid4()
        now = datetime.utcnow()

        analysis = ResponseTimingAnalysis(
            session_id=session_id,
            question_id=question_id,
            audio_url="s3://bucket/audio.mp3",
            question_asked_at=now,
            answer_start_at=now + timedelta(seconds=5),
            difficulty=DifficultyLevel.ANALYTICAL
        )

        assert analysis.session_id == session_id
        assert analysis.question_id == question_id
        assert analysis.audio_url == "s3://bucket/audio.mp3"
        assert analysis.difficulty == DifficultyLevel.ANALYTICAL
        assert analysis.status == AnalysisStatus.PENDING

    def test_default_values(self):
        """Test default values are set correctly"""
        analysis = ResponseTimingAnalysis(
            session_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            audio_url="s3://bucket/test.mp3",
            question_asked_at=datetime.utcnow(),
            answer_start_at=datetime.utcnow()
        )

        assert analysis.pause_count == 0
        assert analysis.filler_word_count == 0
        assert analysis.has_instant_response is False
        assert analysis.has_unnatural_consistency is False
        assert analysis.has_delayed_then_fluent is False
        assert analysis.has_robotic_pattern is False

    def test_anomaly_count_property(self):
        """Test anomaly_count hybrid property"""
        analysis = ResponseTimingAnalysis(
            session_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            audio_url="s3://bucket/test.mp3",
            question_asked_at=datetime.utcnow(),
            answer_start_at=datetime.utcnow()
        )

        # No anomalies
        assert analysis.anomaly_count == 0

        # Add anomalies
        analysis.has_instant_response = True
        assert analysis.anomaly_count == 1

        analysis.has_unnatural_consistency = True
        assert analysis.anomaly_count == 2

        analysis.has_delayed_then_fluent = True
        analysis.has_robotic_pattern = True
        assert analysis.anomaly_count == 4

    def test_to_dict(self):
        """Test to_dict method"""
        analysis_id = uuid.uuid4()
        session_id = uuid.uuid4()
        question_id = uuid.uuid4()
        now = datetime.utcnow()

        analysis = ResponseTimingAnalysis(
            id=analysis_id,
            session_id=session_id,
            question_id=question_id,
            audio_url="s3://bucket/test.mp3",
            question_asked_at=now,
            answer_start_at=now,
            response_latency_ms=5000,
            speech_rate_wpm=145.5,
            risk_score=Decimal("0.35"),
            risk_level=RiskLevel.MEDIUM,
            recommendation="Normal timing patterns",
            status=AnalysisStatus.COMPLETED,
            analyzed_at=now
        )

        result = analysis.to_dict()

        assert result["id"] == str(analysis_id)
        assert result["session_id"] == str(session_id)
        assert result["question_id"] == str(question_id)
        assert result["timing_metrics"]["response_latency_ms"] == 5000
        assert result["timing_metrics"]["speech_rate_wpm"] == 145.5
        assert result["risk_score"] == 0.35
        assert result["risk_level"] == "medium"
        assert result["status"] == "completed"


class TestTranscription:
    """Tests for Transcription model"""

    def test_transcription_creation(self):
        """Test creating a Transcription instance"""
        analysis_id = uuid.uuid4()

        transcription = Transcription(
            analysis_id=analysis_id,
            text="This is a test transcription with multiple words.",
            confidence=0.95,
            word_count=8
        )

        assert transcription.analysis_id == analysis_id
        assert transcription.text == "This is a test transcription with multiple words."
        assert transcription.confidence == 0.95
        assert transcription.word_count == 8

    def test_transcription_with_word_timestamps(self):
        """Test transcription with word timestamps"""
        transcription = Transcription(
            analysis_id=uuid.uuid4(),
            text="Hello world",
            confidence=0.98,
            word_count=2,
            word_timestamps=[
                {"word": "Hello", "start": 0.0, "end": 0.5, "confidence": 0.99},
                {"word": "world", "start": 0.6, "end": 1.0, "confidence": 0.97}
            ]
        )

        assert len(transcription.word_timestamps) == 2
        assert transcription.word_timestamps[0]["word"] == "Hello"


class TestPauseEvent:
    """Tests for PauseEvent model"""

    def test_pause_event_creation(self):
        """Test creating a PauseEvent instance"""
        analysis_id = uuid.uuid4()

        pause = PauseEvent(
            analysis_id=analysis_id,
            pause_index=0,
            start_time=5.0,
            end_time=5.8,
            duration=0.8,
            word_before="um",
            word_after="so"
        )

        assert pause.analysis_id == analysis_id
        assert pause.start_time == 5.0
        assert pause.end_time == 5.8
        assert pause.duration == 0.8
        assert pause.is_sentence_boundary is False

    def test_pause_event_flags(self):
        """Test pause event classification flags"""
        pause = PauseEvent(
            analysis_id=uuid.uuid4(),
            pause_index=0,
            start_time=10.0,
            end_time=12.5,
            duration=2.5,
            is_sentence_boundary=True,
            is_unusually_long=True
        )

        assert pause.is_sentence_boundary is True
        assert pause.is_unusually_long is True
        assert pause.is_breathing_pause is False


class TestFillerWordEvent:
    """Tests for FillerWordEvent model"""

    def test_filler_word_event_creation(self):
        """Test creating a FillerWordEvent instance"""
        analysis_id = uuid.uuid4()

        filler = FillerWordEvent(
            analysis_id=analysis_id,
            filler_word="um",
            filler_type="hesitation",
            start_time=3.5,
            end_time=3.8,
            duration=0.3,
            word_index=15
        )

        assert filler.filler_word == "um"
        assert filler.filler_type == "hesitation"
        assert filler.word_index == 15

    def test_filler_word_with_context(self):
        """Test filler word with context"""
        filler = FillerWordEvent(
            analysis_id=uuid.uuid4(),
            filler_word="like",
            filler_type="discourse_marker",
            start_time=5.0,
            end_time=5.2,
            duration=0.2,
            word_index=20,
            preceding_word="it's",
            following_word="really",
            sentence_position="middle"
        )

        assert filler.preceding_word == "it's"
        assert filler.following_word == "really"
        assert filler.sentence_position == "middle"


class TestTimingAnomaly:
    """Tests for TimingAnomaly model"""

    def test_timing_anomaly_creation(self):
        """Test creating a TimingAnomaly instance"""
        analysis_id = uuid.uuid4()

        anomaly = TimingAnomaly(
            analysis_id=analysis_id,
            anomaly_type=AnomalyType.INSTANT_RESPONSE,
            severity="high",
            confidence=0.92,
            description="Response time significantly below expected threshold"
        )

        assert anomaly.anomaly_type == AnomalyType.INSTANT_RESPONSE
        assert anomaly.severity == "high"
        assert anomaly.confidence == 0.92

    def test_timing_anomaly_with_evidence(self):
        """Test anomaly with evidence data"""
        anomaly = TimingAnomaly(
            analysis_id=uuid.uuid4(),
            anomaly_type=AnomalyType.UNNATURAL_CONSISTENCY,
            severity="medium",
            confidence=0.85,
            description="Pause durations too consistent",
            expected_value=0.15,
            actual_value=0.02,
            risk_weight=0.2
        )

        assert anomaly.expected_value == 0.15
        assert anomaly.actual_value == 0.02
        assert anomaly.risk_weight == 0.2


class TestTimingSession:
    """Tests for TimingSession model"""

    def test_timing_session_creation(self):
        """Test creating a TimingSession instance"""
        session_id = uuid.uuid4()
        user_id = uuid.uuid4()

        session = TimingSession(
            session_id=session_id,
            user_id=user_id
        )

        assert session.session_id == session_id
        assert session.user_id == user_id
        assert session.total_answers == 0
        assert session.analyzed_answers == 0

    def test_update_from_analysis(self):
        """Test update_from_analysis method"""
        session = TimingSession(
            session_id=uuid.uuid4(),
            user_id=uuid.uuid4()
        )

        # Create mock analysis
        analysis = Mock()
        analysis.has_instant_response = True
        analysis.has_unnatural_consistency = False
        analysis.has_delayed_then_fluent = False
        analysis.has_robotic_pattern = True

        session.update_from_analysis(analysis)

        assert session.analyzed_answers == 1
        assert session.instant_response_count == 1
        assert session.unnatural_consistency_count == 0
        assert session.robotic_pattern_count == 1
        assert session.total_anomalies == 2


class TestFillerWordReference:
    """Tests for FillerWordReference model"""

    def test_filler_word_reference_creation(self):
        """Test creating a FillerWordReference instance"""
        ref = FillerWordReference(
            word="um",
            language="en",
            filler_type="hesitation",
            frequency_weight=1.0,
            suspicion_weight=1.0
        )

        assert ref.word == "um"
        assert ref.language == "en"
        assert ref.filler_type == "hesitation"
        assert ref.is_active is True


class TestTimingDatabaseManager:
    """Tests for TimingDatabaseManager"""

    @pytest.fixture
    def mock_session(self):
        """Create mock database session"""
        return Mock()

    @pytest.fixture
    def db_manager(self, mock_session):
        """Create database manager with mock session"""
        return TimingDatabaseManager(mock_session)

    def test_create_analysis(self, db_manager, mock_session):
        """Test create_analysis method"""
        session_id = uuid.uuid4()
        question_id = uuid.uuid4()
        now = datetime.utcnow()

        # Setup mock
        mock_session.add = Mock()
        mock_session.commit = Mock()
        mock_session.refresh = Mock()

        result = db_manager.create_analysis(
            session_id=session_id,
            question_id=question_id,
            audio_url="s3://bucket/test.mp3",
            question_asked_at=now,
            answer_start_at=now + timedelta(seconds=5)
        )

        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()

    def test_get_analysis(self, db_manager, mock_session):
        """Test get_analysis method"""
        analysis_id = uuid.uuid4()

        mock_query = Mock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = Mock(id=analysis_id)

        result = db_manager.get_analysis(analysis_id)

        mock_session.query.assert_called_once()
        assert result is not None

    def test_mark_analysis_failed(self, db_manager, mock_session):
        """Test mark_analysis_failed method"""
        analysis_id = uuid.uuid4()
        mock_analysis = Mock()
        mock_analysis.id = analysis_id

        mock_query = Mock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = mock_analysis

        result = db_manager.mark_analysis_failed(
            analysis_id=analysis_id,
            error_message="Processing failed"
        )

        assert mock_analysis.status == AnalysisStatus.FAILED
        assert mock_analysis.error_message == "Processing failed"
        mock_session.commit.assert_called()

    def test_save_transcription(self, db_manager, mock_session):
        """Test save_transcription method"""
        analysis_id = uuid.uuid4()

        mock_session.add = Mock()
        mock_session.commit = Mock()
        mock_session.refresh = Mock()

        result = db_manager.save_transcription(
            analysis_id=analysis_id,
            text="Test transcription",
            confidence=0.95,
            word_timestamps=[{"word": "Test", "start": 0, "end": 0.5}]
        )

        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()

    def test_save_pause_events(self, db_manager, mock_session):
        """Test save_pause_events method"""
        analysis_id = uuid.uuid4()
        pauses = [
            {"start": 1.0, "end": 1.5, "duration": 0.5},
            {"start": 3.0, "end": 4.0, "duration": 1.0}
        ]

        mock_session.add = Mock()
        mock_session.commit = Mock()

        result = db_manager.save_pause_events(
            analysis_id=analysis_id,
            pauses=pauses
        )

        assert mock_session.add.call_count == 2
        assert len(result) == 2

    def test_save_anomaly(self, db_manager, mock_session):
        """Test save_anomaly method"""
        analysis_id = uuid.uuid4()

        mock_session.add = Mock()
        mock_session.commit = Mock()
        mock_session.refresh = Mock()

        result = db_manager.save_anomaly(
            analysis_id=analysis_id,
            anomaly_type="instant_response",
            severity="high",
            confidence=0.9,
            description="Test anomaly",
            expected_value=5000.0,
            actual_value=1000.0
        )

        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
