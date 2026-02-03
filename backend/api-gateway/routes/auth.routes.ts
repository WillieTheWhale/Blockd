/**
 * Authentication Routes
 * Handles user registration, login, and MFA
 */

import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware';
import {
  publicRateLimiter,
  strictRateLimiter,
  loginRateLimiter,
  mfaRateLimiter,
  recordMfaSuccess,
  recordMfaFailure,
} from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import {
  registerRequestSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  logoutRequestSchema,
  mfaSetupRequestSchema,
  mfaVerifyRequestSchema,
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  MfaSetupRequest,
  MfaVerifyRequest,
} from '../schemas/auth.schema';
import { generateTokenPair, verifyRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from '../lib/jwt';
import { sendSuccess, sendCreated } from '../lib/response';
import { BadRequestError, UnauthorizedError } from '../lib/errors';
import prisma from '../lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength, isCommonPassword } from '../lib/password';
import { generateMFASecret, verifyTOTPCode, generateBackupCodes, isValidTOTPFormat, isValidBackupCodeFormat } from '../lib/mfa';

/**
 * Mask email address for secure logging
 * Preserves domain for analysis while protecting user identity
 * Example: "john.doe@company.com" -> "joh***@company.com"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return '***';

  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex);

  if (localPart.length <= 3) {
    return `${'*'.repeat(localPart.length)}${domain}`;
  }

  return `${localPart.substring(0, 3)}***${domain}`;
}

export default async function authRoutes(fastify: FastifyInstance) {
  // Register endpoint
  fastify.post<{ Body: RegisterRequest & { name?: string } }>('/register', {
    preHandler: [publicRateLimiter, validateBody(registerRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      description: 'Creates a new user account',
    },
    handler: async (request, reply) => {
      const { email, password, firstName, lastName, role, organizationId } = request.body;
      // Support both name (from frontend) and firstName/lastName
      const body = request.body as { name?: string; organization?: string };
      const name = body.name;
      // organizationId must be a valid UUID - organization string from frontend is ignored for now
      // TODO: Look up organization by name or create new one
      const finalOrgId = organizationId || undefined;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new BadRequestError('User with this email already exists');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        throw new BadRequestError(`Password requirements not met: ${passwordValidation.errors.join(', ')}`);
      }

      // Check if password is too common
      if (isCommonPassword(password)) {
        throw new BadRequestError('Password is too common. Please choose a stronger password.');
      }

      // Hash password using bcrypt
      const passwordHash = await hashPassword(password);

      // Parse name into firstName/lastName if provided
      let finalFirstName = firstName;
      let finalLastName = lastName;
      if (name && !firstName && !lastName) {
        const nameParts = name.trim().split(' ');
        finalFirstName = nameParts[0];
        finalLastName = nameParts.slice(1).join(' ') || undefined;
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: finalFirstName,
          lastName: finalLastName,
          role: role as UserRole,
          organizationId: finalOrgId,
        },
      });

      // Generate tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      });

      // Build user's full name
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      // Return response in format expected by frontend (flat tokens)
      const response = {
        user: {
          id: user.id,
          email: user.email,
          name: fullName,
          role: user.role,
          avatar: null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };

      return sendCreated(reply, response);
    },
  });

  // Login endpoint
  fastify.post<{ Body: LoginRequest }>('/login', {
    preHandler: [loginRateLimiter, validateBody(loginRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Login user',
      description: 'Authenticates a user and returns JWT tokens',
    },
    handler: async (request, reply) => {
      const { email, password, mfaCode } = request.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Record failed attempt for rate limiting
        await recordMfaFailure(request.ip);

        // Log security event for monitoring/alerting
        // Mask email to protect privacy while preserving domain for analysis
        const maskedEmail = maskEmail(email);
        request.log.warn({
          security_event: 'authentication_failure',
          reason: 'user_not_found',
          email_masked: maskedEmail,
          ip: request.ip,
          user_agent: request.headers['user-agent']?.substring(0, 100),
          timestamp: new Date().toISOString(),
        }, 'Failed login attempt: user not found');

        throw new UnauthorizedError('Invalid email or password');
      }

      // Verify password using bcrypt
      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        // Record failed attempt for rate limiting
        await recordMfaFailure(user.id);

        // Log security event for monitoring/alerting
        request.log.warn({
          security_event: 'authentication_failure',
          reason: 'invalid_password',
          user_id: user.id,
          email_prefix: email.substring(0, 3) + '***',
          ip: request.ip,
          user_agent: request.headers['user-agent']?.substring(0, 100),
          timestamp: new Date().toISOString(),
        }, 'Failed login attempt: invalid password');

        throw new UnauthorizedError('Invalid email or password');
      }

      // Check MFA if enabled
      if (user.mfaEnabled) {
        if (!mfaCode) {
          // Return indicator that MFA is required
          return sendSuccess(reply, {
            requiresMfa: true,
            message: 'MFA code required',
          });
        }

        // Verify MFA code using speakeasy
        if (!user.mfaSecret) {
          throw new UnauthorizedError('MFA configuration error');
        }

        const isValidMfa = verifyTOTPCode(user.mfaSecret, mfaCode);
        if (!isValidMfa) {
          // Record failed MFA attempt
          await recordMfaFailure(user.id);

          // Log security event for monitoring/alerting
          request.log.warn({
            security_event: 'mfa_failure',
            reason: 'invalid_mfa_code',
            user_id: user.id,
            ip: request.ip,
            user_agent: request.headers['user-agent']?.substring(0, 100),
            timestamp: new Date().toISOString(),
          }, 'Failed MFA verification attempt');

          throw new UnauthorizedError('Invalid MFA code');
        }

        // MFA success - clear failure count
        await recordMfaSuccess(user.id);
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      });

      // Clear any login failure tracking on successful login
      await recordMfaSuccess(user.id);

      // Build user's full name
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      // Return response in format expected by frontend (flat tokens)
      const response = {
        user: {
          id: user.id,
          email: user.email,
          name: fullName,
          role: user.role,
          avatar: null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        requiresMfa: false,
      };

      return sendSuccess(reply, response);
    },
  });

  // Refresh token endpoint
  fastify.post<{ Body: RefreshTokenRequest }>('/refresh', {
    preHandler: [publicRateLimiter, validateBody(refreshTokenRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      description: 'Generates a new access token using a refresh token',
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;

      // Verify refresh token
      const payload = await verifyRefreshToken(refreshToken);

      // Get user to ensure they still exist
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.deletedAt) {
        throw new UnauthorizedError('User not found or deactivated');
      }

      // Generate new tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      });

      // Revoke old refresh token
      await revokeRefreshToken(user.id, refreshToken);

      // Return response in format expected by frontend
      return sendSuccess(reply, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
    },
  });

  // Logout endpoint
  fastify.post<{ Body: LogoutRequest }>('/logout', {
    preHandler: [authenticate, validateBody(logoutRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Logout user',
      description: 'Revokes the refresh token',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;
      const userId = request.user!.userId;

      if (refreshToken) {
        await revokeRefreshToken(userId, refreshToken);
      } else {
        // Revoke all refresh tokens for the user
        await revokeAllRefreshTokens(userId);
      }

      return sendSuccess(reply, { message: 'Logged out successfully' });
    },
  });

  // MFA setup endpoint
  fastify.post<{ Body: MfaSetupRequest }>('/mfa/setup', {
    preHandler: [authenticate, strictRateLimiter, validateBody(mfaSetupRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Setup MFA',
      description: 'Enables or disables MFA for the user',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { enabled } = request.body;
      const userId = request.user!.userId;
      const userEmail = request.user!.email;

      if (enabled) {
        // Generate proper MFA secret using speakeasy
        const mfaData = await generateMFASecret(userEmail);

        // Store the secret (in production, you might want to encrypt this)
        await prisma.user.update({
          where: { id: userId },
          data: {
            mfaEnabled: false, // Not enabled until verified
            mfaSecret: mfaData.secret,
          },
        });

        return sendSuccess(reply, {
          secret: mfaData.secret,
          qrCode: mfaData.qrCodeDataUrl,
          backupCodes: mfaData.backupCodes,
          message: 'Scan the QR code with your authenticator app, then verify with a code',
        });
      } else {
        // Disable MFA
        await prisma.user.update({
          where: { id: userId },
          data: {
            mfaEnabled: false,
            mfaSecret: null,
          },
        });

        return sendSuccess(reply, { message: 'MFA disabled successfully' });
      }
    },
  });

  // MFA verify endpoint (used during MFA setup)
  fastify.post<{ Body: MfaVerifyRequest }>('/mfa/verify', {
    preHandler: [mfaRateLimiter, validateBody(mfaVerifyRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Verify MFA code',
      description: 'Verifies a 2FA code during setup. Rate limited to 5 attempts per 15 minutes with progressive lockout.',
    },
    handler: async (request, reply) => {
      const { code, secret } = request.body;

      // Validate code format first
      if (!isValidTOTPFormat(code) && !isValidBackupCodeFormat(code)) {
        throw new BadRequestError('Invalid code format. Expected 6-digit TOTP or XXXX-XXXX backup code.');
      }

      // Get identifier for rate limiting tracking
      const identifier = request.user?.userId || request.ip;

      // Verify TOTP code using speakeasy
      const isValid = verifyTOTPCode(secret, code);

      if (!isValid) {
        // Record failed attempt for progressive lockout
        await recordMfaFailure(identifier);
        throw new UnauthorizedError('Invalid MFA code');
      }

      // Clear failure count on success
      await recordMfaSuccess(identifier);

      return sendSuccess(reply, { verified: true });
    },
  });

  // MFA complete setup endpoint (enables MFA after verification)
  fastify.post<{ Body: MfaVerifyRequest }>('/mfa/complete', {
    preHandler: [authenticate, mfaRateLimiter, validateBody(mfaVerifyRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Complete MFA setup',
      description: 'Verifies MFA code and enables MFA for the user account',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { code } = request.body;
      const userId = request.user!.userId;

      // Get user's pending MFA secret
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mfaSecret: true, mfaEnabled: true },
      });

      if (!user || !user.mfaSecret) {
        throw new BadRequestError('MFA setup not initiated. Please call /mfa/setup first.');
      }

      if (user.mfaEnabled) {
        throw new BadRequestError('MFA is already enabled for this account.');
      }

      // Verify TOTP code
      const isValid = verifyTOTPCode(user.mfaSecret, code);

      if (!isValid) {
        await recordMfaFailure(userId);
        throw new UnauthorizedError('Invalid MFA code');
      }

      // Enable MFA
      await prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });

      // Clear failure count
      await recordMfaSuccess(userId);

      return sendSuccess(reply, {
        message: 'MFA enabled successfully',
        mfaEnabled: true,
      });
    },
  });

  // OAuth callback endpoint - handles authorization code exchange
  fastify.post<{ Body: OAuthCallbackBody }>('/oauth/callback', {
    preHandler: [publicRateLimiter],
    schema: {
      tags: ['Authentication'],
      summary: 'OAuth callback',
      description: 'Exchange OAuth authorization code for tokens',
    },
    handler: async (request, reply) => {
      const { code, codeVerifier, provider, redirectUri } = request.body;

      if (!code || !codeVerifier || !provider) {
        throw new BadRequestError('Missing required OAuth parameters');
      }

      if (provider !== 'google' && provider !== 'microsoft') {
        throw new BadRequestError('Invalid OAuth provider');
      }

      try {
        // Exchange code for tokens with the OAuth provider
        const oauthUserInfo = await exchangeOAuthCode(provider, code, codeVerifier, redirectUri);

        // Get or create user from OAuth info
        let user = await prisma.user.findUnique({
          where: { email: oauthUserInfo.email },
        });

        if (!user) {
          // Create new user from OAuth info
          user = await prisma.user.create({
            data: {
              email: oauthUserInfo.email,
              firstName: oauthUserInfo.firstName,
              lastName: oauthUserInfo.lastName,
              role: 'interviewee' as UserRole,
              emailVerified: true, // OAuth providers verify email
              passwordHash: '', // OAuth users don't have password
            },
          });
        } else if (!user.emailVerified) {
          // Mark email as verified for existing users
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true },
          });
          user.emailVerified = true;
        }

        // Generate tokens
        const tokens = await generateTokenPair({
          userId: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId || undefined,
        });

        // Build user's full name
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

        // Return response in format expected by frontend
        const response = {
          user: {
            id: user.id,
            email: user.email,
            name: fullName,
            role: user.role,
            avatar: null,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        };

        return sendSuccess(reply, response);
      } catch (error) {
        request.log.error({ error }, 'OAuth callback failed');
        throw new BadRequestError('OAuth authentication failed. Please try again.');
      }
    },
  });
}

// OAuth callback body type
interface OAuthCallbackBody {
  code: string;
  codeVerifier: string;
  provider: 'google' | 'microsoft';
  redirectUri?: string;
}

// OAuth user info from provider
interface OAuthUserInfo {
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

/**
 * Exchange OAuth authorization code for user info
 */
async function exchangeOAuthCode(
  provider: 'google' | 'microsoft',
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<OAuthUserInfo> {
  if (provider === 'google') {
    return exchangeGoogleCode(code, codeVerifier, redirectUri);
  } else {
    return exchangeMicrosoftCode(code, codeVerifier, redirectUri);
  }
}

/**
 * Exchange Google OAuth code for user info
 */
async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<OAuthUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const finalRedirectUri = redirectUri || process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5174/auth/callback';

  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret || '',
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: finalRedirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Google token exchange failed:', error);
    throw new Error('Failed to exchange Google authorization code');
  }

  const tokenData = await tokenResponse.json() as { access_token: string };

  // Get user info
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfoResponse.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  const userInfo = await userInfoResponse.json() as {
    email: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
  };

  return {
    email: userInfo.email,
    firstName: userInfo.given_name,
    lastName: userInfo.family_name,
    picture: userInfo.picture,
  };
}

/**
 * Exchange Microsoft OAuth code for user info
 */
async function exchangeMicrosoftCode(
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<OAuthUserInfo> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const finalRedirectUri = redirectUri || process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:5174/auth/callback';

  if (!clientId) {
    throw new Error('MICROSOFT_CLIENT_ID not configured');
  }

  // Exchange code for tokens
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: finalRedirectUri,
  });

  // Microsoft requires client_secret for web apps if configured
  if (clientSecret) {
    tokenParams.append('client_secret', clientSecret);
  }

  const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams,
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Microsoft token exchange failed:', error);
    throw new Error('Failed to exchange Microsoft authorization code');
  }

  const tokenData = await tokenResponse.json() as { access_token: string };

  // Get user info
  const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfoResponse.ok) {
    throw new Error('Failed to fetch Microsoft user info');
  }

  const userInfo = await userInfoResponse.json() as {
    mail?: string;
    userPrincipalName: string;
    givenName?: string;
    surname?: string;
  };

  return {
    email: userInfo.mail || userInfo.userPrincipalName,
    firstName: userInfo.givenName,
    lastName: userInfo.surname,
  };
}
