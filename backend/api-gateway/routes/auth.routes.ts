/**
 * Authentication Routes
 * Proxies requests to auth-service
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, strictRateLimiter } from '../middleware/auth.middleware';
import { publicRateLimiter } from '../middleware/rate-limit.middleware';
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
import { sendSuccess, sendCreated } from '../lib/response';
import { BadRequestError, UnauthorizedError, InternalServerError } from '../lib/errors';
import {
  authServiceClient,
  ServiceClientError,
  extractAuthToken,
  ServiceTypes,
} from '../lib/service-client';

/**
 * Helper to forward authentication context to auth-service
 */
function getForwardHeaders(request: FastifyRequest): {
  authToken?: string;
  userId?: string;
} {
  return {
    authToken: extractAuthToken(request.headers.authorization),
    userId: request.user?.userId,
  };
}

/**
 * Convert service client errors to appropriate HTTP errors
 */
function handleServiceError(error: unknown): never {
  if (error instanceof ServiceClientError) {
    switch (error.statusCode) {
      case 401:
        throw new UnauthorizedError(error.message);
      case 400:
        throw new BadRequestError(error.message);
      default:
        throw new InternalServerError(error.message);
    }
  }
  throw error;
}

export default async function authRoutes(fastify: FastifyInstance) {
  // Register endpoint
  fastify.post<{ Body: RegisterRequest }>('/register', {
    preHandler: [publicRateLimiter, validateBody(registerRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      description: 'Creates a new user account',
      body: registerRequestSchema,
    },
    handler: async (request, reply) => {
      const { email, password, firstName, lastName, role, organizationId } = request.body;

      try {
        const response = await authServiceClient.post<ServiceTypes.AuthResponse>(
          '/auth/register',
          {
            email,
            password,
            firstName,
            lastName,
            role,
            organizationId,
          }
        );

        return sendCreated(reply, response);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Login endpoint
  fastify.post<{ Body: LoginRequest }>('/login', {
    preHandler: [publicRateLimiter, validateBody(loginRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Login user',
      description: 'Authenticates a user and returns JWT tokens',
      body: loginRequestSchema,
    },
    handler: async (request, reply) => {
      const { email, password, mfaCode } = request.body;

      try {
        const response = await authServiceClient.post<ServiceTypes.AuthResponse>(
          '/auth/login',
          {
            email,
            password,
            mfaCode,
          }
        );

        return sendSuccess(reply, response);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Refresh token endpoint
  fastify.post<{ Body: RefreshTokenRequest }>('/refresh', {
    preHandler: [publicRateLimiter, validateBody(refreshTokenRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      description: 'Generates a new access token using a refresh token',
      body: refreshTokenRequestSchema,
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;

      try {
        const response = await authServiceClient.post<{ tokens: ServiceTypes.AuthTokens }>(
          '/auth/refresh',
          { refreshToken }
        );

        return sendSuccess(reply, response);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Logout endpoint
  fastify.post<{ Body: LogoutRequest }>('/logout', {
    preHandler: [authenticate, validateBody(logoutRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Logout user',
      description: 'Revokes the refresh token',
      body: logoutRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;

      try {
        const response = await authServiceClient.forward<{ message: string }>(
          'POST',
          '/auth/logout',
          {
            body: { refreshToken },
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, response);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // MFA setup endpoint
  fastify.post<{ Body: MfaSetupRequest }>('/mfa/setup', {
    preHandler: [authenticate, strictRateLimiter, validateBody(mfaSetupRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Setup MFA',
      description: 'Enables or disables MFA for the user',
      body: mfaSetupRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { enabled } = request.body;

      try {
        const response = await authServiceClient.forward<{
          secret?: string;
          qrCode?: string;
          backupCodes?: string[];
          message?: string;
        }>(
          'POST',
          '/auth/mfa/setup',
          {
            body: { enabled },
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, response);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // MFA verify endpoint
  fastify.post<{ Body: MfaVerifyRequest }>('/mfa/verify', {
    preHandler: [publicRateLimiter, validateBody(mfaVerifyRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Verify MFA code',
      description: 'Verifies a 2FA code',
      body: mfaVerifyRequestSchema,
    },
    handler: async (request, reply) => {
      const { code, secret } = request.body;

      try {
        const response = await authServiceClient.post<{ verified: boolean }>(
          '/auth/mfa/verify',
          { code, secret }
        );

        return sendSuccess(reply, response);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get current user profile
  fastify.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Get current user profile',
      description: 'Returns the authenticated user profile',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      try {
        const user = await authServiceClient.forward<ServiceTypes.User>(
          'GET',
          '/auth/me',
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, user);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Update current user profile
  fastify.patch<{ Body: { firstName?: string; lastName?: string } }>('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Update current user profile',
      description: 'Updates the authenticated user profile',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      try {
        const user = await authServiceClient.forward<ServiceTypes.User>(
          'PATCH',
          '/auth/me',
          {
            body: request.body,
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, user);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Change password
  fastify.post<{ Body: { currentPassword: string; newPassword: string } }>('/change-password', {
    preHandler: [authenticate, strictRateLimiter],
    schema: {
      tags: ['Authentication'],
      summary: 'Change password',
      description: 'Changes the user password',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      try {
        const response = await authServiceClient.forward<{ message: string }>(
          'POST',
          '/auth/change-password',
          {
            body: request.body,
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, response);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });
}
