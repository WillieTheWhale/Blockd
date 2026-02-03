/**
 * Graceful Shutdown Handler
 * Provides proper cleanup and shutdown procedures for the API Gateway
 */

import { FastifyInstance } from 'fastify';
import prisma from './prisma';
import { getRedisClient } from './redis-client';
import { getAllCircuitBreakerStats, resetAllCircuitBreakers } from './circuit-breaker';

export interface ShutdownOptions {
  /** Maximum time to wait for graceful shutdown (ms) */
  timeout?: number;
  /** Fastify instance to close */
  fastify?: FastifyInstance;
  /** Custom cleanup functions to run */
  cleanupHandlers?: Array<{
    name: string;
    handler: () => Promise<void>;
    critical?: boolean;
  }>;
  /** Logger function */
  logger?: (message: string, level: 'info' | 'warn' | 'error') => void;
}

const DEFAULT_SHUTDOWN_TIMEOUT = 30000; // 30 seconds

interface ShutdownState {
  isShuttingDown: boolean;
  shutdownPromise: Promise<void> | null;
}

const state: ShutdownState = {
  isShuttingDown: false,
  shutdownPromise: null,
};

/**
 * Check if the server is currently shutting down
 */
export function isShuttingDown(): boolean {
  return state.isShuttingDown;
}

/**
 * Execute graceful shutdown with timeout
 */
export async function gracefulShutdown(options: ShutdownOptions = {}): Promise<void> {
  // Prevent multiple shutdown attempts
  if (state.isShuttingDown) {
    if (state.shutdownPromise) {
      return state.shutdownPromise;
    }
    return;
  }

  state.isShuttingDown = true;

  const {
    timeout = DEFAULT_SHUTDOWN_TIMEOUT,
    fastify,
    cleanupHandlers = [],
    logger = (msg, level) => console[level](`[SHUTDOWN] ${msg}`),
  } = options;

  logger('Initiating graceful shutdown...', 'info');

  // Create shutdown promise with timeout
  state.shutdownPromise = new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      logger(`Shutdown timeout exceeded (${timeout}ms). Forcing exit.`, 'error');
      reject(new Error('Shutdown timeout exceeded'));
    }, timeout);

    // Wrap async logic in an IIFE to avoid async promise executor
    (async () => {
      // 1. Stop accepting new connections
      if (fastify) {
        logger('Stopping new connections...', 'info');
        try {
          await fastify.close();
          logger('Fastify server closed', 'info');
        } catch (error) {
          logger(`Error closing Fastify: ${error}`, 'warn');
        }
      }

      // 2. Log circuit breaker states before shutdown
      const cbStats = getAllCircuitBreakerStats();
      if (cbStats.length > 0) {
        logger(`Circuit breaker states: ${JSON.stringify(cbStats)}`, 'info');
        resetAllCircuitBreakers();
        logger('Circuit breakers reset', 'info');
      }

      // 3. Run custom cleanup handlers
      const criticalHandlers = cleanupHandlers.filter((h) => h.critical);
      const nonCriticalHandlers = cleanupHandlers.filter((h) => !h.critical);

      // Run non-critical handlers first (can fail without blocking)
      for (const handler of nonCriticalHandlers) {
        try {
          logger(`Running cleanup: ${handler.name}...`, 'info');
          await Promise.race([
            handler.handler(),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('Handler timeout')), 5000)
            ),
          ]);
          logger(`Cleanup completed: ${handler.name}`, 'info');
        } catch (error) {
          logger(`Cleanup failed (non-critical): ${handler.name} - ${error}`, 'warn');
        }
      }

      // Run critical handlers (failure will log but continue)
      for (const handler of criticalHandlers) {
        try {
          logger(`Running critical cleanup: ${handler.name}...`, 'info');
          await Promise.race([
            handler.handler(),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('Handler timeout')), 10000)
            ),
          ]);
          logger(`Critical cleanup completed: ${handler.name}`, 'info');
        } catch (error) {
          logger(`Critical cleanup failed: ${handler.name} - ${error}`, 'error');
        }
      }

      // 4. Close database connections
      logger('Closing database connections...', 'info');
      try {
        await prisma.$disconnect();
        logger('Database connections closed', 'info');
      } catch (error) {
        logger(`Error closing database: ${error}`, 'warn');
      }

      // 5. Close Redis connections
      logger('Closing Redis connections...', 'info');
      try {
        const redis = getRedisClient();
        await redis.disconnect();
        logger('Redis connections closed', 'info');
      } catch (error) {
        logger(`Error closing Redis: ${error}`, 'warn');
      }

      clearTimeout(timeoutId);
      logger('Graceful shutdown completed', 'info');
      resolve();
    })().catch((error) => {
      clearTimeout(timeoutId);
      logger(`Shutdown error: ${error}`, 'error');
      reject(error);
    });
  });

  return state.shutdownPromise;
}

