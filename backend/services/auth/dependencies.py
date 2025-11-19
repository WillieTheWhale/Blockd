"""FastAPI dependency injection for authentication and authorization.

This module provides reusable dependencies for protecting routes with
authentication and role-based access control (RBAC).
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
import uuid
import logging

from .security import decode_token
from .models import UserInfo
from database.connection import DatabasePool

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> UserInfo:
    """
    Dependency to get current authenticated user from JWT token.

    This dependency validates the JWT token and retrieves the user's
    information from the database. Use this to protect routes that
    require authentication.

    Args:
        credentials: HTTP Bearer token from Authorization header

    Returns:
        UserInfo: Current authenticated user's information

    Raises:
        HTTPException: 401 if token is invalid/expired, 404 if user not found

    Example:
        ```python
        @app.get("/protected")
        async def protected_route(user: UserInfo = Depends(get_current_user)):
            return {"message": f"Hello {user.full_name}"}
        ```
    """
    try:
        payload = decode_token(credentials.credentials)
        user_id = uuid.UUID(payload['user_id'])

        conn = DatabasePool().get_connection()
        cur = conn.cursor()

        try:
            cur.execute("""
                SELECT id, email, full_name, role, organization_id, created_at
                FROM users WHERE id = %s AND is_active = true
            """, (user_id,))

            row = cur.fetchone()

            if not row:
                logger.warning(f"User not found or inactive: {user_id}")
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
        logger.warning(f"Token validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )


def require_role(required_role: str):
    """
    Dependency factory to require specific user role.

    Creates a dependency that checks if the current user has the required role.
    Use this for role-based access control (RBAC).

    Args:
        required_role: Role name required (e.g., 'interviewer', 'admin')

    Returns:
        Dependency function that validates user role

    Raises:
        HTTPException: 403 if user doesn't have required role

    Example:
        ```python
        @app.get("/interviewer-only")
        async def interviewer_route(
            user: UserInfo = Depends(require_role('interviewer'))
        ):
            return {"message": "Interviewer access granted"}
        ```
    """
    async def role_checker(current_user: UserInfo = Depends(get_current_user)):
        if current_user.role != required_role:
            logger.warning(
                f"Role check failed: {current_user.email} has role "
                f"{current_user.role}, requires {required_role}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {required_role} role"
            )
        return current_user
    return role_checker


def require_any_role(required_roles: List[str]):
    """
    Dependency factory to require any of the specified roles.

    Creates a dependency that checks if the current user has at least
    one of the required roles.

    Args:
        required_roles: List of acceptable role names

    Returns:
        Dependency function that validates user has one of the roles

    Raises:
        HTTPException: 403 if user doesn't have any required role

    Example:
        ```python
        @app.get("/staff-only")
        async def staff_route(
            user: UserInfo = Depends(require_any_role(['interviewer', 'admin']))
        ):
            return {"message": "Staff access granted"}
        ```
    """
    async def role_checker(current_user: UserInfo = Depends(get_current_user)):
        if current_user.role not in required_roles:
            logger.warning(
                f"Role check failed: {current_user.email} has role "
                f"{current_user.role}, requires one of {required_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of these roles: {', '.join(required_roles)}"
            )
        return current_user
    return role_checker


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    )
) -> Optional[UserInfo]:
    """
    Dependency to get current user if authenticated, None otherwise.

    This dependency is useful for routes that can work both with
    authenticated and unauthenticated users, but provide different
    functionality based on authentication status.

    Args:
        credentials: Optional HTTP Bearer token

    Returns:
        Optional[UserInfo]: User info if authenticated, None otherwise

    Example:
        ```python
        @app.get("/public-with-user-context")
        async def public_route(user: Optional[UserInfo] = Depends(get_optional_user)):
            if user:
                return {"message": f"Hello {user.full_name}"}
            return {"message": "Hello guest"}
        ```
    """
    if credentials is None:
        return None

    try:
        payload = decode_token(credentials.credentials)
        user_id = uuid.UUID(payload['user_id'])

        conn = DatabasePool().get_connection()
        cur = conn.cursor()

        try:
            cur.execute("""
                SELECT id, email, full_name, role, organization_id, created_at
                FROM users WHERE id = %s AND is_active = true
            """, (user_id,))

            row = cur.fetchone()

            if not row:
                return None

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

    except Exception as e:
        logger.debug(f"Optional auth failed (expected for unauthenticated): {e}")
        return None


def require_organization(organization_id: uuid.UUID):
    """
    Dependency factory to require user belongs to specific organization.

    Creates a dependency that checks if the current user belongs to
    the specified organization.

    Args:
        organization_id: Required organization UUID

    Returns:
        Dependency function that validates user's organization

    Raises:
        HTTPException: 403 if user not in required organization

    Example:
        ```python
        @app.get("/org-data/{org_id}")
        async def org_route(
            org_id: uuid.UUID,
            user: UserInfo = Depends(require_organization(org_id))
        ):
            return {"message": "Organization access granted"}
        ```
    """
    async def org_checker(current_user: UserInfo = Depends(get_current_user)):
        if current_user.organization_id != organization_id:
            logger.warning(
                f"Organization check failed: {current_user.email} belongs to "
                f"{current_user.organization_id}, requires {organization_id}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: wrong organization"
            )
        return current_user
    return org_checker
