/**
 * Prisma Client for Session Service
 *
 * Provides a singleton PrismaClient instance with proper connection management.
 * Session service has the highest connection limit due to high session activity
 * and frequent database operations.
 */

import { PrismaClient } from '@prisma/client';

const SERVICE_NAME = 'session-service';

// Use global for singleton pattern in development (prevents multiple instances during hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma =
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
 * Pool configuration type
 */
export interface PoolConfig {
  connectionLimit: number;
  connectTimeout: number;
  idleTimeout: number;
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
 * Get the Prisma client instance
 */
export function getPrismaClient() {
  return prisma;
}

/**
 * Get current pool configuration
 */
export function getPoolConfig(): PoolConfig {
  return {
    connectionLimit: 20, // Default for session service
    connectTimeout: 10000,
    idleTimeout: 30000,
  };
}

/**
 * Get connection pool statistics (approximate)
 */
export async function getPoolStats(): Promise<PoolStats> {
  // Prisma doesn't expose pool stats directly, but we can track basic info
  return {
    serviceName: SERVICE_NAME,
    activeConnections: 0, // Would need custom tracking
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
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

// Pool config export for backwards compatibility
export const POOL_CONFIG = {
  'session-service': getPoolConfig(),
};

export { SERVICE_POOL_CONFIGS } from './pool-config';

export default prisma;
