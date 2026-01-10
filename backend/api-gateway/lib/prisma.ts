/**
 * Prisma Client for API Gateway
 *
 * Uses the shared database module with proper connection pooling.
 * API Gateway has reduced connection limit since it primarily routes
 * requests to microservices rather than direct database operations.
 */

import {
  createPrismaClient,
  disconnectPrisma as disconnect,
  getPoolStats as getStats,
  healthCheck as checkHealth,
  getServicePoolConfig,
} from '@blockd/shared/database';
import type { PoolStats, HealthCheckResult, PoolConfig } from '@blockd/shared/database';

const SERVICE_NAME = 'api-gateway' as const;

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
