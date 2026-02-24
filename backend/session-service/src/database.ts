/**
 * Prisma Client for Session Service
 *
 * Provides a singleton PrismaClient instance with proper connection management.
 * Session service has the highest connection limit due to high session activity
 * and frequent database operations.
 */

import { PrismaClient } from '@prisma/client';

const SERVICE_NAME = 'session-service';

// Connection pool tracking
interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalQueries: number;
  lastQueryTime: Date | null;
}

const poolMetrics: PoolMetrics = {
  activeConnections: 0,
  idleConnections: 0,
  waitingRequests: 0,
  totalQueries: 0,
  lastQueryTime: null,
};

// Use global for singleton pattern in development (prevents multiple instances during hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  poolMetrics: PoolMetrics | undefined;
};

// Restore metrics from global if available (for hot reload)
if (globalForPrisma.poolMetrics) {
  Object.assign(poolMetrics, globalForPrisma.poolMetrics);
}

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    errorFormat: 'pretty',
  });

// Set up query tracking middleware
prisma.$use(async (params, next) => {
  poolMetrics.activeConnections++;
  poolMetrics.totalQueries++;
  poolMetrics.lastQueryTime = new Date();

  try {
    const result = await next(params);
    return result;
  } finally {
    poolMetrics.activeConnections--;
    // Update idle connections estimate based on pool config
    const config = getPoolConfig();
    poolMetrics.idleConnections = Math.max(0, config.connectionLimit - poolMetrics.activeConnections);
  }
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.poolMetrics = poolMetrics;
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
 * Get connection pool statistics
 * Uses middleware tracking for active connections and queries PostgreSQL for actual pool state
 */
export async function getPoolStats(): Promise<PoolStats> {
  // Get real-time stats from PostgreSQL for more accurate connection info
  try {
    const dbStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM pg_stat_activity
      WHERE datname = current_database()
      AND application_name LIKE '%session-service%'
      AND state = 'active'
    `;

    const idleStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM pg_stat_activity
      WHERE datname = current_database()
      AND application_name LIKE '%session-service%'
      AND state = 'idle'
    `;

    const waitingStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM pg_stat_activity
      WHERE datname = current_database()
      AND wait_event IS NOT NULL
      AND application_name LIKE '%session-service%'
    `;

    return {
      serviceName: SERVICE_NAME,
      activeConnections: Number(dbStats[0]?.count ?? poolMetrics.activeConnections),
      idleConnections: Number(idleStats[0]?.count ?? poolMetrics.idleConnections),
      waitingRequests: Number(waitingStats[0]?.count ?? poolMetrics.waitingRequests),
    };
  } catch (error) {
    // Fall back to middleware-tracked metrics if pg_stat_activity is not accessible
    console.warn('Could not query pg_stat_activity, using tracked metrics:', error);
    return {
      serviceName: SERVICE_NAME,
      activeConnections: poolMetrics.activeConnections,
      idleConnections: poolMetrics.idleConnections,
      waitingRequests: poolMetrics.waitingRequests,
    };
  }
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
