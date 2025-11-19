# Blockd Authentication Service

Production-grade JWT authentication and authorization microservice for the Blockd interview security platform.

## Overview

The Authentication Service provides secure user registration, login, token management, and role-based access control (RBAC) for all Blockd services. It uses industry-standard JWT tokens, bcrypt password hashing, and PostgreSQL for data persistence.

## Features

- **User Registration**: Email-based registration with strong password requirements
- **JWT Authentication**: Access and refresh token management
- **Password Security**: Bcrypt hashing with 12 rounds
- **Session Tokens**: Browser-based authentication for interviewees
- **Role-Based Access Control**: Interviewer, interviewee, and admin roles
- **Token Refresh**: Automatic token renewal without re-authentication
- **Health Monitoring**: Built-in health check endpoints

## Technology Stack

- **FastAPI 0.104.1**: Modern Python web framework
- **PyJWT 2.8.0**: JWT token generation and validation
- **bcrypt 4.1.1**: Secure password hashing
- **PostgreSQL**: Database via psycopg2
- **Pydantic 2.5**: Request/response validation
- **Uvicorn**: ASGI server

## Architecture

```
backend/services/auth/
├── main.py              # FastAPI application
├── routes.py            # API endpoints
├── models.py            # Pydantic models
├── security.py          # JWT and password utilities
├── dependencies.py      # FastAPI dependencies (RBAC)
├── config.py            # Configuration management
├── requirements.txt     # Python dependencies
├── Dockerfile           # Container configuration
└── tests/
    ├── test_auth.py     # Integration tests
    └── test_security.py # Unit tests
```

## API Endpoints

### Base URL
- **Development**: `http://localhost:8001`
- **Production**: `https://api.blockd.io/auth`

### Endpoints

#### POST /auth/register
Register a new user account.

**Request:**
```json
{
  "email": "interviewer@company.com",
  "password": "SecurePass123!",
  "full_name": "Jane Smith",
  "role": "interviewer",
  "organization_id": "uuid-optional"
}
```

**Response (201):**
```json
{
  "id": "user-uuid",
  "email": "interviewer@company.com",
  "full_name": "Jane Smith",
  "role": "interviewer",
  "organization_id": null,
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one digit
- At least one special character

---

#### POST /auth/login
Authenticate user and receive JWT tokens.

**Request:**
```json
{
  "email": "interviewer@company.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Token Lifetimes:**
- Access Token: 1 hour (3600 seconds)
- Refresh Token: 7 days

---

#### POST /auth/refresh
Refresh access token using refresh token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "access_token": "new-access-token",
  "refresh_token": "new-refresh-token",
  "token_type": "bearer",
  "expires_in": 3600
}
```

---

#### GET /auth/me
Get current authenticated user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "id": "user-uuid",
  "email": "interviewer@company.com",
  "full_name": "Jane Smith",
  "role": "interviewer",
  "organization_id": null,
  "created_at": "2024-01-15T10:00:00Z"
}
```

---

