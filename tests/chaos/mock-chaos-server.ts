/**
 * Mock Chaos Server for Service Recovery Tests
 *
 * Simulates infrastructure and service failures for chaos engineering tests.
 * Provides controllable failure injection for:
 * - Database (PostgreSQL)
 * - Cache (Redis)
 * - Message Queue (RabbitMQ)
 * - Microservices (Auth, Session, AI Detection, etc.)
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// Types
// ============================================================================

export type FailureMode =
  | 'healthy'
  | 'unavailable'
  | 'timeout'
  | 'slow'
  | 'intermittent'
  | 'error_rate'
  | 'connection_refused'
  | 'partial_failure';

export interface ServiceConfig {
  name: string;
  port: number;
  healthEndpoint: string;
  failureMode: FailureMode;
  latencyMs: number;
  errorRate: number; // 0-1, probability of error
  customResponse?: Record<string, unknown>;
}

export interface ChaosServerConfig {
  services: ServiceConfig[];
  globalLatencyMs?: number;
  enableLogging?: boolean;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  dependencies?: DependencyHealth[];
  circuitBreakers?: CircuitBreakerState[];
  system?: SystemMetrics;
  disabledFeatures?: string[];
  degradationLevel?: 'none' | 'minor' | 'moderate' | 'severe';
  fallbackModes?: Record<string, string>;
  dataSource?: string;
  cacheAge?: number;
  ready?: boolean;
}

export interface DependencyHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  critical: boolean;
  responseTimeMs: number;
  message?: string;
}

export interface CircuitBreakerState {
  name: string;
  state: 'closed' | 'open' | 'half_open';
  failures: number;
  successes: number;
  lastFailure?: string;
}

export interface SystemMetrics {
  memoryUsageMb: number;
  memoryPercentage: number;
  cpuLoadAverage: number[];
  uptime: number;
}

export interface MockServiceServer {
  server: Server;
  config: ServiceConfig;
  requestCount: number;
  failureCount: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setFailureMode: (mode: FailureMode) => void;
  setLatency: (ms: number) => void;
  setErrorRate: (rate: number) => void;
  getStats: () => { requests: number; failures: number; successRate: number };
  reset: () => void;
}

// ============================================================================
// Mock Service Factory
// ============================================================================

export function createMockService(
  config: ServiceConfig,
  enableLogging = false,
  getFailedDependencies: () => string[] = () => [],
  getCriticalDependencyFailed: () => boolean = () => false,
  getAllFailedServices: () => string[] = () => [],
  getAllSlowServices: () => Map<string, number> = () => new Map()
): MockServiceServer {
  let requestCount = 0;
  let failureCount = 0;
  let currentConfig = { ...config };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    requestCount++;
    const startTime = Date.now();

    if (enableLogging) {
      console.log(`[${config.name}] ${req.method} ${req.url}`);
    }

    try {
      // Apply latency
      if (currentConfig.latencyMs > 0) {
        await sleep(currentConfig.latencyMs);
      }

      // Handle failure modes
      const shouldFail = handleFailureMode(currentConfig, res);
      if (shouldFail) {
        failureCount++;
        return;
      }

      // Route handling
      if (req.url === currentConfig.healthEndpoint || req.url === '/health') {
        handleHealthCheck(currentConfig, res, startTime, getFailedDependencies(), getAllFailedServices(), getAllSlowServices());
      } else if (req.url === '/health/ready' || req.url === '/ready') {
        handleReadinessCheck(currentConfig, res, getCriticalDependencyFailed());
      } else if (req.url === '/health/live' || req.url === '/live') {
        handleLivenessCheck(res);
      } else if (req.url === '/health/circuits') {
        handleCircuitBreakerStatus(currentConfig, res, getAllFailedServices());
      } else {
        handleGenericRequest(currentConfig, req, res);
      }
    } catch (error) {
      failureCount++;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  return {
    server,
    config: currentConfig,
    get requestCount() {
      return requestCount;
    },
    get failureCount() {
      return failureCount;
    },
    start: () =>
      new Promise((resolve) => {
        server.listen(config.port, () => {
          if (enableLogging) {
            console.log(`[${config.name}] Started on port ${config.port}`);
          }
          resolve();
        });
      }),
    stop: () =>
      new Promise((resolve) => {
        server.close(() => {
          if (enableLogging) {
            console.log(`[${config.name}] Stopped`);
          }
          resolve();
        });
      }),
    setFailureMode: (mode: FailureMode) => {
      currentConfig.failureMode = mode;
    },
    setLatency: (ms: number) => {
      currentConfig.latencyMs = ms;
    },
    setErrorRate: (rate: number) => {
      currentConfig.errorRate = Math.max(0, Math.min(1, rate));
    },
    getStats: () => ({
      requests: requestCount,
      failures: failureCount,
      successRate: requestCount > 0 ? (requestCount - failureCount) / requestCount : 1,
    }),
    reset: () => {
      requestCount = 0;
      failureCount = 0;
      currentConfig = { ...config };
    },
  };
}

// ============================================================================
// Failure Mode Handlers
// ============================================================================

function handleFailureMode(config: ServiceConfig, res: ServerResponse): boolean {
  switch (config.failureMode) {
    case 'unavailable':
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service unavailable', service: config.name }));
      return true;

    case 'timeout':
      // Don't respond - let client timeout
      return true;

    case 'connection_refused':
      res.destroy();
      return true;

    case 'intermittent':
      // 50% chance of failure
      if (Math.random() < 0.5) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Intermittent failure' }));
        return true;
      }
      return false;

    case 'error_rate':
      // Configurable error rate
      if (Math.random() < config.errorRate) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Random error based on error rate' }));
        return true;
      }
      return false;

    case 'slow':
      // Latency is already applied, just continue
      return false;

    case 'healthy':
    default:
      return false;
  }
}

// ============================================================================
// Response Handlers
// ============================================================================

// Non-critical services - failure of these causes degraded but not unhealthy
const NON_CRITICAL_SERVICES = ['ai-detection', 'eye-tracking', 'video-service', 'websocket-service'];

// Feature mapping - which features are disabled when services fail
const FEATURE_MAP: Record<string, string> = {
  'ai-detection': 'ai_detection',
  'eye-tracking': 'eye_tracking',
  'video-service': 'video_recording',
  'websocket-service': 'realtime_updates',
};

function handleHealthCheck(
  config: ServiceConfig,
  res: ServerResponse,
  startTime: number,
  failedDependencies: string[] = [],
  allFailedServices: string[] = [],
  slowServices: Map<string, number> = new Map()
): void {
  const responseTime = Date.now() - startTime;

  // Determine status based on own health, dependencies, and other failed services
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let degradationLevel: 'none' | 'minor' | 'moderate' | 'severe' = 'none';

  // Own service is slow
  if (config.failureMode === 'slow' || config.latencyMs > 500) {
    status = 'degraded';
    degradationLevel = 'minor';
  }

  // Own service has non-healthy mode
  if (config.failureMode !== 'healthy' && config.failureMode !== 'slow') {
    status = 'degraded';
    degradationLevel = 'moderate';
  }

  // Check for failed non-critical services (affects degradation level only for api-gateway)
  // Other services don't care about non-critical service failures
  // Non-critical failures set degradation level but don't change status to 'degraded'
  // unless important services are also down
  if (config.name === 'api-gateway') {
    const failedNonCritical = allFailedServices.filter(s => NON_CRITICAL_SERVICES.includes(s));
    const failedImportant = allFailedServices.filter(s => !NON_CRITICAL_SERVICES.includes(s));

    if (failedNonCritical.length > 0) {
      // Upgrade degradation level based on number of failed non-critical services
      if (failedNonCritical.length === 1) {
        degradationLevel = degradationLevel === 'none' ? 'minor' : degradationLevel;
      } else {
        degradationLevel = 'moderate';
        // Two or more non-critical services down = degraded status
        status = 'degraded';
      }
    }

    // Important (non-optional) service failures cause degraded status
    if (failedImportant.length > 0) {
      status = 'degraded';
      degradationLevel = 'moderate';
    }
  }

  // Check for slow services (causes degradation)
  if (slowServices.size > 0) {
    const relevantSlowServices = Array.from(slowServices.keys()).filter(s =>
      SERVICE_DEPENDENCIES[config.name]?.includes(s)
    );
    if (relevantSlowServices.length > 0) {
      status = 'degraded';
      if (degradationLevel === 'none') {
        degradationLevel = 'minor';
      }
    }
  }

  // Check for failed dependencies (critical services)
  if (failedDependencies.length > 0) {
    status = 'degraded';
    degradationLevel = 'severe';
  }

  // Generate disabled features based on failed services
  const disabledFeatures: string[] = [];
  for (const failedService of allFailedServices) {
    const feature = FEATURE_MAP[failedService];
    if (feature) {
      disabledFeatures.push(feature);
    }
  }

  // Generate fallback modes
  const fallbackModes: Record<string, string> = {};
  if (allFailedServices.includes('ai-detection')) {
    fallbackModes['ai_detection'] = 'simplified';
  }
  if (allFailedServices.includes('eye-tracking')) {
    fallbackModes['eye_tracking'] = 'basic_metrics';
  }
  if (allFailedServices.includes('video-service')) {
    fallbackModes['video'] = 'audio_only';
  }

  const response: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    service: config.name,
    dependencies: generateDependencyHealth(config, failedDependencies, allFailedServices, slowServices),
    circuitBreakers: generateCircuitBreakerStates(config, allFailedServices),
    system: generateSystemMetrics(),
    degradationLevel: degradationLevel,
    disabledFeatures: disabledFeatures.length > 0 ? disabledFeatures : undefined,
    fallbackModes: Object.keys(fallbackModes).length > 0 ? fallbackModes : undefined,
    dataSource: failedDependencies.includes('postgresql') ? 'cache' : 'database',
    cacheAge: failedDependencies.includes('postgresql') ? Math.floor(Date.now() - responseTime) % 10000 : undefined,
    ready: status === 'healthy' || (status === 'degraded' && failedDependencies.length === 0),
  };

  if (config.customResponse) {
    Object.assign(response, config.customResponse);
  }

  const statusCode = response.status === 'unhealthy' ? 503 : 200;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

function handleReadinessCheck(
  config: ServiceConfig,
  res: ServerResponse,
  criticalDependencyFailed: boolean = false
): void {
  // Ready if own service is healthy AND no critical dependencies failed
  const ownHealthy = config.failureMode === 'healthy' || config.failureMode === 'slow';
  const ready = ownHealthy && !criticalDependencyFailed;

  const response = {
    ready,
    timestamp: new Date().toISOString(),
    checks: {
      database: !criticalDependencyFailed,
      redis: !criticalDependencyFailed,
      self: ownHealthy,
    },
  };

  res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

function handleLivenessCheck(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
}

function handleCircuitBreakerStatus(
  config: ServiceConfig,
  res: ServerResponse,
  failedDependencies: string[] = []
): void {
  const circuits = generateCircuitBreakerStates(config, failedDependencies);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ circuitBreakers: circuits }));
}

function handleGenericRequest(config: ServiceConfig, req: IncomingMessage, res: ServerResponse): void {
  const response = {
    service: config.name,
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    status: 'ok',
  };

  if (config.customResponse) {
    Object.assign(response, config.customResponse);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

// ============================================================================
// Data Generators
// ============================================================================

function generateDependencyHealth(
  config: ServiceConfig,
  failedDependencies: string[] = [],
  allFailedServices: string[] = [],
  slowServices: Map<string, number> = new Map()
): DependencyHealth[] {
  const isHealthy = config.failureMode === 'healthy';

  // Helper to check if a specific dependency is failed
  const isDependencyFailed = (name: string) => failedDependencies.includes(name) || allFailedServices.includes(name);
  const isServiceSlow = (name: string) => slowServices.has(name);

  // Get status for a service
  const getStatus = (name: string): 'healthy' | 'unhealthy' | 'degraded' => {
    if (isDependencyFailed(name)) return 'unhealthy';
    if (isServiceSlow(name)) return 'degraded';
    return 'healthy';
  };

  // Get response time for a service
  const getResponseTime = (name: string): number => {
    if (isDependencyFailed(name)) return 5000;
    if (isServiceSlow(name)) return slowServices.get(name) || 1000;
    return 15 + Math.random() * 30;
  };

  return [
    {
      name: 'postgresql',
      status: getStatus('postgresql'),
      critical: true,
      responseTimeMs: getResponseTime('postgresql'),
      message: isDependencyFailed('postgresql') ? 'Connection timeout' : undefined,
    },
    {
      name: 'redis',
      status: getStatus('redis'),
      critical: true,
      responseTimeMs: getResponseTime('redis'),
      message: isDependencyFailed('redis') ? 'Service unavailable' : undefined,
    },
    {
      name: 'rabbitmq',
      status: getStatus('rabbitmq'),
      critical: false,
      responseTimeMs: getResponseTime('rabbitmq'),
    },
    {
      name: 'auth-service',
      status: getStatus('auth-service'),
      critical: false,
      responseTimeMs: getResponseTime('auth-service'),
    },
    {
      name: 'ai-detection',
      status: getStatus('ai-detection'),
      critical: false,
      responseTimeMs: getResponseTime('ai-detection'),
      message: isDependencyFailed('ai-detection') ? 'Service unavailable' : undefined,
    },
    {
      name: 'eye-tracking',
      status: getStatus('eye-tracking'),
      critical: false,
      responseTimeMs: getResponseTime('eye-tracking'),
      message: isDependencyFailed('eye-tracking') ? 'Service unavailable' : undefined,
    },
    {
      name: 'video-service',
      status: getStatus('video-service'),
      critical: false,
      responseTimeMs: getResponseTime('video-service'),
      message: isDependencyFailed('video-service') ? 'Service unavailable' : undefined,
    },
  ];
}

function generateCircuitBreakerStates(
  config: ServiceConfig,
  allFailedServices: string[] = []
): CircuitBreakerState[] {
  const isHealthy = config.failureMode === 'healthy' && allFailedServices.length === 0;

  // Helper to check if a specific service is failed
  const isServiceFailed = (name: string) => allFailedServices.includes(name);

  return [
    {
      name: 'openai',
      state: isServiceFailed('ai-detection') ? 'open' : isHealthy ? 'closed' : 'half_open',
      failures: isServiceFailed('ai-detection') ? 5 : isHealthy ? 0 : 2,
      successes: isServiceFailed('ai-detection') ? 0 : isHealthy ? 10 : 1,
      lastFailure: isServiceFailed('ai-detection') ? new Date().toISOString() : undefined,
    },
    {
      name: 'anthropic',
      state: 'closed',
      failures: 0,
      successes: 10,
    },
    {
      name: 'auth-service',
      state: isServiceFailed('auth-service') ? 'half_open' : isHealthy ? 'closed' : 'half_open',
      failures: isServiceFailed('auth-service') ? 3 : isHealthy ? 0 : 1,
      successes: isServiceFailed('auth-service') ? 1 : isHealthy ? 20 : 5,
    },
    {
      name: 'ai-detection',
      state: isServiceFailed('ai-detection') ? 'open' : 'closed',
      failures: isServiceFailed('ai-detection') ? 5 : 0,
      successes: isServiceFailed('ai-detection') ? 0 : 10,
      lastFailure: isServiceFailed('ai-detection') ? new Date().toISOString() : undefined,
    },
    {
      name: 'eye-tracking',
      state: isServiceFailed('eye-tracking') ? 'open' : 'closed',
      failures: isServiceFailed('eye-tracking') ? 5 : 0,
      successes: isServiceFailed('eye-tracking') ? 0 : 10,
      lastFailure: isServiceFailed('eye-tracking') ? new Date().toISOString() : undefined,
    },
    {
      name: 'video-service',
      state: isServiceFailed('video-service') ? 'open' : 'closed',
      failures: isServiceFailed('video-service') ? 5 : 0,
      successes: isServiceFailed('video-service') ? 0 : 10,
      lastFailure: isServiceFailed('video-service') ? new Date().toISOString() : undefined,
    },
  ];
}

function generateSystemMetrics(): SystemMetrics {
  return {
    memoryUsageMb: 256 + Math.random() * 256,
    memoryPercentage: 30 + Math.random() * 40,
    cpuLoadAverage: [0.5 + Math.random(), 0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.3],
    uptime: Math.floor(Date.now() / 1000) - 3600,
  };
}

// ============================================================================
// Chaos Orchestrator
// ============================================================================

// Service dependency map - defines which services depend on which
const SERVICE_DEPENDENCIES: Record<string, string[]> = {
  'api-gateway': ['postgresql', 'redis', 'auth-service', 'session-service'],
  'auth-service': ['postgresql', 'redis'],
  'session-service': ['postgresql', 'redis', 'auth-service'],
  'ai-detection': ['redis', 'postgresql'],
  'eye-tracking': ['redis'],
  'video-service': ['redis'],
  'websocket-service': ['redis', 'auth-service'],
};

// Critical dependencies - if these fail, readiness fails
const CRITICAL_DEPENDENCIES: Record<string, string[]> = {
  'api-gateway': ['postgresql', 'redis'],
  'auth-service': ['postgresql'],
  'session-service': ['postgresql', 'redis'],
};

export class ChaosOrchestrator {
  private services: Map<string, MockServiceServer> = new Map();
  private config: ChaosServerConfig;
  private failedServices: Set<string> = new Set();
  private slowServices: Map<string, number> = new Map();

  constructor(config: ChaosServerConfig) {
    this.config = config;

    for (const serviceConfig of config.services) {
      const service = createMockService(
        serviceConfig,
        config.enableLogging,
        () => this.getFailedDependencies(serviceConfig.name),
        () => this.getCriticalDependencyFailed(serviceConfig.name),
        () => Array.from(this.failedServices),
        () => this.slowServices
      );
      this.services.set(serviceConfig.name, service);
    }
  }

  // Get list of failed dependencies for a service
  private getFailedDependencies(serviceName: string): string[] {
    const deps = SERVICE_DEPENDENCIES[serviceName] || [];
    return deps.filter((dep) => this.failedServices.has(dep));
  }

  // Check if any critical dependency is failed
  private getCriticalDependencyFailed(serviceName: string): boolean {
    const criticalDeps = CRITICAL_DEPENDENCIES[serviceName] || [];
    return criticalDeps.some((dep) => this.failedServices.has(dep));
  }

  async startAll(): Promise<void> {
    const promises = Array.from(this.services.values()).map((s) => s.start());
    await Promise.all(promises);
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.services.values()).map((s) => s.stop());
    await Promise.all(promises);
  }

  getService(name: string): MockServiceServer | undefined {
    return this.services.get(name);
  }

  getAllServices(): MockServiceServer[] {
    return Array.from(this.services.values());
  }

  // Chaos injection methods
  injectFailure(serviceName: string, mode: FailureMode): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.setFailureMode(mode);
      // Track failed services for dependency propagation
      if (mode === 'unavailable' || mode === 'timeout' || mode === 'connection_refused') {
        this.failedServices.add(serviceName);
      } else if (mode === 'slow') {
        // Slow services count as degraded but not failed
        this.slowServices.set(serviceName, service.config.latencyMs);
      }
    }
  }

  injectLatency(serviceName: string, latencyMs: number): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.setLatency(latencyMs);
      this.slowServices.set(serviceName, latencyMs);
    }
  }

  injectErrorRate(serviceName: string, rate: number): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.setErrorRate(rate);
    }
  }

  // Cascade failure simulation
  injectCascadingFailure(serviceNames: string[]): void {
    for (const name of serviceNames) {
      this.injectFailure(name, 'unavailable');
    }
  }

  // Slow cascade - services slow down progressively
  async injectSlowCascade(serviceNames: string[], startLatency = 100, increment = 200): Promise<void> {
    let latency = startLatency;
    for (const name of serviceNames) {
      this.injectLatency(name, latency);
      latency += increment;
      await sleep(50); // Stagger the injection
    }
  }

  // Recovery simulation
  recoverService(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.setFailureMode('healthy');
      service.setLatency(0);
      service.setErrorRate(0);
      // Remove from failed/slow tracking
      this.failedServices.delete(serviceName);
      this.slowServices.delete(serviceName);
    }
  }

  recoverAll(): void {
    for (const [name, service] of this.services) {
      service.setFailureMode('healthy');
      service.setLatency(0);
      service.setErrorRate(0);
    }
    // Clear tracking
    this.failedServices.clear();
    this.slowServices.clear();
  }

  resetAll(): void {
    for (const service of this.services.values()) {
      service.reset();
    }
    this.failedServices.clear();
    this.slowServices.clear();
  }

  getStats(): Record<string, { requests: number; failures: number; successRate: number }> {
    const stats: Record<string, { requests: number; failures: number; successRate: number }> = {};
    for (const [name, service] of this.services) {
      stats[name] = service.getStats();
    }
    return stats;
  }
}

// ============================================================================
// Pre-configured Service Setups
// ============================================================================

export const DEFAULT_SERVICES: ServiceConfig[] = [
  {
    name: 'api-gateway',
    port: 4000,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'auth-service',
    port: 4001,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'session-service',
    port: 4002,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'ai-detection',
    port: 4003,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'eye-tracking',
    port: 4004,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'video-service',
    port: 4005,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'postgresql',
    port: 4010,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'redis',
    port: 4011,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
  {
    name: 'rabbitmq',
    port: 4012,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  },
];

export function createDefaultOrchestrator(enableLogging = false): ChaosOrchestrator {
  return new ChaosOrchestrator({
    services: DEFAULT_SERVICES,
    enableLogging,
  });
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };

// ============================================================================
// HTTP Client for Testing
// ============================================================================

export interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  latencyMs: number;
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startTime;
    const data = await response.json().catch(() => null);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      data,
      headers,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 0,
        data: { error: 'Request timeout' },
        headers: {},
        latencyMs,
      };
    }

    return {
      status: 0,
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
      headers: {},
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Circuit Breaker Simulator
// ============================================================================

export class CircuitBreakerSimulator {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: Date | null = null;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeoutMs: number;

  constructor(
    config: {
      failureThreshold?: number;
      successThreshold?: number;
      timeoutMs?: number;
    } = {}
  ) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.successThreshold = config.successThreshold ?? 3;
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if timeout has elapsed
      if (this.lastFailureTime && Date.now() - this.lastFailureTime.getTime() > this.timeoutMs) {
        this.state = 'half_open';
        this.successes = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half_open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();
    this.successes = 0;

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): { state: string; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }
}
