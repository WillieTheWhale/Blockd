/**
 * Prisma Client for Auth Service
 *
 * Uses the shared database module with proper connection pooling.
 * Auth service handles moderate database load for user authentication
 * and session management.
 */

import {
  createPrismaClient,
  disconnectPrisma as disconnect,
  getPoolStats as getStats,
  healthCheck as checkHealth,
  getServicePoolConfig,
} from '@blockd/shared/database';
import type { PoolStats, HealthCheckResult, PoolConfig } from '@blockd/shared/database';

const SERVICE_NAME = 'auth-service' as const;

// Create/get the Prisma client instance
export const prisma = createPrismaClient(SERVICE_NAME);

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
 * Gracefully disconnect Prisma
 */
export async function disconnectPrisma(): Promise<void> {
  await disconnect(SERVICE_NAME);
}

export default prisma;
