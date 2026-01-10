/**
 * Enhanced Health Check Utilities
 * Provides comprehensive health and readiness checks for the API Gateway
 */

import * as os from 'os';
import prisma from './prisma';
import { getRedisClient } from '../../shared/cache/redis-client';
import { getAllCircuitBreakerStats, CircuitState } from './circuit-breaker';
import {
  getAuthServiceClient,
  getSessionServiceClient,
  getAiDetectionServiceClient,
  getEyeTrackingServiceClient,
} from './http-client';
import config from '../src/config';

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

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  environment: string;
  dependencies: DependencyHealth[];
  circuitBreakers: Array<{
    name: string;
    state: string;
    failures: number;
    successes: number;
  }>;
  system: SystemMetrics;
  checks: {
    critical: { passed: number; failed: number };
    optional: { passed: number; failed: number };
  };
}

const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';
const DEPENDENCY_TIMEOUT = 3000; // 3 seconds per dependency

/**
 * Check database connectivity and performance
 */
async function checkDatabase(): Promise<DependencyHealth> {
  const startTime = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), DEPENDENCY_TIMEOUT)
      ),
    ]);
    return {
      name: 'postgresql',
      status: 'healthy',
      critical: true,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'postgresql',
      status: 'unhealthy',
      critical: true,
      responseTimeMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<DependencyHealth> {
  const startTime = Date.now();
  try {
    const redis = getRedisClient();
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), DEPENDENCY_TIMEOUT)
      ),
    ]);
    return {
      name: 'redis',
      status: 'healthy',
      critical: true,
      responseTimeMs: Date.now() - startTime,
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
 * Check auth service connectivity
 */
async function checkAuthService(): Promise<DependencyHealth> {
  const startTime = Date.now();
  try {
    const client = getAuthServiceClient();
    const response = await Promise.race([
      client.get('/health'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), DEPENDENCY_TIMEOUT)
      ),
    ]);

    const isHealthy = response.statusCode >= 200 && response.statusCode < 300;
    return {
      name: 'auth-service',
      status: isHealthy ? 'healthy' : 'degraded',
      critical: false,
      responseTimeMs: Date.now() - startTime,
      message: isHealthy ? undefined : `Status: ${response.statusCode}`,
    };
  } catch (error) {
    return {
      name: 'auth-service',
      status: 'unhealthy',
      critical: false,
      responseTimeMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check session service connectivity
 */
async function checkSessionService(): Promise<DependencyHealth> {
  const startTime = Date.now();
  try {
    const client = getSessionServiceClient();
    const response = await Promise.race([
      client.get('/health'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), DEPENDENCY_TIMEOUT)
      ),
    ]);

    const isHealthy = response.statusCode >= 200 && response.statusCode < 300;
    return {
      name: 'session-service',
      status: isHealthy ? 'healthy' : 'degraded',
      critical: false,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'session-service',
      status: 'unhealthy',
      critical: false,
      responseTimeMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check AI detection service connectivity
 */
async function checkAiDetectionService(): Promise<DependencyHealth> {
  const startTime = Date.now();
  try {
    const client = getAiDetectionServiceClient();
    const response = await Promise.race([
      client.get('/health'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), DEPENDENCY_TIMEOUT)
      ),
    ]);

    const isHealthy = response.statusCode >= 200 && response.statusCode < 300;
    return {
      name: 'ai-detection-service',
      status: isHealthy ? 'healthy' : 'degraded',
      critical: false,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'ai-detection-service',
      status: 'unhealthy',
      critical: false,
      responseTimeMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check eye tracking service connectivity
 */
async function checkEyeTrackingService(): Promise<DependencyHealth> {
  const startTime = Date.now();
  try {
    const client = getEyeTrackingServiceClient();
    const response = await Promise.race([
      client.get('/health'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), DEPENDENCY_TIMEOUT)
      ),
    ]);

    const isHealthy = response.statusCode >= 200 && response.statusCode < 300;
    return {
      name: 'eye-tracking-service',
      status: isHealthy ? 'healthy' : 'degraded',
      critical: false,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'eye-tracking-service',
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
 * Get circuit breaker status
 */
function getCircuitBreakerHealth(): Array<{
  name: string;
  state: string;
  failures: number;
  successes: number;
}> {
  return getAllCircuitBreakerStats().map((cb) => ({
    name: cb.name,
    state: cb.state,
    failures: cb.failures,
    successes: cb.successes,
  }));
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(options: {
  includeDependencies?: boolean;
  includeCircuitBreakers?: boolean;
  includeSystemMetrics?: boolean;
} = {}): Promise<HealthCheckResult> {
  const {
    includeDependencies = true,
    includeCircuitBreakers = true,
    includeSystemMetrics = true,
  } = options;

  const dependencies: DependencyHealth[] = [];

  if (includeDependencies) {
    // Run critical checks first (in parallel)
    const criticalChecks = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);
    dependencies.push(...criticalChecks);

    // Run optional checks (in parallel, but don't fail if they timeout)
    const optionalChecks = await Promise.allSettled([
      checkAuthService(),
      checkSessionService(),
      checkAiDetectionService(),
      checkEyeTrackingService(),
    ]);

    for (const result of optionalChecks) {
      if (result.status === 'fulfilled') {
        dependencies.push(result.value);
      }
    }
  }

  // Calculate check results
  const criticalDeps = dependencies.filter((d) => d.critical);
  const optionalDeps = dependencies.filter((d) => !d.critical);

  const checks = {
    critical: {
      passed: criticalDeps.filter((d) => d.status === 'healthy').length,
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
  } else if (checks.optional.failed > 0) {
    status = 'degraded';
  }

  // Check circuit breakers for open circuits
  const circuitBreakers = includeCircuitBreakers ? getCircuitBreakerHealth() : [];
  if (circuitBreakers.some((cb) => cb.state === CircuitState.OPEN)) {
    if (status === 'healthy') {
      status = 'degraded';
    }
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    version: SERVICE_VERSION,
    environment: config.server.nodeEnv,
    dependencies,
    circuitBreakers,
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
 */
export async function performLivenessCheck(): Promise<{ status: 'ok' | 'error'; timestamp: string }> {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Perform readiness check (is the service ready to accept traffic?)
 */
export async function performReadinessCheck(): Promise<{
  ready: boolean;
  timestamp: string;
  checks: Record<string, boolean>;
}> {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const checks = {
    database: dbHealth.status === 'healthy',
    redis: redisHealth.status === 'healthy',
  };

  return {
    ready: checks.database && checks.redis,
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * Quick health check for load balancer (minimal checks)
 */
export async function performQuickHealthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  timestamp: string;
}> {
  try {
    // Just check database connection
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }
}
