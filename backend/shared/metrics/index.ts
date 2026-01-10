/**
 * Prometheus Metrics Module
 *
 * Provides centralized metrics collection for all Blockd services.
 * Uses prom-client for metrics collection and exposes /metrics endpoint.
 *
 * Usage:
 *   import { metricsMiddleware, register, httpRequestDuration } from '@blockd/shared/metrics';
 *
 *   // For Fastify
 *   app.get('/metrics', async (req, reply) => {
 *     reply.header('Content-Type', register.contentType);
 *     return register.metrics();
 *   });
 *
 *   // Use default metrics
 *   collectDefaultMetrics();
 */

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics as promCollectDefaultMetrics,
  register as defaultRegister,
} from 'prom-client';

// Create a custom registry for our metrics
export const register = new Registry();

// Merge with default registry to include Node.js runtime metrics
register.setDefaultLabels({
  app: process.env.SERVICE_NAME || 'blockd',
});

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
export function collectDefaultMetrics(): void {
  promCollectDefaultMetrics({
    register,
    prefix: 'nodejs_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

// HTTP Request Duration Histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// HTTP Request Total Counter
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// HTTP Request Size Histogram
export const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

// HTTP Response Size Histogram
export const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

// Active Connections Gauge
export const activeConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
  registers: [register],
});

// WebSocket Connections Gauge
export const wsConnections = new Gauge({
  name: 'websocket_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['namespace'],
  registers: [register],
});

// WebSocket Messages Counter
export const wsMessagesTotal = new Counter({
  name: 'websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['namespace', 'event', 'direction'],
  registers: [register],
});

// Database Query Duration Histogram
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// Database Connection Pool Gauge
export const dbPoolSize = new Gauge({
  name: 'db_pool_connections',
  help: 'Number of connections in database pool',
  labelNames: ['state'],
  registers: [register],
});

// Redis Operation Duration Histogram
export const redisOperationDuration = new Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Duration of Redis operations in seconds',
  labelNames: ['operation'],
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  registers: [register],
});

// Redis Cache Hits/Misses Counter
export const redisCacheHits = new Counter({
  name: 'redis_cache_hits_total',
  help: 'Total number of Redis cache hits',
  labelNames: ['key_prefix'],
  registers: [register],
});

export const redisCacheMisses = new Counter({
  name: 'redis_cache_misses_total',
  help: 'Total number of Redis cache misses',
  labelNames: ['key_prefix'],
  registers: [register],
});

// RabbitMQ Message Counter
export const mqMessagesPublished = new Counter({
  name: 'rabbitmq_messages_published_total',
  help: 'Total number of messages published to RabbitMQ',
  labelNames: ['exchange', 'routing_key'],
  registers: [register],
});

export const mqMessagesConsumed = new Counter({
  name: 'rabbitmq_messages_consumed_total',
  help: 'Total number of messages consumed from RabbitMQ',
  labelNames: ['queue'],
  registers: [register],
});

// External API Call Duration Histogram
export const externalApiDuration = new Histogram({
  name: 'external_api_duration_seconds',
  help: 'Duration of external API calls in seconds',
  labelNames: ['service', 'endpoint', 'status_code'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

// Business Metrics - Sessions
export const activeSessions = new Gauge({
  name: 'blockd_active_sessions',
  help: 'Number of active interview sessions',
  registers: [register],
});

export const sessionsTotal = new Counter({
  name: 'blockd_sessions_total',
  help: 'Total number of interview sessions created',
  labelNames: ['status'],
  registers: [register],
});

// Business Metrics - AI Detection
export const aiDetectionDuration = new Histogram({
  name: 'blockd_ai_detection_duration_seconds',
  help: 'Duration of AI detection analysis',
  labelNames: ['model'],
  buckets: [0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register],
});

export const aiDetectionResults = new Counter({
  name: 'blockd_ai_detection_results_total',
  help: 'AI detection results by risk level',
  labelNames: ['risk_level'],
  registers: [register],
});

// Business Metrics - Eye Tracking
export const gazeEventsProcessed = new Counter({
  name: 'blockd_gaze_events_processed_total',
  help: 'Total number of gaze events processed',
  registers: [register],
});

export const offScreenDetections = new Counter({
  name: 'blockd_off_screen_detections_total',
  help: 'Total number of off-screen gaze detections',
  labelNames: ['direction'],
  registers: [register],
});

// Business Metrics - Security Events
export const securityEvents = new Counter({
  name: 'blockd_security_events_total',
  help: 'Total number of security events detected',
  labelNames: ['event_type', 'severity'],
  registers: [register],
});

// Circuit Breaker Metrics
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Current state of circuit breaker (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerTrips = new Counter({
  name: 'circuit_breaker_trips_total',
  help: 'Total number of circuit breaker trips',
  labelNames: ['service'],
  registers: [register],
});

/**
 * Fastify metrics plugin
 * Automatically records HTTP metrics for all requests
 */
export function fastifyMetricsPlugin(fastify: any, opts: any, done: () => void) {
  fastify.addHook('onRequest', (request: any, reply: any, done: () => void) => {
    request.startTime = process.hrtime.bigint();
    activeConnections.inc();
    done();
  });

  fastify.addHook('onResponse', (request: any, reply: any, done: () => void) => {
    const duration = Number(process.hrtime.bigint() - request.startTime) / 1e9;
    const route = request.routeOptions?.url || request.url || 'unknown';
    const method = request.method;
    const statusCode = reply.statusCode.toString();

    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestsTotal.inc({ method, route, status_code: statusCode });

    if (request.headers['content-length']) {
      httpRequestSize.observe({ method, route }, parseInt(request.headers['content-length'], 10));
    }

    const responseSize = reply.getHeader('content-length');
    if (responseSize) {
      httpResponseSize.observe({ method, route }, parseInt(responseSize as string, 10));
    }

    activeConnections.dec();
    done();
  });

  done();
}

/**
 * Express-style metrics middleware
 * Use with Express or similar frameworks
 */
export function metricsMiddleware() {
  return (req: any, res: any, next: () => void) => {
    const startTime = process.hrtime.bigint();
    activeConnections.inc();

    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
      const route = req.route?.path || req.path || 'unknown';
      const method = req.method;
      const statusCode = res.statusCode.toString();

      httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
      httpRequestsTotal.inc({ method, route, status_code: statusCode });

      activeConnections.dec();
    });

    next();
  };
}

/**
 * Get metrics as text for /metrics endpoint
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics content type header
 */
export function getMetricsContentType(): string {
  return register.contentType;
}

// Export the default register for advanced usage
export { defaultRegister };
