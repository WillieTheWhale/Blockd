/**
 * Shared Prisma Client with Connection Pool Configuration
 *
 * This module provides a properly configured PrismaClient singleton
 * with connection pooling optimized for production workloads.
 *
 * Connection Pool Configuration:
 * - connection_limit: Maximum connections per service instance (default: 50)
 * - pool_timeout: Max wait time for connection from pool (default: 30s)
 * - connect_timeout: Max wait time for new connection (default: 10s)
 * - statement_timeout: Query timeout to prevent long-running queries (default: 60s)
 * - idle_in_transaction_session_timeout: Terminate idle sessions (default: 60s)
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - DATABASE_CONNECTION_LIMIT: Max connections (default: 50)
 * - DATABASE_POOL_TIMEOUT: Pool wait timeout in seconds (default: 30)
 * - DATABASE_CONNECT_TIMEOUT: Connection timeout in seconds (default: 10)
 * - DATABASE_STATEMENT_TIMEOUT: Query timeout in milliseconds (default: 60000)
 * - DATABASE_IDLE_TIMEOUT: Idle session timeout in seconds (default: 60)
 * - NODE_ENV: Environment (development, staging, production)
 */

import { PrismaClient } from '@prisma/client';

// Connection pool configuration
export interface PoolConfig {
  connectionLimit: number;
  poolTimeout: number;
  connectTimeout: number;
  statementTimeout: number;
  idleTimeout: number;
}

// Pool statistics interface
export interface PoolStats {
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  configuredLimit: number;
}

// Health check result interface
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  message?: string;
}

// Service names for identification
export type ServiceName =
  | 'api-gateway'
  | 'auth-service'
  | 'session-service'
  | 'websocket-service'
  | 'video-service'
  | 'ai-detection'
  | 'eye-tracking'
  | 'response-timing';

/**
 * Default pool configuration
 * Can be overridden per-service based on expected load
 */
const DEFAULT_POOL_CONFIG: PoolConfig = {
  connectionLimit: 50,
  poolTimeout: 30,
  connectTimeout: 10,
  statementTimeout: 60000,
  idleTimeout: 60,
};

/**
 * Service-specific pool configurations
 * Based on expected database usage patterns
 */
const SERVICE_POOL_CONFIGS: Partial<Record<ServiceName, Partial<PoolConfig>>> = {
  'api-gateway': {
    connectionLimit: 30, // Gateway handles routing, less DB-intensive
  },
  'auth-service': {
    connectionLimit: 40, // Auth has moderate DB load
  },
  'session-service': {
    connectionLimit: 60, // High session activity
  },
  'websocket-service': {
    connectionLimit: 25, // Mostly real-time, less DB
  },
};

/**
 * Get pool configuration for a service
 */
function getPoolConfig(serviceName?: ServiceName): PoolConfig {
  const envConfig: PoolConfig = {
    connectionLimit: parseInt(process.env.DATABASE_CONNECTION_LIMIT || String(DEFAULT_POOL_CONFIG.connectionLimit), 10),
    poolTimeout: parseInt(process.env.DATABASE_POOL_TIMEOUT || String(DEFAULT_POOL_CONFIG.poolTimeout), 10),
    connectTimeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || String(DEFAULT_POOL_CONFIG.connectTimeout), 10),
    statementTimeout: parseInt(process.env.DATABASE_STATEMENT_TIMEOUT || String(DEFAULT_POOL_CONFIG.statementTimeout), 10),
    idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || String(DEFAULT_POOL_CONFIG.idleTimeout), 10),
  };

  // If environment variables are set, use them (highest priority)
  if (process.env.DATABASE_CONNECTION_LIMIT) {
    return envConfig;
  }

  // Otherwise, merge service-specific config with defaults
  const serviceConfig = serviceName ? SERVICE_POOL_CONFIGS[serviceName] : {};
  return {
    ...DEFAULT_POOL_CONFIG,
    ...serviceConfig,
    ...envConfig,
  };
}

/**
 * Build database URL with pool configuration parameters
 */
function buildDatabaseUrl(baseUrl: string, config: PoolConfig): string {
  const hasParams = baseUrl.includes('?');
  const separator = hasParams ? '&' : '?';

  const poolParams = [
    `connection_limit=${config.connectionLimit}`,
    `pool_timeout=${config.poolTimeout}`,
    `connect_timeout=${config.connectTimeout}`,
    `statement_timeout=${config.statementTimeout}`,
    `idle_in_transaction_session_timeout=${config.idleTimeout * 1000}`,
  ].join('&');

  return `${baseUrl}${separator}${poolParams}`;
}

// Singleton storage using globalThis for hot-reload support
const globalForPrisma = globalThis as unknown as {
  prismaInstances: Map<string, PrismaClient>;
  poolConfigs: Map<string, PoolConfig>;
  connectionStates: Map<string, boolean>;
};

