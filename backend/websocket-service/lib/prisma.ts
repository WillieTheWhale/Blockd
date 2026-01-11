/**
 * Prisma Client for WebSocket Service
 *
 * Provides a singleton PrismaClient instance with proper connection management.
 * WebSocket service has reduced connection needs since it primarily
 * handles real-time communication with minimal database operations.
 */

import { PrismaClient } from '@prisma/client';

const SERVICE_NAME = 'websocket-service';

// Use global for singleton pattern in development (prevents multiple instances during hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    errorFormat: 'pretty',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Pool statistics type for monitoring
 */
export interface PoolStats {
  serviceName: string;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
}

/**
 * Health check result type
 */
export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Get connection pool statistics (approximate)
 */
export async function getPoolStats(): Promise<PoolStats> {
  return {
    serviceName: SERVICE_NAME,
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
  };
}

/**
 * Check database connection health
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      healthy: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gracefully disconnect Prisma
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
