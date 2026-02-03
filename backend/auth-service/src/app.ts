/**
 * Application Factory
 * Blockd Auth Service
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';

// Controllers
import { register, login, verifyEmail, requestPasswordReset, confirmPasswordReset, logout } from '../controllers/auth.controller';
import { setupMFA, verifyMFASetup, verifyMFALogin, disableMFA, getMFAStatus } from '../controllers/mfa.controller';
import {
  handleOAuthCallback,
  initiateOAuth,
  initiateGoogleOAuth,
  handleGoogleCallback,
  initiateMicrosoftOAuth,
  handleMicrosoftCallback,
  getOAuthProviders
} from '../controllers/oauth.controller';
import { refreshToken, revokeToken, revokeAllTokens, getActiveSessions, verifyAccessToken } from '../controllers/token.controller';

// Middleware
import { validateJWT } from '../middleware/validate-jwt.middleware';
import { checkAccountLock, getRateLimitConfig, rateLimitKeyGenerator } from '../middleware/rate-limit-auth.middleware';
import { incrementRateLimit, getRateLimitCount } from '../lib/redis';

/**
 * Password reset specific rate limiter
 * Limits to 3 requests per hour per IP to prevent email enumeration
 */
async function passwordResetRateLimiter(
  request: any,
  reply: any
): Promise<void> {
  const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  const key = `password-reset:${ip}`;
  const windowSeconds = 3600; // 1 hour
  const maxAttempts = 3;

  const currentCount = await getRateLimitCount(key);

  if (currentCount >= maxAttempts) {
    return reply.code(429).send({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many password reset requests. Please try again later.',
      code: 'PASSWORD_RESET_RATE_LIMITED',
      retry_after: windowSeconds
    });
  }

  await incrementRateLimit(key, windowSeconds);
}

/**
 * Create Fastify application
 */
export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logging.level,
      transport: config.logging.prettyPrint
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname'
            }
          }
        : undefined
    }
  });

  // Register plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  });

  await app.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials
  });

  if (config.rateLimiting.enabled) {
    await app.register(rateLimit, {
      global: true,
      max: config.rateLimiting.maxRequests,
      timeWindow: config.rateLimiting.timeWindow,
      keyGenerator: rateLimitKeyGenerator
    });
  }

  // Health check
  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      service: 'auth-service',
      timestamp: new Date().toISOString()
    };
  });

  // Root endpoint
  app.get('/', async (request, reply) => {
    return {
      service: 'Blockd Authentication Service',
      version: '1.0.0',
      endpoints: {
        auth: '/auth/*',
        health: '/health'
      }
    };
  });

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================

  // Registration and Login
  app.post('/auth/register', {
    preHandler: checkAccountLock
  }, register);

  app.post('/auth/login', {
    preHandler: checkAccountLock
  }, login);

  app.post('/auth/logout', logout);

  // Email Verification
  app.post('/auth/verify-email', verifyEmail);

  // Password Reset (with strict rate limiting to prevent email enumeration)
  app.post('/auth/password-reset/request', {
    preHandler: [passwordResetRateLimiter]
  }, requestPasswordReset);

  app.post('/auth/password-reset/confirm', confirmPasswordReset);

  // ============================================================================
  // MFA ROUTES
  // ============================================================================

  app.post('/auth/mfa/setup', {
    preHandler: [validateJWT]
  }, setupMFA);

  app.post('/auth/mfa/verify', {
    preHandler: [validateJWT]
  }, verifyMFASetup);

  app.post('/auth/mfa/verify-login', verifyMFALogin);

  app.post('/auth/mfa/disable', {
    preHandler: [validateJWT]
  }, disableMFA);

  app.get('/auth/mfa/status', {
    preHandler: [validateJWT]
  }, getMFAStatus);

  // ============================================================================
  // OAUTH ROUTES
  // ============================================================================

  // Primary PKCE-based OAuth endpoint (recommended)
  app.post('/auth/oauth/callback', handleOAuthCallback);

  // Optional server-side state initialization
  app.post('/auth/oauth/initiate', initiateOAuth);

  // Get available OAuth providers
  app.get('/auth/oauth/providers', getOAuthProviders);

  // Legacy redirect-based OAuth (deprecated, kept for backwards compatibility)
  app.get('/auth/oauth/google', initiateGoogleOAuth);
  app.get('/auth/oauth/google/callback', handleGoogleCallback);

  app.get('/auth/oauth/microsoft', initiateMicrosoftOAuth);
  app.get('/auth/oauth/microsoft/callback', handleMicrosoftCallback);

  // ============================================================================
  // TOKEN ROUTES
  // ============================================================================

  app.post('/auth/refresh', refreshToken);

  app.post('/auth/revoke', revokeToken);

  app.post('/auth/revoke-all', {
    preHandler: [validateJWT]
  }, revokeAllTokens);

  app.get('/auth/sessions', {
    preHandler: [validateJWT]
  }, getActiveSessions);

  app.post('/auth/verify-token', verifyAccessToken);

  // ============================================================================
  // ERROR HANDLER
  // ============================================================================

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    // Log full error internally
    app.log.error({
      err: error,
      requestId: request.id,
      url: request.url,
      method: request.method,
    });

    const statusCode = error.statusCode || 500;
    const isProduction = config.nodeEnv === 'production';

    // In production, sanitize error messages to prevent information leakage
    let message = error.message || 'Internal Server Error';
    let errorName = error.name || 'Error';

    if (isProduction && statusCode >= 500) {
      // Don't expose internal error details in production for 5xx errors
      message = 'An unexpected error occurred. Please try again later.';
      errorName = 'InternalError';
    }

    // Sanitize specific error types that might leak sensitive info
    if (isProduction) {
      // Don't reveal database errors
      if (message.toLowerCase().includes('prisma') ||
          message.toLowerCase().includes('database') ||
          message.toLowerCase().includes('connection')) {
        message = 'Service temporarily unavailable. Please try again.';
        errorName = 'ServiceError';
      }

      // Don't reveal Redis errors
      if (message.toLowerCase().includes('redis') ||
          message.toLowerCase().includes('econnrefused')) {
        message = 'Service temporarily unavailable. Please try again.';
        errorName = 'ServiceError';
      }
    }

    reply.code(statusCode).send({
      statusCode,
      error: errorName,
      message,
      // Only include error code if it's a known application error code
      ...(error.code && !isProduction ? { code: error.code } : {}),
      // Include request ID for support correlation
      requestId: request.id
    });
  });

  return app;
}
