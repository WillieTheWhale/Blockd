/**
 * Rate Limiting Middleware
 * Uses Redis token bucket algorithm for distributed rate limiting
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '../lib/redis-client';
import { TooManyRequestsError } from '../lib/errors';
import config from '../src/config';

export interface RateLimitOptions {
  max: number;
  timeWindow: number; // in seconds
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * In-memory rate limiter fallback for when Redis is unavailable
 * Uses a simple sliding window algorithm with automatic cleanup
 */
class InMemoryRateLimiter {
  private buckets: Map<string, { count: number; resetAt: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  check(key: string, max: number, windowSeconds: number): { allowed: boolean; remaining: number; resetAt: Date } {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    // If no bucket or bucket has expired, create a new one
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      });
      return {
        allowed: true,
        remaining: max - 1,
        resetAt: new Date(now + windowSeconds * 1000),
      };
    }

    // Increment the counter
    bucket.count++;
    const allowed = bucket.count <= max;
    const remaining = Math.max(0, max - bucket.count);

    return {
      allowed,
      remaining,
      resetAt: new Date(bucket.resetAt),
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }
}

// Singleton instance for in-memory rate limiting fallback
const inMemoryRateLimiter = new InMemoryRateLimiter();

/**
 * Create rate limit middleware
 */
export function createRateLimiter(options: RateLimitOptions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const redis = getRedisClient();

    // Determine identifier (IP or user ID)
    const identifier = request.user?.userId || request.ip;
    const key = `${options.keyPrefix || 'rate_limit'}:${identifier}`;

    try {
      // Use Redis rate limiting
      const result = await redis.rateLimit(identifier, {
        maxRequests: options.max,
        windowSeconds: options.timeWindow,
      });

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', result.resetAt.toISOString());

      if (!result.allowed) {
        const retryAfter = Math.ceil(
          (result.resetAt.getTime() - Date.now()) / 1000
        );
        reply.header('Retry-After', retryAfter.toString());

        throw new TooManyRequestsError(
          `Rate limit exceeded. Try again in ${retryAfter} seconds`,
          {
            limit: options.max,
            remaining: 0,
            resetAt: result.resetAt.toISOString(),
            retryAfter,
          }
        );
      }
    } catch (error) {
      if (error instanceof TooManyRequestsError) {
        throw error;
      }

      // Log error but use in-memory fallback if Redis is down
      request.log.error({ err: error }, 'Rate limiting error - using in-memory fallback');

      // In-memory fallback rate limiter
      const fallbackResult = inMemoryRateLimiter.check(key, options.max, options.timeWindow);

      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Remaining', fallbackResult.remaining.toString());
      reply.header('X-RateLimit-Reset', fallbackResult.resetAt.toISOString());

      if (!fallbackResult.allowed) {
        const retryAfter = Math.ceil(
          (fallbackResult.resetAt.getTime() - Date.now()) / 1000
        );
        reply.header('Retry-After', retryAfter.toString());

        throw new TooManyRequestsError(
          `Rate limit exceeded. Try again in ${retryAfter} seconds`,
          {
            limit: options.max,
            remaining: 0,
            resetAt: fallbackResult.resetAt.toISOString(),
            retryAfter,
          }
        );
      }
    }
  };
}

/**
 * Public endpoint rate limiter (100 req/min)
 */
export const publicRateLimiter = createRateLimiter({
  max: config.rateLimit.public.max,
  timeWindow: config.rateLimit.public.timeWindow,
  keyPrefix: 'public',
});

/**
 * Authenticated endpoint rate limiter (500 req/min)
 */
export const authRateLimiter = createRateLimiter({
  max: config.rateLimit.authenticated.max,
  timeWindow: config.rateLimit.authenticated.timeWindow,
  keyPrefix: 'auth',
});

/**
 * Strict rate limiter for sensitive operations (10 req/min)
 */
export const strictRateLimiter = createRateLimiter({
  max: 10,
  timeWindow: 60,
  keyPrefix: 'strict',
});

/**
 * Custom rate limiter factory
 */
export function customRateLimiter(max: number, timeWindowSeconds: number) {
  return createRateLimiter({
    max,
    timeWindow: timeWindowSeconds,
    keyPrefix: 'custom',
  });
}

/**
 * MFA Rate Limiter with Progressive Lockout
 *
 * Implements strict rate limiting for MFA verification:
 * - 5 attempts per 15 minutes per user/IP
 * - Progressive lockout: 1 min, 5 min, 15 min, 1 hour after consecutive failures
 * - Tracks failed attempts to prevent brute force attacks on TOTP (1M combinations)
 */

interface MfaRateLimitResult {
  allowed: boolean;
  remaining: number;
  lockoutMinutes?: number;
  message?: string;
}

/**
 * Get lockout duration based on failure count
 */
function getLockoutDuration(failureCount: number): number {
  // Progressive lockout durations in minutes
  if (failureCount >= 10) return 60; // 1 hour after 10 failures
  if (failureCount >= 7) return 15; // 15 min after 7 failures
  if (failureCount >= 5) return 5; // 5 min after 5 failures
  if (failureCount >= 3) return 1; // 1 min after 3 failures
  return 0;
}

/**
 * MFA-specific rate limiter with progressive lockout
 */
