"""Database connection and session management"""

import logging
from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine, pool, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from .config import get_settings

logger = logging.getLogger(__name__)

# SQLAlchemy base
Base = declarative_base()

# Global engine and session maker
_engine = None
_SessionLocal = None


def get_engine():
    """Get or create database engine"""
    global _engine

    if _engine is None:
        settings = get_settings()

        _engine = create_engine(
            settings.DATABASE_URL,
            poolclass=pool.QueuePool,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_pre_ping=True,  # Verify connections before using
            echo=settings.DEBUG,
        )

        logger.info("Database engine created")

    return _engine


def get_session_maker():
    """Get or create session maker"""
    global _SessionLocal

    if _SessionLocal is None:
        engine = get_engine()
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=engine
        )

        logger.info("Session maker created")

    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """
    Dependency for FastAPI to get database session

    Usage:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)):
            ...
    """
    SessionLocal = get_session_maker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """
    Context manager for database session

    Usage:
        with get_db_session() as db:
            result = db.execute(...)
    """
    SessionLocal = get_session_maker()
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Database session error: {e}")
        raise
    finally:
        db.close()


def init_db():
    """Initialize database connection and verify connectivity"""
    try:
        engine = get_engine()

        # Test connection
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()

        logger.info("Database connection verified")

    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


def close_db():
    """Close database connections"""
    global _engine

    if _engine:
        _engine.dispose()
        logger.info("Database connections closed")
        _engine = None


async def health_check() -> bool:
    """Check database health"""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False
