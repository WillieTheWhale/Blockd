"""
Blockd Database Connection Utility
Provides connection pooling and context managers for database access.

Usage:
    from database.connection import DatabasePool, get_db_connection

    # Using context manager (recommended)
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users")
        results = cur.fetchall()

    # Using pool directly
    pool = DatabasePool()
    conn = pool.get_connection()
    try:
        # ... use connection ...
    finally:
        pool.return_connection(conn)
"""

import os
import logging
from contextlib import contextmanager
from typing import Optional
from urllib.parse import urlparse

try:
    import psycopg2
    from psycopg2.pool import ThreadedConnectionPool
    from psycopg2.extras import RealDictCursor, Json
except ImportError:
    raise ImportError(
        "psycopg2 is required. Install with: pip install psycopg2-binary"
    )

logger = logging.getLogger(__name__)


class DatabaseConfig:
    """Database configuration from environment variables."""

    def __init__(self):
        self.database_url = os.getenv(
            'BLOCKD_DATABASE_URL',
            'postgresql://blockd:password@localhost:5432/blockd_db'
        )

        # Parse URL for individual components
        parsed = urlparse(self.database_url)

        self.host = os.getenv('DB_HOST', parsed.hostname or 'localhost')
        self.port = int(os.getenv('DB_PORT', parsed.port or 5432))
        self.database = os.getenv('DB_NAME', parsed.path.lstrip('/') or 'blockd_db')
        self.user = os.getenv('DB_USER', parsed.username or 'blockd')
        self.password = os.getenv('DB_PASSWORD', parsed.password or 'password')

        # Connection pool settings
        self.min_connections = int(os.getenv('DB_POOL_MIN', '2'))
        self.max_connections = int(os.getenv('DB_POOL_MAX', '20'))

        # Connection timeout
        self.connect_timeout = int(os.getenv('DB_CONNECT_TIMEOUT', '10'))

    def get_connection_params(self) -> dict:
        """Get connection parameters as dictionary."""
        return {
            'host': self.host,
            'port': self.port,
            'database': self.database,
            'user': self.user,
            'password': self.password,
            'connect_timeout': self.connect_timeout,
            'options': '-c timezone=UTC'
        }

    def get_dsn(self) -> str:
        """Get connection string as DSN."""
        return (
            f"host={self.host} port={self.port} dbname={self.database} "
            f"user={self.user} password={self.password}"
        )


