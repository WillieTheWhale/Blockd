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
import { initiateGoogleOAuth, handleGoogleCallback, initiateMicrosoftOAuth, handleMicrosoftCallback } from '../controllers/oauth.controller';
import { refreshToken, revokeToken, revokeAllTokens, getActiveSessions, verifyAccessToken } from '../controllers/token.controller';

// Middleware
import { validateJWT } from '../middleware/validate-jwt.middleware';
import { checkAccountLock, getRateLimitConfig, rateLimitKeyGenerator } from '../middleware/rate-limit-auth.middleware';

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

  // Password Reset
  app.post('/auth/password-reset/request', requestPasswordReset);
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

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    app.log.error(error);

    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    reply.code(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message
    });
  });

  return app;
}
