"""
Database connection and models for AI Detection Service
Uses SQLAlchemy with PostgreSQL and pgvector
"""
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import create_engine, Column, String, Text, Integer, DECIMAL, TIMESTAMP, JSON, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector

from .config import get_settings

settings = get_settings()

# Create engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    echo=settings.DEBUG,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


class AIAnswerCache(Base):
    """AI answer cache table with pgvector embeddings"""
    __tablename__ = "ai_answer_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_hash = Column(String(64), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    model_name = Column(String(50), nullable=False, index=True)
    answer_text = Column(Text, nullable=False)
    embedding = Column(Vector(384))  # 384-dimensional vector
    perplexity_score = Column(DECIMAL(10, 6))
    token_count = Column(Integer)
    metadata = Column(JSON, default={})
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_ai_answer_cache_hash_model', 'question_hash', 'model_name', unique=True),
    )


class AnswerAnalysis(Base):
    """Answer analysis results table"""
    __tablename__ = "answer_analysis"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    answer_text = Column(Text, nullable=False)
    answer_audio_url = Column(Text)
    transcription_text = Column(Text)
    risk_score = Column(DECIMAL(5, 4))
    similarity_scores = Column(JSON, default={})
    response_timing = Column(JSON, default={})
    perplexity_score = Column(DECIMAL(10, 6))
    is_ai_generated = Column(String(10))  # Using String instead of Boolean for compatibility
    confidence_score = Column(DECIMAL(5, 4))
    metadata = Column(JSON, default={})
    analyzed_at = Column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)


class Question(Base):
    """Questions table"""
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    question_order = Column(Integer)
    expected_duration = Column(Integer)
    difficulty = Column(String(20))
    asked_at = Column(TIMESTAMP(timezone=True))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)


def get_db() -> Session:
    """
    Get database session

    Yields:
        Database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session() -> Session:
    """
    Get database session (direct)

    Returns:
        Database session
    """
    return SessionLocal()


def close_db_session(db: Session):
    """
    Close database session

    Args:
        db: Database session
    """
    db.close()


class DatabaseManager:
    """Database operations manager"""

    def __init__(self, session: Optional[Session] = None):
        self.session = session or get_db_session()
        self.owns_session = session is None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.owns_session:
            self.session.close()

    def get_ai_answer_cache(
        self,
        question_hash: str,
        model_name: str
    ) -> Optional[AIAnswerCache]:
        """
        Get cached AI answer

        Args:
            question_hash: Question hash
            model_name: Model name

        Returns:
            Cached answer or None
        """
        return self.session.query(AIAnswerCache).filter(
            AIAnswerCache.question_hash == question_hash,
            AIAnswerCache.model_name == model_name
        ).first()

    def get_all_ai_answers_for_question(
        self,
        question_hash: str
    ) -> List[AIAnswerCache]:
        """
        Get all cached AI answers for a question

        Args:
            question_hash: Question hash

        Returns:
            List of cached answers
        """
        return self.session.query(AIAnswerCache).filter(
            AIAnswerCache.question_hash == question_hash
        ).all()

    def save_ai_answer_cache(
        self,
        question_hash: str,
        question_text: str,
        model_name: str,
        answer_text: str,
        embedding: List[float],
        perplexity_score: Optional[float] = None,
        token_count: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AIAnswerCache:
        """
        Save AI answer to cache

        Args:
            question_hash: Question hash
            question_text: Question text
            model_name: Model name
            answer_text: Answer text
            embedding: Embedding vector
            perplexity_score: Perplexity score
            token_count: Token count
            metadata: Additional metadata

        Returns:
            Saved cache entry
        """
        # Check if exists
        existing = self.get_ai_answer_cache(question_hash, model_name)

        if existing:
            # Update existing
            existing.answer_text = answer_text
            existing.embedding = embedding
            existing.perplexity_score = perplexity_score
            existing.token_count = token_count
            if metadata:
                existing.metadata = metadata
            self.session.commit()
            return existing
        else:
            # Create new
            cache_entry = AIAnswerCache(
                question_hash=question_hash,
                question_text=question_text,
                model_name=model_name,
                answer_text=answer_text,
                embedding=embedding,
                perplexity_score=perplexity_score,
                token_count=token_count,
                metadata=metadata or {}
            )
            self.session.add(cache_entry)
            self.session.commit()
            self.session.refresh(cache_entry)
            return cache_entry

    def save_answer_analysis(
        self,
        question_id: uuid.UUID,
        answer_text: str,
        risk_score: float,
        similarity_scores: Dict[str, float],
        perplexity_score: float,
        is_ai_generated: bool,
        confidence_score: float,
        response_timing: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AnswerAnalysis:
        """
        Save answer analysis result

        Args:
            question_id: Question ID
            answer_text: Answer text
            risk_score: Risk score
            similarity_scores: Similarity scores by model
            perplexity_score: Perplexity score
            is_ai_generated: AI generated flag
            confidence_score: Confidence score
            response_timing: Response timing data
            metadata: Additional metadata

        Returns:
            Saved analysis entry
        """
        analysis = AnswerAnalysis(
            question_id=question_id,
            answer_text=answer_text,
            risk_score=risk_score,
            similarity_scores=similarity_scores,
            perplexity_score=perplexity_score,
            is_ai_generated="true" if is_ai_generated else "false",
            confidence_score=confidence_score,
            response_timing=response_timing or {},
            metadata=metadata or {}
        )
        self.session.add(analysis)
        self.session.commit()
        self.session.refresh(analysis)
        return analysis

    def get_question(self, question_id: uuid.UUID) -> Optional[Question]:
        """
        Get question by ID

        Args:
            question_id: Question ID

        Returns:
            Question or None
        """
        return self.session.query(Question).filter(
            Question.id == question_id
        ).first()
