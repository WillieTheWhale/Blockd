/**
 * Prisma Client for WebSocket Service
 *
 * Uses the shared database module with proper connection pooling.
 * WebSocket service has reduced connection limit since it primarily
 * handles real-time communication with minimal database operations.
 */

import {
  createPrismaClient,
  disconnectPrisma as disconnect,
  getPoolStats as getStats,
  healthCheck as checkHealth,
  getServicePoolConfig,
} from '@blockd/shared/database';
import type { PoolStats, HealthCheckResult, PoolConfig } from '@blockd/shared/database';

const SERVICE_NAME = 'websocket-service' as const;

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
