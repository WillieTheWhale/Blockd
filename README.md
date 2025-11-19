# Blockd - Interview Security Platform

Production-grade security infrastructure for technical interviews. Blockd provides comprehensive monitoring, authentication, and session management for secure remote coding interviews.

## Overview

Blockd is a microservices-based platform that enables companies to conduct secure technical interviews with real-time monitoring, clipboard control, and browser security enforcement.

## Architecture

```
Blockd/
├── backend/
│   └── services/
│       └── auth/          # Authentication & Authorization Service (Agent 6)
│           ├── main.py
│           ├── routes.py
│           ├── models.py
│           ├── security.py
│           ├── dependencies.py
│           └── tests/
├── database/
│   ├── connection.py      # Database connection pool (Agent 5)
│   └── schema.sql         # PostgreSQL schema (Agent 5)
├── docker-compose.yml     # Local development environment
└── .env.example          # Environment configuration template
```

## Services

### Authentication Service (Port 8001)
- JWT-based authentication
- User registration and login
- Token refresh mechanism
- Session token generation for browser auth
- Role-based access control (RBAC)

**Tech Stack:** FastAPI, PyJWT, bcrypt, PostgreSQL

**Documentation:** [backend/services/auth/README.md](backend/services/auth/README.md)

### Database (Port 5432)
- PostgreSQL 15
- Connection pooling
- User and session management
- Audit logging

**Schema:** [database/schema.sql](database/schema.sql)

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.11+ (for local development)
- PostgreSQL 15+ (for local development without Docker)

### Using Docker Compose (Recommended)

1. **Clone the repository:**
```bash
git clone https://github.com/WillieTheWhale/Blockd.git
cd Blockd
```

2. **Set up environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start all services:**
```bash
docker-compose up -d
```

4. **Verify services:**
```bash
# Check auth service
curl http://localhost:8001/health

# Check database
docker-compose exec postgres psql -U blockd -d blockd_db -c "SELECT 1;"
```

5. **View logs:**
```bash
docker-compose logs -f auth-service
```

6. **Stop services:**
```bash
docker-compose down
```

### Local Development (Without Docker)

1. **Set up PostgreSQL:**
```bash
# Install PostgreSQL 15
# Create database
createdb blockd_db

# Run schema
psql -d blockd_db -f database/schema.sql
```

2. **Set up Python environment:**
```bash
cd backend/services/auth
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. **Run auth service:**
```bash
python -m uvicorn backend.services.auth.main:app --reload --host 0.0.0.0 --port 8001
```

5. **Access API documentation:**
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## API Documentation

### Authentication Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/auth/register` | POST | Register new user | No |
| `/auth/login` | POST | Login and get tokens | No |
| `/auth/refresh` | POST | Refresh access token | No |
| `/auth/me` | GET | Get current user info | Yes |
| `/auth/session-token` | POST | Generate session token | Yes |
| `/auth/validate-session-token/{token}` | GET | Validate session token | No |
| `/health` | GET | Health check | No |

### Example Usage

**Register User:**
```bash
curl -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "interviewer@company.com",
    "password": "SecurePass123!",
    "full_name": "Jane Smith",
    "role": "interviewer"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "interviewer@company.com",
    "password": "SecurePass123!"
  }'
```

**Get Current User:**
```bash
curl -X GET http://localhost:8001/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Testing

### Run All Tests
```bash
cd backend/services/auth
pytest tests/ -v --cov=backend/services/auth
```

### Run Specific Test Suite
```bash
# Unit tests
pytest tests/test_security.py -v

# Integration tests
pytest tests/test_auth.py -v
```

### Test Coverage
```bash
pytest tests/ --cov=backend/services/auth --cov-report=html
# Open htmlcov/index.html in browser
```

## Security

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one digit
- At least one special character
- Bcrypt hashing with 12 rounds

### JWT Configuration
- Access tokens expire in 1 hour
- Refresh tokens expire in 7 days
- HS256 algorithm
- Secure secret key required

### Environment Security
- Never commit `.env` files
- Use strong JWT secrets in production
- Rotate secrets regularly
- Use HTTPS in production

## Configuration

All configuration is managed via environment variables. See [.env.example](.env.example) for full configuration options.

### Key Configuration Options

```bash
# Environment
ENVIRONMENT=development|production
DEBUG=true|false

# JWT
JWT_SECRET=your-secure-secret-key
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=blockd_db
DB_USER=blockd
DB_PASSWORD=secure_password

# CORS
CORS_ORIGINS=["http://localhost:3000"]
```

## Database Schema

### Users Table
- `id`: UUID primary key
- `email`: Unique email address
- `password_hash`: Bcrypt hashed password
- `full_name`: User's full name
- `role`: User role (interviewer, interviewee, admin)
- `organization_id`: Optional organization reference
- `is_active`: Account status
- Timestamps: `created_at`, `updated_at`, `last_login_at`

### Sessions Table
- `id`: UUID primary key
- `interviewer_id`: Reference to interviewer user
- `interviewee_id`: Reference to interviewee user
- `session_token`: Browser authentication token
- `status`: Session status (active, completed, cancelled)
- Timestamps: `started_at`, `ended_at`, `created_at`

See [database/schema.sql](database/schema.sql) for complete schema.

## Development Workflow

1. **Create feature branch:**
```bash
git checkout -b feature/your-feature-name
```

2. **Make changes and test:**
```bash
# Run tests
pytest tests/ -v

# Check code style
flake8 backend/
black backend/
```

3. **Commit changes:**
```bash
git add .
git commit -m "feat: add your feature description"
```

4. **Push and create PR:**
```bash
git push origin feature/your-feature-name
```

## Monitoring & Health Checks

### Health Check Endpoint
```bash
curl http://localhost:8001/health
```

### Database Health
```bash
docker-compose exec postgres pg_isready -U blockd
```

### Service Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f auth-service
```

## Troubleshooting

### Common Issues

**Database connection failed:**
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres
```

**Auth service won't start:**
```bash
# Check environment variables
docker-compose config

# Rebuild service
docker-compose up --build auth-service
```

**Port already in use:**
```bash
# Change port in docker-compose.yml or .env
# Or stop conflicting service
lsof -i :8001
```

## Project Status

### Completed Agents
- ✅ Agent 5: Database Schema & Connection Pool
- ✅ Agent 6: Authentication Service

### Upcoming Agents
- ⏳ Agent 7: WebSocket Server
- ⏳ Agent 8-13: Additional backend services
- ⏳ Agent 14-16: Frontend applications
- ⏳ Agent 17: Docker orchestration

## Contributing

1. Follow PEP 8 style guide for Python
2. Write tests for new features (>85% coverage required)
3. Update documentation
4. Create meaningful commit messages
5. Request code review before merging

## License

Proprietary - Blockd Interview Security Platform

## Support

For questions or issues:
- Create an issue in GitHub
- Contact: support@blockd.io

## Acknowledgments

Built with:
- FastAPI - Modern Python web framework
- PostgreSQL - Reliable database
- PyJWT - JWT implementation
- bcrypt - Password hashing
- Docker - Containerization