#### POST /auth/session-token
Generate session token for browser authentication.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "session_id": "session-uuid"
}
```

**Response (200):**
```json
{
  "session_token": "random-32-char-url-safe-token",
  "session_id": "session-uuid",
  "interviewer_id": "interviewer-uuid",
  "interviewee_id": null,
  "expires_at": "2024-01-15T14:00:00Z"
}
```

**Note:** Only the interviewer who owns the session can generate tokens.

---

#### GET /auth/validate-session-token/{session_token}
Validate session token for browser connections.

**Response (200):**
```json
{
  "valid": true,
  "session_id": "session-uuid"
}
```

**Error (401):**
```json
{
  "detail": "Invalid session token"
}
```

---

#### GET /health
Health check endpoint for monitoring.

**Response (200):**
```json
{
  "status": "healthy",
  "service": "auth",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

## Authentication & Authorization

### Using JWT Tokens

All protected endpoints require a JWT token in the Authorization header:

```http
Authorization: Bearer <access_token>
```

### Role-Based Access Control (RBAC)

Use the dependency injection functions to protect routes:

```python
from backend.services.auth.dependencies import (
    get_current_user,
    require_role,
    require_any_role
)

# Require authentication
@app.get("/protected")
async def protected_route(user: UserInfo = Depends(get_current_user)):
    return {"message": f"Hello {user.full_name}"}

# Require specific role
@app.get("/interviewer-only")
async def interviewer_route(
    user: UserInfo = Depends(require_role('interviewer'))
):
    return {"message": "Interviewer access granted"}

# Require any of multiple roles
@app.get("/staff-only")
async def staff_route(
    user: UserInfo = Depends(require_any_role(['interviewer', 'admin']))
):
    return {"message": "Staff access granted"}
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Service Configuration
ENVIRONMENT=development
DEBUG=false
AUTH_SERVICE_HOST=0.0.0.0
AUTH_SERVICE_PORT=8001

# JWT Configuration
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=blockd_db
DB_USER=blockd
DB_PASSWORD=secure_password

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000","https://dashboard.blockd.io"]
```

### Generate Secure JWT Secret

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

## Installation & Running

### Local Development

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Set up environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Run the service:**
```bash
python -m uvicorn backend.services.auth.main:app --reload --host 0.0.0.0 --port 8001
```

4. **Access documentation:**
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

### Docker

1. **Build image:**
```bash
docker build -t blockd-auth-service .
```

2. **Run container:**
```bash
docker run -p 8001:8001 \
  -e JWT_SECRET=your-secret \
  -e DB_HOST=postgres \
  -e DB_PASSWORD=password \
  blockd-auth-service
```

## Testing

### Run All Tests

```bash
pytest backend/services/auth/tests/ -v --cov=backend/services/auth
```

### Run Specific Test Suite

```bash
# Unit tests
pytest backend/services/auth/tests/test_security.py -v

# Integration tests
pytest backend/services/auth/tests/test_auth.py -v
```

### Test Coverage

```bash
pytest backend/services/auth/tests/ --cov=backend/services/auth --cov-report=html
```

Coverage reports will be in `htmlcov/index.html`.

## Security Considerations

### Password Security
- **Bcrypt hashing** with 12 rounds
- **Strong password requirements** enforced
- **No plaintext passwords** stored anywhere

### JWT Security
- **Secret key** must be strong and unique per environment
- **Token expiration** prevents indefinite access
- **Token type verification** prevents token misuse
- **NBF (Not Before)** claim prevents premature token use

### Session Tokens
- **Cryptographically secure** random generation
- **URL-safe** encoding for browser usage
- **Limited lifetime** (4 hours by default)
- **Tied to specific sessions** for access control

### Database Security
- **SQL injection protection** via parameterized queries
- **Connection pooling** for resource management
- **Password hashing** before storage

## Integration with Other Services

### WebSocket Server (Agent 7)
Validates session tokens for browser connections:

```python
from backend.services.auth.routes import validate_session_token

# In WebSocket connection handler
is_valid = await validate_session_token(token)
```

### Frontend (Agents 14-16)
Uses login/register endpoints and stores JWT tokens:

```javascript
// Login
const response = await fetch('http://localhost:8001/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});
const { access_token, refresh_token } = await response.json();

// Use token
fetch('/protected', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
```

### Other Backend Services
Import dependencies for route protection:

```python
from backend.services.auth.dependencies import get_current_user

@app.get("/my-service/data")
async def get_data(user: UserInfo = Depends(get_current_user)):
    # User is authenticated
    pass
```

## Monitoring & Observability

### Health Checks
```bash
curl http://localhost:8001/health
```

### Logs
Structured logging to stdout:
```
2024-01-15 10:00:00 - INFO - User logged in successfully: test@example.com
2024-01-15 10:01:00 - WARNING - Invalid password for user: test@example.com
```

### Metrics
Monitor these key metrics:
- Login success/failure rate
- Token refresh rate
- Authentication latency
- Active sessions

## Troubleshooting

### Database Connection Issues
```
✗ Database connection failed: could not connect to server
```
**Solution:** Check DB_HOST, DB_PORT, and ensure PostgreSQL is running.

### Invalid Token Errors
```
401 Unauthorized: Token has expired
```
**Solution:** Use refresh token endpoint to get new access token.

### Password Validation Failures
```
422 Unprocessable Entity: Password must contain uppercase letter
```
**Solution:** Ensure password meets all requirements (8+ chars, uppercase, digit, special char).

## Contributing

1. Write tests for new features
2. Ensure >85% code coverage
3. Follow PEP 8 style guide
4. Update documentation

## License

Proprietary - Blockd Interview Security Platform

## Support

For issues and questions:
- GitHub Issues: https://github.com/blockd/auth-service/issues
- Email: support@blockd.io