// Initialize maps if not present
if (!globalForPrisma.prismaInstances) {
  globalForPrisma.prismaInstances = new Map();
}
if (!globalForPrisma.poolConfigs) {
  globalForPrisma.poolConfigs = new Map();
}
if (!globalForPrisma.connectionStates) {
  globalForPrisma.connectionStates = new Map();
}

/**
 * Create or get a PrismaClient instance for a service
 */
export function createPrismaClient(serviceName: ServiceName): PrismaClient {
  // Check for existing instance
  const existing = globalForPrisma.prismaInstances.get(serviceName);
  if (existing) {
    return existing;
  }

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const poolConfig = getPoolConfig(serviceName);
  const databaseUrl = buildDatabaseUrl(baseUrl, poolConfig);
  const nodeEnv = process.env.NODE_ENV || 'development';

  const prisma = new PrismaClient({
    log: nodeEnv === 'development'
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  // Store config for later reference
  globalForPrisma.poolConfigs.set(serviceName, poolConfig);

  // Log pool configuration in non-production
  if (nodeEnv !== 'production') {
    console.log(`[Database:${serviceName}] Connection pool configuration:`, poolConfig);
  }

  // Connection state tracking
  prisma.$on('query' as never, () => {
    if (!globalForPrisma.connectionStates.get(serviceName)) {
      globalForPrisma.connectionStates.set(serviceName, true);
      console.log(`[Database:${serviceName}] Connected to PostgreSQL`);
    }
  });

  // Store instance
  globalForPrisma.prismaInstances.set(serviceName, prisma);

  // Setup graceful shutdown handlers (only once per process)
  setupShutdownHandlers();

  return prisma;
}

/**
 * Get pool configuration for a service
 */
export function getServicePoolConfig(serviceName: ServiceName): PoolConfig {
  const stored = globalForPrisma.poolConfigs.get(serviceName);
  return stored || getPoolConfig(serviceName);
}

/**
 * Get pool statistics from PostgreSQL
 */
export async function getPoolStats(prisma: PrismaClient, serviceName?: ServiceName): Promise<PoolStats> {
  const config = serviceName ? getServicePoolConfig(serviceName) : DEFAULT_POOL_CONFIG;

  try {
    const result = await prisma.$queryRaw<Array<{
      active: bigint;
      idle: bigint;
      max_conn: bigint;
    }>>`
      SELECT
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND datname = current_database())::bigint as active,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle' AND datname = current_database())::bigint as idle,
        (SELECT setting::bigint FROM pg_settings WHERE name = 'max_connections') as max_conn
    `;

    const stats = result[0];
    return {
      activeConnections: Number(stats.active),
      idleConnections: Number(stats.idle),
      maxConnections: Number(stats.max_conn),
      configuredLimit: config.connectionLimit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Database:${serviceName || 'unknown'}] Failed to get pool stats:`, errorMessage);
    return {
      activeConnections: -1,
      idleConnections: -1,
      maxConnections: -1,
      configuredLimit: config.connectionLimit,
    };
  }
}

/**
 * Health check for database connection
 */
export async function healthCheck(prisma: PrismaClient): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Disconnect a specific service's Prisma client
 */
export async function disconnectPrisma(serviceName: ServiceName): Promise<void> {
  const prisma = globalForPrisma.prismaInstances.get(serviceName);
  if (prisma) {
    console.log(`[Database:${serviceName}] Disconnecting from PostgreSQL...`);
    await prisma.$disconnect();
    globalForPrisma.prismaInstances.delete(serviceName);
    globalForPrisma.connectionStates.set(serviceName, false);
    console.log(`[Database:${serviceName}] Disconnected`);
  }
}

/**
 * Disconnect all Prisma clients
 */
export async function disconnectAll(): Promise<void> {
  const services = Array.from(globalForPrisma.prismaInstances.keys());
  await Promise.all(
    services.map(async (serviceName) => {
      const prisma = globalForPrisma.prismaInstances.get(serviceName);
      if (prisma) {
        console.log(`[Database:${serviceName}] Disconnecting...`);
        await prisma.$disconnect();
        globalForPrisma.prismaInstances.delete(serviceName);
        globalForPrisma.connectionStates.set(serviceName, false);
      }
    })
  );
  console.log('[Database] All connections closed');
}

// Shutdown handlers flag
let shutdownHandlersRegistered = false;

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;

  const shutdown = async () => {
    await disconnectAll();
  };

  process.on('beforeExit', shutdown);
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });
}

/**
 * Export pool configuration constants for reference
 */
export { DEFAULT_POOL_CONFIG, SERVICE_POOL_CONFIGS };
