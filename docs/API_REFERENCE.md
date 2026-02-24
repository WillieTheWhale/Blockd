# Blockd API Reference

Complete API documentation for the Blockd interview integrity platform. This reference covers all REST endpoints, authentication methods, request/response formats, error handling, and rate limiting.

## Table of Contents

1. [Overview](#overview)
2. [Base URLs](#base-urls)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [API Endpoints](#api-endpoints)
   - [Health](#health)
   - [Authentication](#authentication-endpoints)
   - [Sessions](#sessions)
   - [Browser Client](#browser-client)
   - [Analysis](#analysis)
   - [Gaze Tracking](#gaze-tracking)
   - [Reports](#reports)
6. [Error Handling](#error-handling)
7. [WebSocket Endpoints](#websocket-endpoints)

---

## Overview

The Blockd API Gateway provides a production-grade REST API for managing interview sessions, detecting AI-generated content, tracking gaze patterns, and generating integrity reports.

**Current Version**: 1.0.0

**Technology Stack**:
- Framework: Fastify 5.x
- Runtime: Node.js 24.11.0 LTS
- Language: TypeScript 5.9.3
- Database: PostgreSQL 18.1 (via Prisma ORM)
- Cache: Redis 8.4

---

## Base URLs

### Production
```
https://api.blockd.site/api/v1
```

### Development
```
http://localhost:3000/api/v1
```

**Note**: All examples in this reference use the `/api/v1` base path prefix.

---

## Authentication

### JWT Bearer Tokens

The Blockd API uses **JWT (JSON Web Tokens)** with RS256 encryption for authentication.

#### Token Types

| Token Type | Algorithm | Expiry | Purpose |
|-----------|-----------|--------|---------|
| Access Token | RS256 (2048-bit RSA) | 1 hour | API request authentication |
| Refresh Token | Random 32-byte token | 7 days | Generate new access tokens |

#### Obtaining Tokens

Tokens are obtained through three methods:

1. **User Registration** - Returns tokens immediately
2. **User Login** - Returns tokens after credential verification
3. **Token Refresh** - Returns new access token using existing refresh token

#### Using Tokens

Include the access token in the `Authorization` header as a Bearer token:

```bash
curl -X GET https://api.blockd.site/api/v1/sessions \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Token Payload (Access Token)

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": "interviewer",
  "organizationId": "123e4567-e89b-12d3-a456-426614174000",
  "iat": 1703414400,
  "exp": 1703418000,
  "iss": "blockd-auth",
  "aud": "blockd-api"
}
```

#### Token Refresh Flow

When an access token expires (401 response), use the refresh token to obtain a new one:

```bash
curl -X POST https://api.blockd.site/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "existing_refresh_token_string"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "new_jwt_token",
      "refreshToken": "new_refresh_token",
      "expiresIn": 3600
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

## Rate Limiting

Rate limits are enforced to protect the API from abuse and ensure fair resource usage.

### Default Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Public endpoints | 100 requests | 1 minute |
| Authenticated endpoints | 500 requests | 1 minute |
| Sensitive operations | 10 requests | 1 minute |

**Sensitive operations** include: registration, login, password reset, MFA setup, and token refresh.

### Rate Limit Headers

All responses include rate limit information:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in current window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds to wait before retrying (when limited) |

### Example Response Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1703414460
```

### Account Lockout

After 5 failed login attempts within 15 minutes, the account is temporarily locked for 15 minutes.

---

## API Endpoints

### Health

#### GET /health

Health check endpoint for monitoring API availability and dependencies.

**Requires Authentication**: No

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-11-24T12:00:00.000Z",
    "uptime": 86400.5,
    "services": {
      "database": "healthy",
      "redis": "healthy"
    }
  }
}
```

**Response (503)**:
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "One or more services are unavailable",
    "statusCode": 503,
    "details": {
      "database": "unavailable",
      "redis": "healthy"
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

### Authentication Endpoints

#### POST /auth/register

Create a new user account.

**Requires Authentication**: No

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@#",
  "firstName": "John",
  "lastName": "Doe",
  "role": "interviewer",
  "organizationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Password Requirements**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character (!@#$%^&*)

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | User's email address (must be unique) |
| password | string | Yes | User's password (must meet requirements) |
| firstName | string | No | User's first name (max 100 chars) |
| lastName | string | No | User's last name (max 100 chars) |
| role | enum | No | User role: `admin`, `interviewer`, `interviewee` (default: `interviewee`) |
| organizationId | string (UUID) | No | Organization the user belongs to |

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "interviewer",
      "organizationId": "123e4567-e89b-12d3-a456-426614174000",
      "mfaEnabled": false,
      "emailVerified": false
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "b7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "expiresIn": 3600
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password requirements: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char",
    "statusCode": 400,
    "details": {
      "requirements": ["uppercase", "digit", "special_char"]
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (409)**:
```json
{
  "success": false,
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "Email already registered",
    "statusCode": 409
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /auth/login

Authenticate a user and receive JWT tokens.

**Requires Authentication**: No

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@#",
  "mfaCode": "123456"
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | User's email address |
| password | string | Yes | User's password |
| mfaCode | string | No | 6-digit MFA code (required if MFA enabled) |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "role": "interviewer",
      "mfaEnabled": false,
      "emailVerified": true
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "b7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "expiresIn": 3600
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Response (200 - MFA Required)**:
```json
{
  "success": true,
  "data": {
    "requiresMfa": true,
    "mfaToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (401)**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "statusCode": 401
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (429 - Account Locked)**:
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Too many failed attempts. Account locked for 15 minutes.",
    "statusCode": 429,
    "details": {
      "lockedUntil": "2025-11-24T12:15:00.000Z"
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /auth/refresh

Refresh an expired access token using a refresh token.

**Requires Authentication**: No

**Request**:
```json
{
  "refreshToken": "b7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "new_refresh_token_string",
      "expiresIn": 3600
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (401)**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired refresh token",
    "statusCode": 401
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### GET /auth/me

Get the currently authenticated user's details.

**Requires Authentication**: Yes (Bearer token)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "interviewer",
    "organizationId": "123e4567-e89b-12d3-a456-426614174000",
    "mfaEnabled": true,
    "emailVerified": true,
    "createdAt": "2025-11-24T12:00:00.000Z"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /auth/change-password

Change the authenticated user's password.

**Requires Authentication**: Yes (Bearer token)

**Request**:
```json
{
  "currentPassword": "OldSecurePass123!",
  "newPassword": "NewSecurePass456!"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (401)**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "Current password is incorrect",
    "statusCode": 401
  }
}
```

---

#### POST /auth/forgot-password

Request a password reset email.

**Requires Authentication**: No

**Rate Limit**: 3 requests per hour per IP

**Request**:
```json
{
  "email": "user@example.com"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "message": "If an account exists with this email, a reset link has been sent"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /auth/reset-password

Complete password reset using token from email.

**Requires Authentication**: No

**Request**:
```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecurePass456!"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "message": "Password reset successfully"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /auth/mfa/disable

Disable MFA for the authenticated user's account.

**Requires Authentication**: Yes (Bearer token with MFA verified)

**Request**:
```json
{
  "password": "CurrentPassword123!",
  "mfaCode": "123456"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "message": "MFA disabled successfully",
    "mfaEnabled": false
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### GET /auth/oauth/state

Generate a cryptographically secure OAuth state parameter for CSRF protection.

**Requires Authentication**: No

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "state": "cryptographically_secure_random_state_string",
    "expiresAt": "2025-11-24T12:15:00.000Z"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /auth/logout

Revoke the current refresh token and invalidate the session.

**Requires Authentication**: Yes (Bearer token)

**Request**:
```json
{
  "refreshToken": "b7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

### Users

#### GET /users/me

Get the current authenticated user's profile.

**Requires Authentication**: Yes (Bearer token)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "interviewer",
    "organizationId": "123e4567-e89b-12d3-a456-426614174000",
    "mfaEnabled": true,
    "emailVerified": true,
    "createdAt": "2025-11-24T12:00:00.000Z",
    "updatedAt": "2025-11-24T12:00:00.000Z"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### PUT /users/me

Update the current authenticated user's profile.

**Requires Authentication**: Yes (Bearer token)

**Request**:
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "timezone": "America/New_York",
  "preferences": {
    "emailNotifications": true,
    "darkMode": false
  }
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| firstName | string | No | User's first name (max 100 chars) |
| lastName | string | No | User's last name (max 100 chars) |
| timezone | string | No | User's timezone (IANA format) |
| preferences | object | No | User preferences |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Smith",
    "role": "interviewer",
    "timezone": "America/New_York",
    "preferences": {
      "emailNotifications": true,
      "darkMode": false
    },
    "updatedAt": "2025-11-24T12:30:00.000Z"
  },
  "meta": {
    "timestamp": "2025-11-24T12:30:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

### Sessions

#### POST /sessions

Create a new interview session.

**Requires Authentication**: Yes (Bearer token)

**Request**:
```json
{
  "intervieweeEmail": "candidate@example.com",
  "intervieweeId": "550e8400-e29b-41d4-a716-446655440001",
  "scheduledStart": "2025-12-01T14:00:00Z",
  "metadata": {
    "jobTitle": "Senior Engineer",
    "position": "Engineering",
    "difficulty": "hard"
  }
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| intervieweeEmail | string | Yes | Email of the interviewee |
| intervieweeId | string (UUID) | No | ID of the interviewee (if existing user) |
| scheduledStart | string (ISO 8601) | Yes | Session start time |
| metadata | object | No | Custom metadata (e.g., job title, position) |

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "interviewerId": "550e8400-e29b-41d4-a716-446655440000",
    "intervieweeId": "550e8400-e29b-41d4-a716-446655440001",
    "intervieweeEmail": "candidate@example.com",
    "organizationId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "scheduled",
    "sessionToken": "session_token_string",
    "scheduledStart": "2025-12-01T14:00:00Z",
    "actualStart": null,
    "actualEnd": null,
    "durationMinutes": null,
    "riskScore": null
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### GET /sessions

List all interview sessions with pagination and filtering.

**Requires Authentication**: Yes (Bearer token)

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| pageSize | integer | No | Items per page (default: 20, max: 100) |
| status | string | No | Filter by status: `scheduled`, `active`, `ended`, `cancelled` |
| interviewerId | string (UUID) | No | Filter by interviewer ID |
| intervieweeId | string (UUID) | No | Filter by interviewee ID |

**Example Request**:
```bash
curl -X GET "https://api.blockd.site/api/v1/sessions?page=1&pageSize=20&status=active" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "interviewerId": "550e8400-e29b-41d4-a716-446655440000",
      "intervieweeId": "550e8400-e29b-41d4-a716-446655440001",
      "status": "active",
      "scheduledStart": "2025-12-01T14:00:00Z",
      "actualStart": "2025-12-01T14:02:30Z",
      "riskScore": 0.35
    },
    {
      "id": "223e4567-e89b-12d3-a456-426614174002",
      "interviewerId": "550e8400-e29b-41d4-a716-446655440000",
      "intervieweeId": "550e8400-e29b-41d4-a716-446655440002",
      "status": "scheduled",
      "scheduledStart": "2025-12-02T10:00:00Z",
      "actualStart": null,
      "riskScore": null
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalPages": 5,
    "totalItems": 87,
    "hasNext": true,
    "hasPrev": false
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### GET /sessions/{id}

Get details of a specific interview session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "interviewerId": "550e8400-e29b-41d4-a716-446655440000",
    "intervieweeId": "550e8400-e29b-41d4-a716-446655440001",
    "intervieweeEmail": "candidate@example.com",
    "organizationId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "active",
    "sessionToken": "session_token_string",
    "scheduledStart": "2025-12-01T14:00:00Z",
    "actualStart": "2025-12-01T14:02:30Z",
    "actualEnd": null,
    "durationMinutes": null,
    "riskScore": 0.35
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (404)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Session not found",
    "statusCode": 404
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /sessions/{id}/start

Start an interview session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "status": "active",
    "actualStart": "2025-12-01T14:02:30Z",
    "riskScore": 0
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Session cannot be started (already active or ended)",
    "statusCode": 400
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /sessions/{id}/end

End an interview session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "status": "ended",
    "actualEnd": "2025-12-01T14:52:30Z",
    "durationMinutes": 50,
    "riskScore": 0.42
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### PUT /sessions/{id}

Update an interview session's details.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Request**:
```json
{
  "scheduledStart": "2025-12-02T14:00:00Z",
  "metadata": {
    "jobTitle": "Senior Engineer",
    "notes": "Rescheduled from original date"
  }
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "status": "scheduled",
    "scheduledStart": "2025-12-02T14:00:00Z",
    "metadata": {
      "jobTitle": "Senior Engineer",
      "notes": "Rescheduled from original date"
    },
    "updatedAt": "2025-11-24T12:00:00.000Z"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### DELETE /sessions/{id}

Delete or cancel an interview session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| reason | string | No | Cancellation reason |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "status": "cancelled",
    "cancelledAt": "2025-11-24T12:00:00.000Z",
    "cancellationReason": "Candidate withdrew application"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### GET /sessions/{id}/questions

Get all questions for a session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440200",
      "questionText": "Explain the difference between SQL and NoSQL databases",
      "difficulty": "medium",
      "expectedDuration": 300,
      "order": 1,
      "answered": true,
      "answeredAt": "2025-12-01T14:15:30Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440201",
      "questionText": "Describe your experience with microservices architecture",
      "difficulty": "hard",
      "expectedDuration": 420,
      "order": 2,
      "answered": false,
      "answeredAt": null
    }
  ],
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /sessions/{id}/answer

Submit an answer for a question in the session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Request**:
```json
{
  "questionId": "550e8400-e29b-41d4-a716-446655440200",
  "answerText": "SQL databases are relational databases that use structured query language...",
  "responseTime": 180
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440300",
    "questionId": "550e8400-e29b-41d4-a716-446655440200",
    "sessionId": "123e4567-e89b-12d3-a456-426614174001",
    "answerText": "SQL databases are relational databases...",
    "responseTime": 180,
    "submittedAt": "2025-12-01T14:15:30Z",
    "analysisStatus": "pending"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

### Browser Client

#### POST /browser/session/validate

Validate a session token from the browser client. Used by the Blockd browser extension to validate the session before starting.

**Requires Authentication**: No

**Request**:
```json
{
  "sessionToken": "session_token_string"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "sessionId": "123e4567-e89b-12d3-a456-426614174001",
    "expiresAt": "2025-12-01T15:00:00Z"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Response (200 - Invalid Token)**:
```json
{
  "success": true,
  "data": {
    "valid": false
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /browser/security/event

Report a security event detected by the browser client.

**Requires Authentication**: No

**Request**:
```json
{
  "sessionId": "123e4567-e89b-12d3-a456-426614174001",
  "eventType": "window_focus_changed",
  "severity": "medium",
  "description": "User switched to another window",
  "metadata": {
    "previousWindow": "Chrome",
    "newWindow": "VS Code",
    "timestamp": "2025-12-01T14:15:30Z"
  }
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string (UUID) | Yes | Session ID |
| eventType | enum | Yes | Type of security event |
| severity | enum | No | Severity level: `low`, `medium`, `high`, `critical` |
| description | string | No | Event description |
| metadata | object | No | Additional event metadata |

**Supported Event Types**:
- `suspicious_process` - Suspicious process detected
- `screen_recording_detected` - Screen recording software detected
- `vm_detected` - Virtual machine detected
- `window_focus_changed` - User changed active window
- `multi_monitor_detected` - Multiple monitors detected
- `unauthorized_browser` - Unauthorized browser detected
- `copy_paste_detected` - Copy/paste activity detected
- `keyboard_shortcut_blocked` - Keyboard shortcut attempt blocked

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440100",
    "sessionId": "123e4567-e89b-12d3-a456-426614174001",
    "eventType": "window_focus_changed",
    "severity": "medium",
    "timestamp": "2025-12-01T14:15:30Z"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

### Analysis

#### POST /analysis/question

Analyze an interview question and generate AI reference answers.

**Requires Authentication**: Yes (Bearer token)

**Request**:
```json
{
  "sessionId": "123e4567-e89b-12d3-a456-426614174001",
  "questionText": "Explain the difference between SQL and NoSQL databases",
  "difficulty": "medium",
  "expectedDuration": 300
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string (UUID) | Yes | Session ID |
| questionText | string | Yes | Question text (1-5000 chars) |
| difficulty | enum | No | Difficulty: `easy`, `medium`, `hard`, `expert` |
| expectedDuration | integer | No | Expected response time in seconds (1-3600) |

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "questionId": "550e8400-e29b-41d4-a716-446655440200",
    "questionText": "Explain the difference between SQL and NoSQL databases",
    "difficulty": "medium",
    "aiAnswers": [
      {
        "model": "Claude 3 Sonnet",
        "answer": "SQL databases are relational and use structured schemas with ACID transactions. NoSQL databases are non-relational, offering flexible schemas and horizontal scalability. SQL excels with complex queries and data integrity, while NoSQL handles massive scale and unstructured data better.",
        "confidence": 0.92
      },
      {
        "model": "GPT-4",
        "answer": "The main differences are: (1) Structure - SQL uses tables, NoSQL uses documents/graphs. (2) Scaling - SQL scales vertically, NoSQL horizontally. (3) Queries - SQL uses structured queries, NoSQL uses flexible queries. (4) Transactions - SQL has ACID, NoSQL varies.",
        "confidence": 0.89
      }
    ]
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### POST /analysis/answer

Analyze a candidate's answer for AI detection and quality assessment.

**Requires Authentication**: Yes (Bearer token)

**Request**:
```json
{
  "questionId": "550e8400-e29b-41d4-a716-446655440200",
  "answerText": "SQL databases use structured schemas with tables and rows, supporting ACID transactions. NoSQL databases provide flexible schemas and horizontal scalability for handling massive datasets.",
  "answerAudioUrl": "https://example.com/audio/answer.mp3",
  "transcriptionText": "SQL databases use structured schemas...",
  "responseTime": 180
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| questionId | string (UUID) | Yes | Question ID from analysis/question |
| answerText | string | Yes | Candidate's answer text (1-10000 chars) |
| answerAudioUrl | string (URL) | No | URL to audio recording of answer |
| transcriptionText | string | No | Transcription of audio answer |
| responseTime | integer | No | Time taken to answer in seconds |

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "analysisId": "550e8400-e29b-41d4-a716-446655440300",
    "questionId": "550e8400-e29b-41d4-a716-446655440200",
    "riskScore": 0.15,
    "isAiGenerated": false,
    "confidence": 0.94,
    "similarityScores": {
      "claude_3_sonnet": 0.62,
      "gpt_4": 0.58,
      "gpt_35_turbo": 0.55,
      "average": 0.58
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Risk Score Interpretation**:
- `0.0 - 0.3`: Low risk (likely human)
- `0.3 - 0.6`: Medium risk (uncertain)
- `0.6 - 0.9`: High risk (likely AI-assisted)
- `0.9 - 1.0`: Critical risk (very likely AI-generated)

---

### Gaze Tracking

#### GET /gaze/summary/{session_id}

Get aggregated gaze tracking data for a session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| session_id | string (UUID) | Session ID |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "sessionId": "123e4567-e89b-12d3-a456-426614174001",
    "totalEvents": 8452,
    "offScreenEvents": 342,
    "offScreenPercentage": 4.05,
    "averageConfidence": 0.87
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Interpretation**:
- **offScreenPercentage**: Percentage of time candidate was not looking at screen
- **averageConfidence**: Confidence level of gaze detection (0-1)
- High off-screen percentage may indicate suspicious behavior

---

### Reports

#### GET /reports

List all reports with pagination and filtering.

**Requires Authentication**: Yes (Bearer token)

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| pageSize | integer | No | Items per page (default: 20, max: 50) |
| status | string | No | Filter by status: `pending`, `completed`, `failed` |
| startDate | string (ISO 8601) | No | Filter reports after this date |
| endDate | string (ISO 8601) | No | Filter reports before this date |

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440400",
      "sessionId": "123e4567-e89b-12d3-a456-426614174001",
      "status": "completed",
      "overallRiskScore": 0.42,
      "createdAt": "2025-12-01T15:00:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440401",
      "sessionId": "123e4567-e89b-12d3-a456-426614174002",
      "status": "pending",
      "overallRiskScore": null,
      "createdAt": "2025-12-01T14:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalPages": 3,
    "totalItems": 45,
    "hasNext": true,
    "hasPrev": false
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### GET /reports/{session_id}

Get the analysis report for a completed session.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| session_id | string (UUID) | Session ID |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440400",
    "sessionId": "123e4567-e89b-12d3-a456-426614174001",
    "overallRiskScore": 0.42,
    "aiDetectionScore": 0.38,
    "gazeAnomalyScore": 0.28,
    "securityEventsCount": 3,
    "recommendations": [
      "Review candidate's responses for AI-assisted content",
      "Candidate looked away from screen 4% of the time",
      "One window focus change detected - may indicate reference materials"
    ]
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

**Score Interpretation**:

| Score | Assessment |
|-------|------------|
| 0.0 - 0.25 | Low risk - likely legitimate |
| 0.25 - 0.50 | Medium risk - verify responses |
| 0.50 - 0.75 | High risk - conduct review |
| 0.75 - 1.0 | Critical risk - recommend rejection |

---

#### DELETE /reports/{id}

Delete a report.

**Requires Authentication**: Yes (Bearer token)

**Required Role**: Admin or report owner

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Report ID |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "message": "Report deleted successfully"
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

#### GET /reports/{id}/download

Download a report as PDF.

**Requires Authentication**: Yes (Bearer token)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Report ID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| format | string | No | Output format: `pdf` (default), `json` |

**Response (200)**:
- Content-Type: `application/pdf` or `application/json`
- Content-Disposition: `attachment; filename="report-{session_id}.pdf"`

Returns the report file as a binary download.

**Error Response (404)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Report not found or not yet generated",
    "statusCode": 404
  }
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "details": {
      "field": "email",
      "issue": "Invalid format"
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

### HTTP Status Codes

| Status Code | Error Code | Description |
|------------|-----------|-------------|
| 400 | BAD_REQUEST | Invalid request or validation error |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Resource conflict (e.g., email exists) |
| 422 | VALIDATION_ERROR | Request validation failed |
| 429 | RATE_LIMIT_EXCEEDED | Too many requests |
| 500 | INTERNAL_SERVER_ERROR | Server error |
| 503 | SERVICE_UNAVAILABLE | Service temporarily unavailable |

### Common Error Codes

#### Authentication Errors

| Code | HTTP | Description |
|------|------|-------------|
| INVALID_CREDENTIALS | 401 | Email or password incorrect |
| UNAUTHORIZED | 401 | Authentication required |
| TOKEN_EXPIRED | 401 | Access token has expired |
| INVALID_TOKEN | 401 | Invalid or malformed token |
| MFA_REQUIRED | 403 | MFA verification required |
| EMAIL_NOT_VERIFIED | 403 | Email verification required |

#### Validation Errors

| Code | HTTP | Description |
|------|------|-------------|
| WEAK_PASSWORD | 400 | Password doesn't meet requirements |
| VALIDATION_ERROR | 422 | Input validation failed |
| EMAIL_EXISTS | 409 | Email already registered |
| INVALID_EMAIL_FORMAT | 400 | Email format invalid |

#### Rate Limiting Errors

| Code | HTTP | Description |
|------|------|-------------|
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| ACCOUNT_LOCKED | 429 | Account locked after failed attempts |

#### Resource Errors

| Code | HTTP | Description |
|------|------|-------------|
| NOT_FOUND | 404 | Resource not found |
| SESSION_INVALID | 400 | Session is invalid or expired |

### Validation Error Response

When validation fails, the error includes details about each field:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "statusCode": 422,
    "details": {
      "errors": [
        {
          "field": "email",
          "message": "Invalid email format",
          "code": "INVALID_FORMAT"
        },
        {
          "field": "password",
          "message": "Password must be at least 8 characters",
          "code": "MIN_LENGTH"
        }
      ]
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

---

## WebSocket Endpoints

The Blockd API supports real-time data streaming through WebSocket connections.

### Gaze Streaming

**Endpoint**: `wss://api.blockd.site/api/v1/gaze/stream`

Real-time gaze tracking data for live sessions.

**Authentication**: Pass access token via `?token=YOUR_ACCESS_TOKEN` query parameter

**Connection**:
```bash
wscat -c "wss://api.blockd.site/api/v1/gaze/stream?token=YOUR_ACCESS_TOKEN"
```

**Message Format**:
```json
{
  "type": "gaze_update",
  "sessionId": "123e4567-e89b-12d3-a456-426614174001",
  "timestamp": "2025-12-01T14:15:30.123Z",
  "gazeX": 1024,
  "gazeY": 768,
  "confidence": 0.92,
  "onScreen": true
}
```

For complete WebSocket protocol documentation, see [WEBSOCKET_PROTOCOL.md](./WEBSOCKET_PROTOCOL.md).

---

## Implementation Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const API_BASE = 'https://api.blockd.site/api/v1';

// Register user
async function registerUser() {
  const response = await axios.post(`${API_BASE}/auth/register`, {
    email: 'user@example.com',
    password: 'SecurePass123!@#',
    firstName: 'John',
    lastName: 'Doe',
    role: 'interviewer'
  });

  const { accessToken, refreshToken } = response.data.data.tokens;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);

  return response.data;
}

// Authenticated request
async function getSessions() {
  const token = localStorage.getItem('accessToken');
  const response = await axios.get(`${API_BASE}/sessions`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return response.data;
}

// Handle token refresh
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await axios.post(`${API_BASE}/auth/refresh`, {
    refreshToken
  });

  const { accessToken } = response.data.data.tokens;
  localStorage.setItem('accessToken', accessToken);

  return accessToken;
}
```

### cURL Examples

```bash
# Register user
curl -X POST https://api.blockd.site/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!@#",
    "firstName": "John",
    "role": "interviewer"
  }'

# Login
curl -X POST https://api.blockd.site/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!@#"
  }'

# Get sessions (authenticated)
curl -X GET https://api.blockd.site/api/v1/sessions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Create session
curl -X POST https://api.blockd.site/api/v1/sessions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "intervieweeEmail": "candidate@example.com",
    "scheduledStart": "2025-12-01T14:00:00Z"
  }'

# Analyze question
curl -X POST https://api.blockd.site/api/v1/analysis/question \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "123e4567-e89b-12d3-a456-426614174001",
    "questionText": "Explain REST APIs",
    "difficulty": "medium"
  }'

# Analyze answer
curl -X POST https://api.blockd.site/api/v1/analysis/answer \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "questionId": "550e8400-e29b-41d4-a716-446655440200",
    "answerText": "REST APIs use HTTP methods..."
  }'

# Get session report
curl -X GET https://api.blockd.site/api/v1/reports/123e4567-e89b-12d3-a456-426614174001 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Additional Resources

- **OpenAPI Specification**: See `agent5-api-specification.json` for complete schema definitions
- **Authentication Flows**: See `agent6-auth-flows.json` for detailed authentication flow documentation
- **WebSocket Protocol**: See `WEBSOCKET_PROTOCOL.md` for real-time data streaming
- **Swagger UI**: Available at `https://api.blockd.site/docs` (development)

---

## Support

For API support, questions, or issues:

- Email: support@blockd.site
- Documentation: https://blockd.site/docs
- Status: https://status.blockd.site

---

**Last Updated**: February 5, 2026
**API Version**: 1.1.0
