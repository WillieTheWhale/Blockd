# Blockd Authentication Service

Production-grade authentication service with bcrypt password hashing, JWT tokens, MFA (TOTP), and OAuth 2.0 support.

## Technology Stack

- **Node.js**: 24.11.0 LTS
- **TypeScript**: 5.9.3
- **Fastify**: 5.x (Fast web framework)
- **Prisma**: 6.x (Database ORM)
- **PostgreSQL**: 18.1 (Database)
- **Redis**: Latest (Session management & caching)
- **bcrypt**: Password hashing (salt rounds: 12)
- **jsonwebtoken**: JWT token generation (RS256 algorithm)
- **speakeasy**: TOTP/MFA implementation
- **@fastify/oauth2**: OAuth 2.0 integration

## Features

### Core Authentication
- ✅ User registration with email verification
- ✅ Login with email/password
- ✅ JWT access tokens (RS256, 1h expiry)
- ✅ Refresh tokens (7d expiry, Redis-backed)
- ✅ Token refresh and rotation
- ✅ Token revocation (single & all sessions)
- ✅ Password reset flow
- ✅ Email verification

### Security
- ✅ bcrypt password hashing (12 rounds)
- ✅ Strong password requirements (12+ chars, mixed case, numbers, special chars)
- ✅ Rate limiting (5 failed attempts = 15min lockout)
- ✅ Account lockout mechanism
- ✅ CORS protection
- ✅ Helmet security headers
- ✅ Input validation with Zod

### Multi-Factor Authentication (MFA)
- ✅ TOTP setup with QR code
- ✅ Google Authenticator compatible
- ✅ Backup codes (10 codes per user)
- ✅ MFA enforcement options
- ✅ Encrypted secret storage

### OAuth 2.0
- ✅ Google OAuth integration
- ✅ Microsoft OAuth integration
- ✅ Automatic account creation/linking
- ✅ Email verification bypass for OAuth

## Project Structure

```
backend/auth-service/
├── src/
│   ├── server.ts           # Server entry point
│   ├── app.ts              # Fastify app factory
│   └── config.ts           # Configuration management
├── controllers/
│   ├── auth.controller.ts  # Auth endpoints (register, login, etc.)
│   ├── mfa.controller.ts   # MFA setup and verification
│   ├── oauth.controller.ts # OAuth flows
│   └── token.controller.ts # Token management
├── services/
│   ├── user.service.ts     # User CRUD operations
│   ├── password.service.ts # Password hashing & validation
│   ├── jwt.service.ts      # JWT generation & validation
│   ├── mfa.service.ts      # TOTP & backup codes
│   ├── oauth.service.ts    # OAuth provider integration
│   └── session.service.ts  # Redis session management
├── middleware/
│   ├── validate-jwt.middleware.ts      # JWT validation
│   ├── check-mfa.middleware.ts         # MFA requirement check
│   └── rate-limit-auth.middleware.ts   # Rate limiting
├── lib/
│   ├── crypto.ts           # Cryptographic utilities
│   ├── email.ts            # Email sending (stub)
│   └── errors.ts           # Custom error classes
├── types/
│   ├── auth.types.ts       # Auth request/response types
│   ├── jwt.types.ts        # JWT payload types
│   └── user.types.ts       # User types
├── prisma/
│   └── schema.prisma       # Database schema
├── keys/
│   ├── private.pem         # RSA private key (generated)
│   └── public.pem          # RSA public key (generated)
├── test/
│   ├── registration.test.ts
│   ├── login.test.ts
│   ├── mfa.test.ts
│   ├── token-refresh.test.ts
│   ├── password-strength.test.ts
│   └── rate-limit.test.ts
├── scripts/
│   └── generate-keys.js    # RSA key generation script
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example
├── .gitignore
└── README.md
```

## Setup Instructions

### 1. Prerequisites

- Node.js 24.11.0 or later
- PostgreSQL 18.1 or later
- Redis (latest version)
- npm or yarn

### 2. Installation

```bash
cd backend/auth-service
npm install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database connection string
- Redis connection
- OAuth credentials (if using)
- Frontend URL for redirects

### 4. Generate RSA Keys

```bash
npm run keys:generate
```

This will:
- Generate 2048-bit RSA key pair for JWT signing
- Generate MFA encryption key
- Save keys to `keys/` directory
- Display the MFA encryption key (add to `.env`)

**⚠️ IMPORTANT**: Never commit `keys/private.pem` to version control!

### 5. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations (if using migrations)
npm run prisma:migrate
```

### 6. Start the Service

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## API Endpoints