class DatabasePool:
    """
    Singleton connection pool for PostgreSQL.

    This class maintains a thread-safe connection pool that can be shared
    across the application.
    """

    _instance: Optional['DatabasePool'] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabasePool, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the connection pool (only once)."""
        if not DatabasePool._initialized:
            self.config = DatabaseConfig()
            self._create_pool()
            DatabasePool._initialized = True
            logger.info(
                f"Database pool initialized: {self.config.min_connections}-"
                f"{self.config.max_connections} connections"
            )

    def _create_pool(self):
        """Create the connection pool."""
        try:
            self.pool = ThreadedConnectionPool(
                minconn=self.config.min_connections,
                maxconn=self.config.max_connections,
                **self.config.get_connection_params()
            )
        except psycopg2.Error as e:
            logger.error(f"Failed to create connection pool: {e}")
            raise

    def get_connection(self):
        """
        Get a connection from the pool.

        Returns:
            psycopg2.connection: A database connection

        Note: You must call return_connection() when done!
        """
        try:
            conn = self.pool.getconn()
            logger.debug("Connection acquired from pool")
            return conn
        except psycopg2.Error as e:
            logger.error(f"Failed to get connection: {e}")
            raise

    def return_connection(self, conn, close: bool = False):
        """
        Return a connection to the pool.

        Args:
            conn: The connection to return
            close: If True, close the connection instead of returning to pool
        """
        try:
            if close:
                conn.close()
                logger.debug("Connection closed")
            else:
                self.pool.putconn(conn)
                logger.debug("Connection returned to pool")
        except psycopg2.Error as e:
            logger.error(f"Error returning connection: {e}")
            raise

    def close_all(self):
        """Close all connections in the pool."""
        if hasattr(self, 'pool') and self.pool:
            self.pool.closeall()
            logger.info("All pool connections closed")

    def test_connection(self) -> bool:
        """
        Test database connectivity.

        Returns:
            bool: True if connection successful, False otherwise
        """
        try:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT 1")
            result = cur.fetchone()
            cur.close()
            self.return_connection(conn)
            return result[0] == 1
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False


@contextmanager
def get_db_connection(cursor_factory=None):
    """
    Context manager for database connections.

    Args:
        cursor_factory: Optional cursor factory (e.g., RealDictCursor)

    Usage:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM users")

        # With dictionary cursor
        with get_db_connection(cursor_factory=RealDictCursor) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM users")
            rows = cur.fetchall()  # Returns list of dicts
    """
    pool = DatabasePool()
    conn = pool.get_connection()

    if cursor_factory:
        # Set cursor factory on connection
        original_cursor_factory = conn.cursor_factory
        conn.cursor_factory = cursor_factory

    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error, rolling back: {e}")
        raise
    finally:
        if cursor_factory:
            conn.cursor_factory = original_cursor_factory
        pool.return_connection(conn)


@contextmanager
def get_db_cursor(cursor_factory=None):
    """
    Context manager for database cursor.

    This automatically handles connection and cursor lifecycle.

    Args:
        cursor_factory: Optional cursor factory (e.g., RealDictCursor)

    Usage:
        with get_db_cursor() as cur:
            cur.execute("SELECT * FROM users")
            users = cur.fetchall()
    """
    with get_db_connection(cursor_factory=cursor_factory) as conn:
        cur = conn.cursor()
        try:
            yield cur
        finally:
            cur.close()


class DatabaseQueryHelper:
    """Helper class for common database operations."""

    @staticmethod
    def execute_query(query: str, params: tuple = None, fetch_one: bool = False):
        """
        Execute a SELECT query and return results.

        Args:
            query: SQL query string
            params: Query parameters
            fetch_one: If True, return single result instead of list

        Returns:
            Single row (if fetch_one=True) or list of rows
        """
        with get_db_cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if fetch_one:
                return cur.fetchone()
            return cur.fetchall()

    @staticmethod
    def execute_insert(query: str, params: tuple = None, returning: bool = False):
        """
        Execute an INSERT query.

        Args:
            query: SQL INSERT statement
            params: Query parameters
            returning: If True, return the inserted row (use RETURNING clause)

        Returns:
            Inserted row if returning=True, otherwise None
        """
        with get_db_cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if returning:
                return cur.fetchone()
            return None

    @staticmethod
    def execute_update(query: str, params: tuple = None) -> int:
        """
        Execute an UPDATE query.

        Args:
            query: SQL UPDATE statement
            params: Query parameters

        Returns:
            Number of rows affected
        """
        with get_db_cursor() as cur:
            cur.execute(query, params)
            return cur.rowcount

    @staticmethod
    def execute_delete(query: str, params: tuple = None) -> int:
        """
        Execute a DELETE query.

        Args:
            query: SQL DELETE statement
            params: Query parameters

        Returns:
            Number of rows deleted
        """
        with get_db_cursor() as cur:
            cur.execute(query, params)
            return cur.rowcount


# Convenience exports
__all__ = [
    'DatabasePool',
    'DatabaseConfig',
    'get_db_connection',
    'get_db_cursor',
    'DatabaseQueryHelper',
    'RealDictCursor',
    'Json'
]


if __name__ == '__main__':
    # Test the connection
    logging.basicConfig(level=logging.INFO)

    print("Testing database connection...")

    pool = DatabasePool()
    if pool.test_connection():
        print("✅ Database connection successful!")

        # Test query
        with get_db_cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT COUNT(*) as count FROM users")
            result = cur.fetchone()
            print(f"   Users in database: {result['count']}")

    else:
        print("❌ Database connection failed!")
