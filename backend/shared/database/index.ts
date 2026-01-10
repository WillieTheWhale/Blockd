/**
 * Shared Database Module
 *
 * Provides properly configured Prisma clients with connection pooling
 * for all Blockd backend services.
 */

export {
  createPrismaClient,
  disconnectPrisma,
  disconnectAll,
  getPoolStats,
  healthCheck,
  getServicePoolConfig,
  DEFAULT_POOL_CONFIG,
  SERVICE_POOL_CONFIGS,
} from './prisma-client';

export type {
  PoolConfig,
  PoolStats,
  HealthCheckResult,
  ServiceName,
} from './prisma-client';