### Authentication

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!@#",
  "full_name": "John Doe",
  "role": "interviewer",
  "organization_id": "uuid" // optional
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!@#",
  "mfa_code": "123456" // optional, if MFA enabled
}
```

#### Verify Email
```http
POST /auth/verify-email
Content-Type: application/json

{
  "token": "verification_token_from_email"
}
```

#### Request Password Reset
```http
POST /auth/password-reset/request
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Confirm Password Reset
```http
POST /auth/password-reset/confirm
Content-Type: application/json

{
  "reset_token": "token_from_email",
  "new_password": "NewSecurePass123!@#"
}
```

#### Logout
```http
POST /auth/logout
Content-Type: application/json

{
  "refresh_token": "your_refresh_token"
}
```

### MFA Endpoints

#### Setup MFA
```http
POST /auth/mfa/setup
Authorization: Bearer <access_token>
```

#### Verify MFA Setup
```http
POST /auth/mfa/verify
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "code": "123456",
  "secret": "base32_secret",
  "backup_codes": ["CODE1", "CODE2", ...]
}
```

#### Verify MFA During Login
```http
POST /auth/mfa/verify-login
Content-Type: application/json

{
  "mfa_token": "temporary_mfa_token",
  "code": "123456"
}
```

#### Disable MFA
```http
POST /auth/mfa/disable
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "password": "your_current_password"
}
```

#### Get MFA Status
```http
GET /auth/mfa/status
Authorization: Bearer <access_token>
```

### Token Management

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "your_refresh_token"
}
```

#### Revoke Token
```http
POST /auth/revoke
Content-Type: application/json

{
  "refresh_token": "token_to_revoke"
}
```

#### Revoke All Tokens
```http
POST /auth/revoke-all
Authorization: Bearer <access_token>
```

#### Get Active Sessions
```http
GET /auth/sessions
Authorization: Bearer <access_token>
```

#### Verify Token
```http
POST /auth/verify-token
Content-Type: application/json

{
  "token": "jwt_token_to_verify"
}
```

### OAuth

#### Google OAuth
```http
GET /auth/oauth/google
```

#### Google OAuth Callback
```http
GET /auth/oauth/google/callback?code=...&state=...
```

#### Microsoft OAuth
```http
GET /auth/oauth/microsoft
```

#### Microsoft OAuth Callback
```http
GET /auth/oauth/microsoft/callback?code=...&state=...
```

## JWT Token Format

Access tokens use RS256 algorithm with the following payload structure:

```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "interviewer",
  "organization_id": "org_uuid",
  "iat": 1234567890,
  "exp": 1234571490,
  "iss": "blockd-auth",
  "aud": "blockd-api"
}
```

## Password Requirements

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Not in common password list

## Security Features

### Rate Limiting
- Login: 10 requests per minute
- Register: 5 requests per minute
- Password reset: 3 requests per hour
- MFA verification: 5 requests per 5 minutes

### Account Lockout
- 5 failed login attempts = 15 minute lockout
- Lockout information stored in Redis
- Automatic unlock after timeout
- Counter resets on successful login

### Session Management
- Refresh tokens stored in Redis with 7-day TTL
- Token rotation on refresh
- Support for multiple active sessions
- Ability to revoke all sessions

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration
```

## Development

```bash
# Watch mode (auto-reload)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Production Deployment

1. **Environment Variables**: Ensure all production environment variables are set
2. **RSA Keys**: Generate unique keys for production (never reuse dev keys)
3. **Database**: Use production PostgreSQL instance
4. **Redis**: Use production Redis instance with persistence
5. **OAuth**: Configure production OAuth callback URLs
6. **Email**: Configure real email service (replace stub)
7. **Monitoring**: Set up logging and monitoring
8. **HTTPS**: Always use HTTPS in production

## Integration with Other Services

### API Gateway
The auth service is designed to work behind an API gateway. The gateway should:
- Route `/auth/*` requests to this service
- Validate JWT tokens for protected routes
- Forward user info from JWT to downstream services

### Database Schema
The service uses the shared PostgreSQL database with the `users` and `organizations` tables.

### Cache/Redis
Session tokens and rate limiting data are stored in Redis.

## Troubleshooting

### Cannot load RSA keys
```bash
npm run keys:generate
```

### Database connection failed
- Check DATABASE_URL in .env
- Ensure PostgreSQL is running
- Verify database exists

### Redis connection failed
- Check REDIS_HOST and REDIS_PORT in .env
- Ensure Redis is running

### MFA encryption errors
- Verify MFA_ENCRYPTION_KEY is 64 characters (32 bytes hex)
- Generate new key: `node scripts/generate-keys.js`

## License

MIT

## Support

For issues and questions, contact the Blockd development team.
