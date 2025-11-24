/**
 * Rate Limiting Middleware
 * Prevents socket event flooding and abuse
 */

import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { logger } from '../lib/logger';
import { RateLimitError } from '../lib/errors';

/**
 * Rate limiter state per socket
 */
interface RateLimiterState {
  count: number;
  resetAt: number;
  violations: number;
}

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  maxEventsPerMinute: number;
  checkInterval: number;
  violationThreshold?: number;
}

/**
 * Rate limiter storage
 */
const limiters = new Map<string, RateLimiterState>();

/**
 * Cleanup old limiters periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [socketId, state] of limiters.entries()) {
    // Remove limiters that haven't been reset in 5 minutes
    if (now - state.resetAt > 5 * 60 * 1000) {
      limiters.delete(socketId);
    }
  }
}, 60000); // Cleanup every minute

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  const {
    maxEventsPerMinute,
    checkInterval = 1000,
    violationThreshold = 5,
  } = config;

  return (socket: Socket, next: (err?: ExtendedError) => void) => {
    const socketId = socket.id;
    const now = Date.now();

    // Get or create limiter state
    let state = limiters.get(socketId);

    if (!state || now >= state.resetAt) {
      state = {
        count: 0,
        resetAt: now + checkInterval,
        violations: state?.violations || 0,
      };
      limiters.set(socketId, state);
    }

    // Increment event count
    state.count++;

    // Calculate rate per minute
    const windowMs = state.resetAt - (state.resetAt - checkInterval);
    const eventsPerMinute = (state.count / windowMs) * 60000;

    // Check if rate limit exceeded
    if (eventsPerMinute > maxEventsPerMinute) {
      state.violations++;

      const retryAfter = Math.ceil((state.resetAt - now) / 1000);

      logger.warn('Rate limit exceeded', {
        socketId,
        userId: socket.data.user?.user_id,
        eventsPerMinute: Math.round(eventsPerMinute),
        maxEventsPerMinute,
        violations: state.violations,
        retryAfter,
      });

      // Disconnect socket after too many violations
      if (state.violations >= violationThreshold) {
        logger.error('Socket disconnected due to rate limit violations', {
          socketId,
          userId: socket.data.user?.user_id,
          violations: state.violations,
        });

        socket.emit('error', {
          message: 'Too many rate limit violations. Connection terminated.',
          code: 'RATE_LIMIT_VIOLATIONS',
        });

        socket.disconnect(true);
        limiters.delete(socketId);
        return;
      }

      // Emit error to client
      socket.emit('error', {
        message: 'Rate limit exceeded. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED',
        details: { retryAfter },
      });

      return next(new RateLimitError('Rate limit exceeded', retryAfter) as ExtendedError);
    }

    // Reset violations on good behavior
    if (state.violations > 0 && eventsPerMinute < maxEventsPerMinute * 0.5) {
      state.violations = Math.max(0, state.violations - 1);
    }

    next();
  };
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats(): {
  activeLimiters: number;
  totalViolations: number;
  averageEventsPerSocket: number;
} {
  let totalViolations = 0;
  let totalEvents = 0;

  for (const state of limiters.values()) {
    totalViolations += state.violations;
    totalEvents += state.count;
  }

  return {
    activeLimiters: limiters.size,
    totalViolations,
    averageEventsPerSocket: limiters.size > 0 ? totalEvents / limiters.size : 0,
  };
}

/**
 * Clear rate limiter for socket
 */
export function clearRateLimit(socketId: string): void {
  limiters.delete(socketId);
  logger.debug('Rate limiter cleared', { socketId });
}

/**
 * Get rate limiter state for socket
 */
export function getRateLimitState(socketId: string): RateLimiterState | undefined {
  return limiters.get(socketId);
}