export async function mfaRateLimiter(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const redis = getRedisClient();

  // Use both user identifier and IP for MFA rate limiting
  const userId = request.user?.userId;
  const ip = request.ip;
  const identifier = userId || ip;

  const attemptKey = `mfa_attempts:${identifier}`;
  const lockoutKey = `mfa_lockout:${identifier}`;
  const failureKey = `mfa_failures:${identifier}`;

  try {
    // Check if user is locked out
    const lockoutUntil = await redis.get(lockoutKey);
    if (lockoutUntil) {
      const lockoutTime = new Date(lockoutUntil);
      const now = new Date();

      if (lockoutTime > now) {
        const remainingSeconds = Math.ceil((lockoutTime.getTime() - now.getTime()) / 1000);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);

        reply.header('Retry-After', remainingSeconds.toString());
        reply.header('X-MFA-Lockout', 'true');
        reply.header('X-MFA-Lockout-Minutes', remainingMinutes.toString());

        throw new TooManyRequestsError(
          `Account temporarily locked due to too many failed MFA attempts. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
          {
            lockoutUntil: lockoutTime.toISOString(),
            retryAfter: remainingSeconds,
            lockoutMinutes: remainingMinutes,
          }
        );
      }
    }

    // Check rate limit (5 attempts per 15 minutes)
    const result = await redis.rateLimit(identifier, {
      maxRequests: 5,
      windowSeconds: 900, // 15 minutes
    });

    reply.header('X-MFA-RateLimit-Limit', '5');
    reply.header('X-MFA-RateLimit-Remaining', result.remaining.toString());
    reply.header('X-MFA-RateLimit-Reset', result.resetAt.toISOString());

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
      reply.header('Retry-After', retryAfter.toString());

      // Increment failure count for progressive lockout
      const failures = await redis.incr(failureKey);
      await redis.expire(failureKey, 3600); // Track failures for 1 hour

      // Apply progressive lockout
      const lockoutMinutes = getLockoutDuration(failures);
      if (lockoutMinutes > 0) {
        const lockoutUntilTime = new Date(Date.now() + lockoutMinutes * 60 * 1000);
        await redis.set(lockoutKey, lockoutUntilTime.toISOString());
        await redis.expire(lockoutKey, lockoutMinutes * 60);

        request.log.warn(
          { identifier, failures, lockoutMinutes },
          'MFA progressive lockout applied'
        );
      }

      throw new TooManyRequestsError(
        `Too many MFA verification attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        {
          limit: 5,
          remaining: 0,
          resetAt: result.resetAt.toISOString(),
          retryAfter,
          failures,
        }
      );
    }
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      throw error;
    }

    // Log error but don't block request if Redis is down
    request.log.error({ error }, 'MFA rate limiting error');

    // Fail closed for MFA - require Redis to be available
    // This is more secure than allowing unlimited attempts
    throw new TooManyRequestsError(
      'Unable to verify rate limit. Please try again.',
      { reason: 'rate_limit_unavailable' }
    );
  }
}

/**
 * Record successful MFA verification (resets failure count)
 */
export async function recordMfaSuccess(identifier: string): Promise<void> {
  const redis = getRedisClient();

  try {
    const failureKey = `mfa_failures:${identifier}`;
    const lockoutKey = `mfa_lockout:${identifier}`;

    // Clear failure count and lockout on success
    await Promise.all([
      redis.del(failureKey),
      redis.del(lockoutKey),
    ]);
  } catch (error) {
    // Log but don't fail - this is a cleanup operation
    console.error('Failed to reset MFA failure count:', error);
  }
}

/**
 * Record failed MFA attempt (increments failure count)
 */
export async function recordMfaFailure(identifier: string): Promise<void> {
  const redis = getRedisClient();

  try {
    const failureKey = `mfa_failures:${identifier}`;
    const lockoutKey = `mfa_lockout:${identifier}`;

    // Increment failure count
    const failures = await redis.incr(failureKey);
    await redis.expire(failureKey, 3600); // Track for 1 hour

    // Apply progressive lockout if threshold reached
    const lockoutMinutes = getLockoutDuration(failures);
    if (lockoutMinutes > 0) {
      const lockoutUntilTime = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      await redis.set(lockoutKey, lockoutUntilTime.toISOString());
      await redis.expire(lockoutKey, lockoutMinutes * 60);
    }
  } catch (error) {
    console.error('Failed to record MFA failure:', error);
  }
}

/**
 * Login rate limiter - stricter than public rate limiter
 * 10 attempts per 15 minutes per IP
 */
export const loginRateLimiter = createRateLimiter({
  max: 10,
  timeWindow: 900, // 15 minutes
  keyPrefix: 'login',
});

/**
 * PDF generation rate limiter - expensive operation
 * 10 requests per minute per user (CPU/memory intensive)
 */
export const pdfRateLimiter = createRateLimiter({
  max: 10,
  timeWindow: 60, // 1 minute
  keyPrefix: 'pdf',
});

/**
 * Session creation rate limiter
 * 30 requests per minute per user (resource creation)
 */
export const sessionCreationRateLimiter = createRateLimiter({
  max: 30,
  timeWindow: 60, // 1 minute
  keyPrefix: 'session_create',
});

/**
 * Email sending rate limiter
 * 5 emails per minute per user
 */
export const emailRateLimiter = createRateLimiter({
  max: 5,
  timeWindow: 60, // 1 minute
  keyPrefix: 'email',
});
