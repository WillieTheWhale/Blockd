"""Authentication routes and endpoints.

This module provides all authentication-related API endpoints including
user registration, login, token refresh, and session management.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import psycopg2
import uuid
from datetime import datetime, timedelta
import logging

from .models import (
    UserRegister,
    UserLogin,
    TokenResponse,
    SessionTokenRequest,
    SessionTokenResponse,
    TokenRefresh,
    UserInfo
)
from .security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_session_token,
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES
)
from database.connection import DatabasePool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer()


@router.post(
    "/register",
    response_model=UserInfo,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user",
    description="Create a new user account with email and password"
)
async def register_user(user_data: UserRegister):
    """
    Register a new user with email, password, and role.

    - **email**: Valid email address (must be unique)
    - **password**: Strong password (min 8 chars, uppercase, digit, special char)
    - **full_name**: User's full name
    - **role**: Either 'interviewer' or 'interviewee'
    - **organization_id**: Optional organization UUID
    """
    conn = DatabasePool().get_connection()
    cur = conn.cursor()

    try:
        # Check if email already exists
        cur.execute("SELECT id FROM users WHERE email = %s", (user_data.email,))
        if cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Hash password
        password_hash = hash_password(user_data.password)

        # Insert user
        user_id = uuid.uuid4()
        cur.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, organization_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, email, full_name, role, organization_id, created_at
        """, (
            user_id,
            user_data.email,
            password_hash,
            user_data.full_name,
            user_data.role,
            user_data.organization_id
        ))

        row = cur.fetchone()
        conn.commit()

        logger.info(f"User registered successfully: {user_data.email}")

        return UserInfo(
            id=row[0],
            email=row[1],
            full_name=row[2],
            role=row[3],
            organization_id=row[4],
            created_at=row[5]
        )

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Registration failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )
    finally:
        cur.close()
        DatabasePool().return_connection(conn)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user",
    description="Login with email and password to receive JWT tokens"
)
async def login(credentials: UserLogin):
    """
    Authenticate user and return access and refresh tokens.

    - **email**: User's email address
    - **password**: User's password

    Returns JWT access token (1 hour) and refresh token (7 days).
    """
    conn = DatabasePool().get_connection()
    cur = conn.cursor()

    try:
        # Fetch user
        cur.execute("""
            SELECT id, email, password_hash, role, is_active
            FROM users WHERE email = %s
        """, (credentials.email,))

        row = cur.fetchone()
        if not row:
            logger.warning(f"Login attempt for non-existent user: {credentials.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )

        user_id, email, password_hash, role, is_active = row

        if not is_active:
            logger.warning(f"Login attempt for disabled account: {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account disabled"
            )

        # Verify password
        if not verify_password(credentials.password, password_hash):
            logger.warning(f"Invalid password for user: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )

        # Update last login
        cur.execute("""
            UPDATE users SET last_login_at = NOW()
            WHERE id = %s
        """, (user_id,))
        conn.commit()

        # Generate tokens
        access_token = create_access_token(user_id, email, role)
        refresh_token = create_refresh_token(user_id)

        logger.info(f"User logged in successfully: {email}")

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    finally:
        cur.close()
        DatabasePool().return_connection(conn)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    description="Use refresh token to obtain new access and refresh tokens"
)
async def refresh_token(token_data: TokenRefresh):
    """
    Refresh access token using a valid refresh token.

    - **refresh_token**: Valid JWT refresh token

    Returns new access token and refresh token.
    """
    try:
        payload = decode_token(token_data.refresh_token)

        if payload.get('type') != 'refresh':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )

        user_id = uuid.UUID(payload['user_id'])

        # Fetch user info
        conn = DatabasePool().get_connection()
        cur = conn.cursor()

        try:
            cur.execute("""
                SELECT email, role, is_active FROM users WHERE id = %s
            """, (user_id,))

            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found"
                )

            email, role, is_active = row

            if not is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account disabled"
                )

            # Generate new tokens
            access_token = create_access_token(user_id, email, role)
            refresh_token = create_refresh_token(user_id)

            logger.info(f"Token refreshed for user: {email}")

            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
            )

        finally:
            cur.close()
            DatabasePool().return_connection(conn)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )


@router.get(
    "/me",
    response_model=UserInfo,
    summary="Get current user",
    description="Retrieve current authenticated user's information"
)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Get current authenticated user's information from JWT token.

    Requires valid JWT access token in Authorization header.
    """
    try:
        payload = decode_token(credentials.credentials)
        user_id = uuid.UUID(payload['user_id'])

        conn = DatabasePool().get_connection()
        cur = conn.cursor()

        try:
            cur.execute("""
                SELECT id, email, full_name, role, organization_id, created_at
                FROM users WHERE id = %s
            """, (user_id,))

            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )

            return UserInfo(
                id=row[0],
                email=row[1],
                full_name=row[2],
                role=row[3],
                organization_id=row[4],
                created_at=row[5]
            )

        finally:
            cur.close()
            DatabasePool().return_connection(conn)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )


@router.post(
    "/session-token",
    response_model=SessionTokenResponse,
    summary="Generate session token",
    description="Create session token for browser-based authentication"
)
async def create_session_token(
    request: SessionTokenRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Generate session token for browser authentication.

    This endpoint allows interviewers to create session tokens that
    interviewees can use to join sessions without traditional login.

    - **session_id**: UUID of the interview session

    Requires interviewer authentication.
    """
    try:
        payload = decode_token(credentials.credentials)
        interviewer_id = uuid.UUID(payload['user_id'])

        conn = DatabasePool().get_connection()
        cur = conn.cursor()

        try:
            # Verify session belongs to this interviewer
            cur.execute("""
                SELECT id, interviewer_id, interviewee_id
                FROM sessions
                WHERE id = %s AND interviewer_id = %s
            """, (request.session_id, interviewer_id))

            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Session not found or unauthorized"
                )

            session_id, _, interviewee_id = row

            # Generate and save session token
            session_token = generate_session_token()
            expires_at = datetime.utcnow() + timedelta(hours=4)

            cur.execute("""
                UPDATE sessions
                SET session_token = %s
                WHERE id = %s
            """, (session_token, session_id))

            conn.commit()

            logger.info(f"Session token created for session: {session_id}")

            return SessionTokenResponse(
                session_token=session_token,
                session_id=session_id,
                interviewer_id=interviewer_id,
                interviewee_id=interviewee_id,
                expires_at=expires_at
            )

        finally:
            cur.close()
            DatabasePool().return_connection(conn)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )


@router.get(
    "/validate-session-token/{session_token}",
    status_code=status.HTTP_200_OK,
    summary="Validate session token",
    description="Verify session token for browser authentication"
)
async def validate_session_token(session_token: str):
    """
    Validate session token for browser authentication.

    Used by WebSocket server to authenticate browser connections.

    - **session_token**: Session token to validate

    Returns session validity and session_id if valid.
    """
    conn = DatabasePool().get_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT id, status FROM sessions
            WHERE session_token = %s
        """, (session_token,))

        row = cur.fetchone()
        if not row:
            logger.warning(f"Invalid session token attempted: {session_token[:10]}...")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session token"
            )

        session_id, session_status = row

        if session_status != 'active':
            logger.warning(f"Session {session_id} is {session_status}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Session is {session_status}"
            )

        logger.info(f"Session token validated for session: {session_id}")

        return {"valid": True, "session_id": str(session_id)}

    finally:
        cur.close()
        DatabasePool().return_connection(conn)
