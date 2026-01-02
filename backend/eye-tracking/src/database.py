"""
Database Connection and Models for Eye Tracking Service
Uses TimescaleDB for time-series gaze data
"""

from sqlalchemy import create_engine, Column, String, Float, Boolean, Integer, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from contextlib import contextmanager
from typing import Generator

from .config import settings

# SQLAlchemy Base
Base = declarative_base()


class GazeEvent(Base):
    """
    Gaze event model - stored in TimescaleDB hypertable
    Corresponds to gaze_events table created by Agent 1
    """
    __tablename__ = "gaze_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # Gaze coordinates (normalized 0-1)
    gaze_x = Column(Float, nullable=False)
    gaze_y = Column(Float, nullable=False)

    # Screen state
    is_off_screen = Column(Boolean, nullable=False, default=False)
    off_screen_direction = Column(String(10), nullable=True)  # left, right, up, down

    # Confidence and quality
    confidence = Column(Float, nullable=False)

    # Raw gaze vector (3D)
    gaze_vector_x = Column(Float, nullable=True)
    gaze_vector_y = Column(Float, nullable=True)
    gaze_vector_z = Column(Float, nullable=True)

    # Head pose (rotation angles in degrees)
    head_pitch = Column(Float, nullable=True)
    head_yaw = Column(Float, nullable=True)
    head_roll = Column(Float, nullable=True)

    # Filtering state
    is_filtered = Column(Boolean, nullable=False, default=True)
    raw_gaze_x = Column(Float, nullable=True)
    raw_gaze_y = Column(Float, nullable=True)


class GazeSession(Base):
    """Gaze session metadata"""
    __tablename__ = "gaze_sessions"

    session_id = Column(UUID(as_uuid=True), primary_key=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    # Calibration data
    is_calibrated = Column(Boolean, nullable=False, default=False)
    calibration_points = Column(JSON, nullable=True)  # Array of calibration points

    # Device info
    camera_resolution_width = Column(Integer, nullable=True)
    camera_resolution_height = Column(Integer, nullable=True)
    screen_resolution_width = Column(Integer, nullable=True)
    screen_resolution_height = Column(Integer, nullable=True)

    # Summary statistics (computed after session)
    total_duration_seconds = Column(Float, nullable=True)
    on_screen_percentage = Column(Float, nullable=True)
    average_confidence = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)


class GazeSummary(Base):
    """Pre-computed gaze session summaries"""
    __tablename__ = "gaze_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Statistics
    total_duration_seconds = Column(Float, nullable=False)
    on_screen_percentage = Column(Float, nullable=False)
    average_confidence = Column(Float, nullable=False)

    # Pattern detection results
    patterns_detected = Column(JSON, nullable=False)  # {reading: bool, drift: bool, shifty: {...}}

    # Off-screen events
    off_screen_events = Column(JSON, nullable=False)  # Array of events

    # Anomalies detected
    anomalies = Column(JSON, nullable=False)  # Array of anomalies

    # Heatmap
    heatmap_url = Column(String(500), nullable=True)

    # Risk assessment
    risk_score = Column(Float, nullable=False)
    risk_factors = Column(JSON, nullable=False)


class GazeAnomaly(Base):
    """Detected gaze anomalies"""
    __tablename__ = "gaze_anomalies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)

    # Anomaly details
    anomaly_type = Column(String(50), nullable=False)  # lstm, pattern, statistical
    anomaly_score = Column(Float, nullable=False)
    description = Column(String(500), nullable=False)

    # Context
    sequence_data = Column(JSON, nullable=True)  # Gaze sequence that triggered anomaly


# Database Engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_pre_ping=True,
    echo=settings.DEBUG
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_db() -> Generator:
    """
    Database session context manager
    Usage:
        with get_db() as db:
            db.query(GazeEvent).all()
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def get_db_session():
    """
    FastAPI dependency for database sessions
    Usage:
        @app.get("/")
        async def route(db: Session = Depends(get_db_session)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
