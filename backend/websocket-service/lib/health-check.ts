/**
 * Health Check Utilities
 * Blockd WebSocket Service
 *
 * Provides health, liveness, and readiness checks for Kubernetes probes
 */

import * as os from 'os';
import { Server } from 'socket.io';
import { RedisAdapterManager } from './redis-adapter';
import { logger } from './logger';

export interface DependencyHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  critical: boolean;
  responseTimeMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemMetrics {
  memoryUsageMb: number;
  memoryPercentage: number;
  cpuLoadAverage: number[];
  uptime: number;
  nodeVersion: string;
}

export interface SocketMetrics {
  connectedClients: number;
  rooms: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  dependencies: DependencyHealth[];
  sockets: SocketMetrics;
  system: SystemMetrics;
  checks: {
    critical: { passed: number; failed: number };
    optional: { passed: number; failed: number };
  };
}

export interface LivenessResult {
  status: 'ok' | 'error';
  timestamp: string;
}

export interface ReadinessResult {
  ready: boolean;
  timestamp: string;
  checks: Record<string, boolean>;
}

const SERVICE_NAME = 'websocket-service';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEPENDENCY_TIMEOUT = 3000;

/**
 * Health check context - passed to check functions
 */
export interface HealthCheckContext {
  io: Server;
  redisAdapter?: RedisAdapterManager;
}

/**
 * Check Redis connectivity
 */
async function checkRedis(context: HealthCheckContext): Promise<DependencyHealth> {
  const startTime = Date.now();

  if (!context.redisAdapter) {
    return {
      name: 'redis',
      status: 'degraded',
      critical: true,
      responseTimeMs: Date.now() - startTime,
      message: 'Redis adapter not initialized (running in single-node mode)',
    };
  }

  try {
    const stats = context.redisAdapter.getStats();
    const isConnected = context.redisAdapter.isRedisConnected();

    if (isConnected && stats.pubConnected && stats.subConnected) {
      // Perform a ping to verify connectivity
      const pubClient = context.redisAdapter.getPubClient();
      if (pubClient) {
        await Promise.race([
          pubClient.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), DEPENDENCY_TIMEOUT)
          ),
        ]);
      }

      return {
        name: 'redis',
        status: 'healthy',
        critical: true,
        responseTimeMs: Date.now() - startTime,
        details: stats,
      };
    }

    return {
      name: 'redis',
      status: 'unhealthy',
      critical: true,
      responseTimeMs: Date.now() - startTime,
      message: 'Redis clients not connected',
      details: stats,
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'unhealthy',
      critical: true,
      responseTimeMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Socket.io server status
 */
function checkSocketServer(context: HealthCheckContext): DependencyHealth {
  const startTime = Date.now();

  try {
    const sockets = context.io.sockets.sockets;
    const socketCount = sockets.size;
    const roomCount = context.io.sockets.adapter.rooms.size;

    return {
      name: 'socket.io',
      status: 'healthy',
      critical: false,
      responseTimeMs: Date.now() - startTime,
      details: {
        connectedClients: socketCount,
        rooms: roomCount,
      },
    };
  } catch (error) {
    return {
      name: 'socket.io',
      status: 'unhealthy',
      critical: false,
      responseTimeMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get system metrics
 */
function getSystemMetrics(): SystemMetrics {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    memoryUsageMb: Math.round(usedMemory / 1024 / 1024),
    memoryPercentage: Math.round((usedMemory / totalMemory) * 100),
    cpuLoadAverage: os.loadavg(),
    uptime: Math.round(process.uptime()),
    nodeVersion: process.version,
  };
}

/**
 * Get socket metrics
 */
function getSocketMetrics(context: HealthCheckContext): SocketMetrics {
  try {
    return {
      connectedClients: context.io.sockets.sockets.size,
      rooms: context.io.sockets.adapter.rooms.size,
    };
  } catch {
    return {
      connectedClients: 0,
      rooms: 0,
    };
  }
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(
  context: HealthCheckContext,
  options: {
    includeDependencies?: boolean;
    includeSystemMetrics?: boolean;
  } = {}
): Promise<HealthCheckResult> {
  const {
    includeDependencies = true,
    includeSystemMetrics = true,
  } = options;

  const dependencies: DependencyHealth[] = [];

  if (includeDependencies) {
    // Check critical dependencies
    const redisHealth = await checkRedis(context);
    dependencies.push(redisHealth);

    // Check optional dependencies
    const socketHealth = checkSocketServer(context);
    dependencies.push(socketHealth);
  }

  // Calculate check results
  const criticalDeps = dependencies.filter((d) => d.critical);
  const optionalDeps = dependencies.filter((d) => !d.critical);

  const checks = {
    critical: {
      passed: criticalDeps.filter((d) => d.status === 'healthy' || d.status === 'degraded').length,
      failed: criticalDeps.filter((d) => d.status === 'unhealthy').length,
    },
    optional: {
      passed: optionalDeps.filter((d) => d.status === 'healthy').length,
      failed: optionalDeps.filter((d) => d.status === 'unhealthy').length,
    },
  };

  // Determine overall status
  let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
  if (checks.critical.failed > 0) {
    status = 'unhealthy';
  } else if (criticalDeps.some((d) => d.status === 'degraded') || checks.optional.failed > 0) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: NODE_ENV,
    dependencies,
    sockets: getSocketMetrics(context),
    system: includeSystemMetrics ? getSystemMetrics() : {
      memoryUsageMb: 0,
      memoryPercentage: 0,
      cpuLoadAverage: [],
      uptime: 0,
      nodeVersion: process.version,
    },
    checks,
  };
}

/**
 * Perform liveness check (is the process alive?)
 * This should always return OK if the process is running
 */
export function performLivenessCheck(): LivenessResult {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Perform readiness check (is the service ready to accept traffic?)
 * Checks critical dependencies (Redis)
 */
export async function performReadinessCheck(context: HealthCheckContext): Promise<ReadinessResult> {
  const redisHealth = await checkRedis(context);

  // Consider degraded Redis as still ready (single-node mode works)
  const redisReady = redisHealth.status === 'healthy' || redisHealth.status === 'degraded';

  const checks: Record<string, boolean> = {
    redis: redisReady,
  };

  // Service is ready if all critical checks pass (or are degraded)
  const ready = Object.values(checks).every((check) => check);

  if (!ready) {
    logger.warn('Readiness check failed', { checks });
  }

  return {
    ready,
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * Create health check context
 */
export function createHealthCheckContext(
  io: Server,
  redisAdapter?: RedisAdapterManager
): HealthCheckContext {
  return { io, redisAdapter };
}