/**
 * Register shutdown signal handlers
 */
export function registerShutdownHandlers(options: ShutdownOptions = {}): void {
  const logger = options.logger || ((msg, level) => console[level](`[SHUTDOWN] ${msg}`));

  const handleSignal = async (signal: string) => {
    logger(`Received ${signal} signal`, 'info');

    try {
      await gracefulShutdown(options);
      process.exit(0);
    } catch (error) {
      logger(`Shutdown failed: ${error}`, 'error');
      process.exit(1);
    }
  };

  // Handle termination signals
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  // Handle uncaught errors during shutdown
  process.on('uncaughtException', async (error) => {
    logger(`Uncaught exception: ${error.message}`, 'error');
    console.error(error.stack);

    try {
      await gracefulShutdown({ ...options, timeout: 10000 }); // Shorter timeout for errors
      process.exit(1);
    } catch {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', async (reason) => {
    logger(`Unhandled rejection: ${reason}`, 'error');

    // Don't exit on unhandled rejections, just log them
    // The error handler should handle these gracefully
  });
}

/**
 * Middleware to reject new requests during shutdown
 */
export function shutdownMiddleware(
  request: { raw: { url?: string } },
  reply: { code: (n: number) => { send: (o: unknown) => void } },
  done: () => void
): void {
  if (state.isShuttingDown) {
    // Allow health checks during shutdown for load balancer awareness
    if (request.raw.url?.includes('/health') || request.raw.url?.includes('/ready')) {
      done();
      return;
    }

    reply.code(503).send({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Server is shutting down',
      },
    });
    return;
  }

  done();
}

/**
 * Create a cleanup handler for WebSocket connections
 */
export function createWebSocketCleanupHandler(
  getConnections: () => Array<{ close: (code?: number, reason?: string) => void }>
): { name: string; handler: () => Promise<void>; critical: boolean } {
  return {
    name: 'websocket-cleanup',
    critical: false,
    handler: async () => {
      const connections = getConnections();
      for (const connection of connections) {
        try {
          connection.close(1001, 'Server shutting down');
        } catch {
          // Ignore close errors
        }
      }
    },
  };
}

/**
 * Create a cleanup handler for in-flight requests tracking
 */
export function createInFlightRequestsHandler(
  getInFlightCount: () => number,
  maxWaitTime: number = 10000
): { name: string; handler: () => Promise<void>; critical: boolean } {
  return {
    name: 'in-flight-requests',
    critical: true,
    handler: async () => {
      const startTime = Date.now();
      const checkInterval = 100;

      return new Promise<void>((resolve) => {
        const check = () => {
          const count = getInFlightCount();
          if (count === 0 || Date.now() - startTime >= maxWaitTime) {
            if (count > 0) {
              console.warn(
                `[SHUTDOWN] ${count} in-flight requests still pending after ${maxWaitTime}ms`
              );
            }
            resolve();
            return;
          }

          setTimeout(check, checkInterval);
        };

        check();
      });
    },
  };
}
