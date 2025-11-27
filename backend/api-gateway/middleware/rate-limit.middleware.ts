/**
 * Rate Limiting Middleware
 * Uses Redis token bucket algorithm for distributed rate limiting
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '../../shared/cache/redis-client.js';
import { TooManyRequestsError } from '../lib/errors.js';
import config from '../src/config.js';

export interface RateLimitOptions {
  max: number;
  timeWindow: number; // in seconds
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

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

      // Log error but don't block request if Redis is down
      request.log.error('Rate limiting error:', error);

      // Fail open - allow request if Redis is unavailable
      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Remaining', options.max.toString());
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
