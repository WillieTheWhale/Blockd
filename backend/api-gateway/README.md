# Blockd API Gateway

Production-grade Fastify 5.x API Gateway for the Blockd interview integrity platform.

## Overview

The API Gateway serves as the central entry point for all client requests, providing:

- **JWT Authentication** (RS256) with access and refresh tokens
- **Rate Limiting** using Redis token bucket algorithm
- **Request Validation** with Zod schemas
- **CORS** configuration
- **OpenAPI/Swagger** documentation
- **WebSocket** support for real-time gaze tracking
- **Error Handling** with standardized responses
- **Health Checks** for monitoring

## Technology Stack

- **Runtime**: Node.js 24.11.0 LTS
- **Framework**: Fastify 5.x
- **Language**: TypeScript 5.9.3
- **Database ORM**: Prisma 6.x
- **Validation**: Zod 3.24.1
- **Cache/Rate Limiting**: Redis (ioredis)
- **Testing**: Vitest 2.1.8

## Architecture

```
backend/api-gateway/
├── src/
│   ├── app.ts              # Fastify application factory
│   ├── server.ts           # Server entry point
│   └── config.ts           # Configuration management
├── lib/
│   ├── prisma.ts           # Prisma client singleton
│   ├── jwt.ts              # JWT utilities
│   ├── errors.ts           # Custom error classes
│   └── response.ts         # Standardized API responses
├── middleware/
│   ├── auth.middleware.ts          # JWT authentication
│   ├── rate-limit.middleware.ts    # Rate limiting
│   ├── validation.middleware.ts    # Request validation
│   ├── error-handler.middleware.ts # Global error handling
│   ├── cors.middleware.ts          # CORS configuration
│   └── logger.middleware.ts        # Request logging
├── routes/
│   ├── health.routes.ts    # Health check endpoints
│   ├── auth.routes.ts      # Authentication routes
│   ├── sessions.routes.ts  # Session management
│   ├── browser.routes.ts   # Browser client routes
│   ├── analysis.routes.ts  # AI analysis routes
│   ├── gaze.routes.ts      # Gaze tracking routes
│   └── reports.routes.ts   # Reporting routes
├── schemas/
│   ├── common.schema.ts    # Common schemas (pagination, errors)
│   ├── auth.schema.ts      # Auth request/response schemas
│   ├── session.schema.ts   # Session schemas
│   ├── browser.schema.ts   # Browser client schemas
│   └── analysis.schema.ts  # AI analysis schemas
└── test/
    ├── server.test.ts      # Server tests
    ├── auth.test.ts        # Authentication tests
    ├── sessions.test.ts    # Session tests
    ├── rate-limit.test.ts  # Rate limiting tests
    └── validation.test.ts  # Validation tests
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL 18.1
- Redis 8.4

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Generate JWT Keys

```bash
# Generate RSA private key
openssl genrsa -out private.key 2048

# Generate public key from private key
openssl rsa -in private.key -pubout -out public.key

# Convert to single-line format for .env
# Replace newlines with \n
```

### Database Setup

```bash
# Push Prisma schema to database
npm run prisma:push

# Or run migrations
npm run prisma:migrate
```

### Running the Server

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The server will start on `http://localhost:3000` by default.

## API Documentation

### Swagger UI

When running in development mode, interactive API documentation is available at:

```
http://localhost:3000/docs
```

### API Endpoints

#### Authentication

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user
- `POST /api/v1/auth/mfa/setup` - Setup MFA
- `POST /api/v1/auth/mfa/verify` - Verify MFA code

#### Sessions

- `POST /api/v1/sessions` - Create new session
- `GET /api/v1/sessions` - List sessions (paginated)
- `GET /api/v1/sessions/:id` - Get session by ID
- `POST /api/v1/sessions/:id/start` - Start session
- `POST /api/v1/sessions/:id/end` - End session
- `GET /api/v1/sessions/:id/events` - Get session events

#### Browser Client

- `POST /api/v1/browser/session/validate` - Validate session token
- `POST /api/v1/browser/security/event` - Report security event
- `POST /api/v1/browser/telemetry/batch` - Submit batch telemetry

#### AI Analysis

- `POST /api/v1/analysis/question` - Analyze question
- `POST /api/v1/analysis/answer` - Analyze answer

#### Gaze Tracking

- `WS /api/v1/gaze/stream` - WebSocket for gaze streaming
- `GET /api/v1/gaze/summary/:sessionId` - Get gaze summary

#### Reports

- `GET /api/v1/reports/:sessionId` - Get session report
- `GET /api/v1/reports/:sessionId/pdf` - Download report as PDF

#### Health

- `GET /api/v1/health` - Health check
- `GET /api/v1/ready` - Readiness check
- `GET /api/v1/live` - Liveness check

## Authentication

The API uses JWT (RS256) authentication with access and refresh tokens.

### Getting an Access Token

```bash
# Register a new user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!",
    "firstName": "John",
    "lastName": "Doe",
    "role": "interviewer"
  }'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!"
  }'
```

### Using the Access Token

```bash
curl -X GET http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Rate Limiting

Rate limits are enforced per IP address for public endpoints and per user for authenticated endpoints.

### Default Limits

- **Public endpoints**: 100 requests per minute
- **Authenticated endpoints**: 500 requests per minute
- **Sensitive operations**: 10 requests per minute

Rate limit headers are included in all responses:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets
- `Retry-After`: Seconds to wait before retrying (when rate limited)

## Error Handling

All errors follow a standardized format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "details": {
      // Optional additional error details
    }
  },
  "meta": {
    "timestamp": "2025-11-24T12:00:00.000Z",
    "requestId": "req-123456"
  }
}
```

### Error Codes

- `BAD_REQUEST` (400) - Invalid request
- `UNAUTHORIZED` (401) - Authentication required
- `FORBIDDEN` (403) - Access denied
- `NOT_FOUND` (404) - Resource not found
- `CONFLICT` (409) - Resource conflict
- `VALIDATION_ERROR` (422) - Request validation failed
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INTERNAL_SERVER_ERROR` (500) - Server error
- `SERVICE_UNAVAILABLE` (503) - Service unavailable

## Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Performance

The API Gateway is designed to handle:

- **1,000+ concurrent connections**
- **API response time (p95) < 200ms**
- **Graceful shutdown** with connection draining

## Monitoring

### Health Checks

- `/api/v1/health` - Overall health status
- `/api/v1/ready` - Readiness for traffic
- `/api/v1/live` - Liveness check

### Metrics

Health check responses include:

- Database connection status
- Redis connection status
- Service uptime
- Response time

## Deployment

### Docker

```bash
# Build Docker image
docker build -t blockd-api-gateway .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_HOST="redis" \
  blockd-api-gateway
```

### Environment Variables

See `.env.example` for all available configuration options.

## Security

### Best Practices

1. **Never commit sensitive keys** to version control
2. **Use strong JWT keys** (RSA 2048-bit or higher)
3. **Enable HTTPS** in production
4. **Set secure CORS origins**
5. **Monitor rate limit violations**
6. **Review audit logs** regularly

### Security Headers

The API Gateway automatically sets security headers using Helmet:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (in production)

## Contributing

1. Follow TypeScript best practices
2. Write tests for new features
3. Update documentation
4. Follow conventional commits

## License

MIT

## Support

For questions or issues, contact the Blockd team.
