/**
 * Rate Limiting Middleware for Authentication
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { isAccountLocked } from '../services/session.service';
import { RateLimitError, AccountLockedError } from '../lib/errors';

/**
 * Middleware to check if account is locked
 */
export async function checkAccountLock(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const body = request.body as any;
    const email = body?.email;

    if (!email) {
      // If no email provided, let it pass (will be handled by validation)
      return;
    }

    const lockStatus = await isAccountLocked(email);

    if (lockStatus.locked && lockStatus.until) {
      const retryAfter = Math.ceil((lockStatus.until - Date.now()) / 1000);

      throw new AccountLockedError(
        'Account is temporarily locked due to too many failed login attempts',
        new Date(lockStatus.until)
      );
    }
  } catch (error) {
    if (error instanceof AccountLockedError) {
      const retryAfter = error.lockedUntil
        ? Math.ceil((error.lockedUntil.getTime() - Date.now()) / 1000)
        : undefined;

      reply.code(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: error.message,
        code: 'ACCOUNT_LOCKED',
        retry_after: retryAfter,
        locked_until: error.lockedUntil?.toISOString()
      });
      return;
    }

    // Don't fail on errors, log without exposing sensitive data
    // Use request.log if available (Fastify), otherwise silently continue
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (request.log) {
      request.log.error({ error: errorMessage, service: 'account-lock-check' }, 'Account lock check failed');
    }
  }
}

/**
 * Get rate limit config for different endpoints
 */
export function getRateLimitConfig(endpoint: string) {
  const configs: Record<string, any> = {
    login: {
      max: 10, // 10 requests
      timeWindow: '1 minute',
      skipSuccessfulRequests: false
    },
    register: {
      max: 5,
      timeWindow: '1 minute',
      skipSuccessfulRequests: false
    },
    'password-reset': {
      max: 3,
      timeWindow: '1 hour',
      skipSuccessfulRequests: true
    },
    'email-verification': {
      max: 3,
      timeWindow: '1 hour',
      skipSuccessfulRequests: true
    },
    'mfa-setup': {
      max: 5,
      timeWindow: '1 hour',
      skipSuccessfulRequests: true
    },
    'mfa-verify': {
      max: 5,
      timeWindow: '5 minutes',
      skipSuccessfulRequests: false
    },
    'token-refresh': {
      max: 20,
      timeWindow: '1 minute',
      skipSuccessfulRequests: true
    }
  };

  return configs[endpoint] || {
    max: 100,
    timeWindow: '1 minute',
    skipSuccessfulRequests: true
  };
}

/**
 * Custom rate limit key generator based on email or IP
 */
export function rateLimitKeyGenerator(request: FastifyRequest): string {
  const body = request.body as any;
  const email = body?.email;

  if (email) {
    return `email:${email}`;
  }

  // Fall back to IP address
  const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limit error handler
 */
export function rateLimitErrorHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  error: Error
): void {
  reply.code(429).send({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  });
}

/**
 * Middleware to add rate limit headers
 */
export async function addRateLimitHeaders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // These would be added by the @fastify/rate-limit plugin
  // This is a placeholder for custom header logic if needed
}
