/**
 * Prisma Client for Session Service
 *
 * Uses the shared database module with proper connection pooling.
 * Session service has the highest connection limit due to high session activity
 * and frequent database operations.
 */

import {
  createPrismaClient,
  disconnectPrisma as disconnect,
  getPoolStats as getStats,
  healthCheck as checkHealth,
  getServicePoolConfig,
} from '@blockd/shared/database';
import type { PoolStats, HealthCheckResult, PoolConfig } from '@blockd/shared/database';

const SERVICE_NAME = 'session-service' as const;

// Create/get the Prisma client instance
const prisma = createPrismaClient(SERVICE_NAME);

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
  return getServicePoolConfig(SERVICE_NAME);
}

/**
 * Get connection pool statistics
 */
export async function getPoolStats(): Promise<PoolStats> {
  return getStats(prisma, SERVICE_NAME);
}

/**
 * Check database connection health
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  return checkHealth(prisma);
}

/**
 * Gracefully disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  await disconnect(SERVICE_NAME);
}

// Re-export the pool config from the shared module for compatibility
export { SERVICE_POOL_CONFIGS as POOL_CONFIG } from '@blockd/shared/database';

// Default export for backwards compatibility
export default prisma;
