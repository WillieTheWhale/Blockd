"""Database connection pool management for Blockd.

This module provides a singleton connection pool for PostgreSQL database connections.
It manages connection lifecycle and ensures proper resource cleanup.
"""

import psycopg2
from psycopg2 import pool
import os
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class DatabasePool:
    """Singleton database connection pool manager."""

    _instance: Optional['DatabasePool'] = None
    _pool: Optional[pool.ThreadedConnectionPool] = None

    def __new__(cls):
        """Ensure only one instance of DatabasePool exists."""
        if cls._instance is None:
            cls._instance = super(DatabasePool, cls).__new__(cls)
            cls._instance._initialize_pool()
        return cls._instance

    def _initialize_pool(self):
        """Initialize the connection pool with environment variables."""
        if self._pool is not None:
            return

        try:
            self._pool = pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=20,
                host=os.getenv('DB_HOST', 'localhost'),
                port=int(os.getenv('DB_PORT', '5432')),
                database=os.getenv('DB_NAME', 'blockd_db'),
                user=os.getenv('DB_USER', 'blockd'),
                password=os.getenv('DB_PASSWORD', 'password')
            )
            logger.info("Database connection pool initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            raise

    def get_connection(self):
        """
        Get a connection from the pool.

        Returns:
            psycopg2.connection: A database connection from the pool

        Raises:
            Exception: If unable to get a connection from the pool
        """
        if self._pool is None:
            raise Exception("Database pool not initialized")

        try:
            conn = self._pool.getconn()
            logger.debug("Connection retrieved from pool")
            return conn
        except Exception as e:
            logger.error(f"Failed to get connection from pool: {e}")
            raise

    def return_connection(self, conn):
        """
        Return a connection to the pool.

        Args:
            conn: The connection to return to the pool
        """
        if self._pool is None:
            raise Exception("Database pool not initialized")

        try:
            self._pool.putconn(conn)
            logger.debug("Connection returned to pool")
        except Exception as e:
            logger.error(f"Failed to return connection to pool: {e}")
            raise

    def close_all_connections(self):
        """Close all connections in the pool."""
        if self._pool is not None:
            self._pool.closeall()
            logger.info("All database connections closed")

    @classmethod
    def reset_instance(cls):
        """Reset the singleton instance (useful for testing)."""
        if cls._instance is not None and cls._instance._pool is not None:
            cls._instance._pool.closeall()
        cls._instance = None
        cls._pool = None
