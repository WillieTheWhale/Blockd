/**
 * Prometheus Metrics for API Gateway
 * Provides comprehensive observability metrics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// ============================================================================
// Metric Types (compatible with prom-client when installed)
// ============================================================================

interface MetricLabels {
  [key: string]: string | number;
}

interface CounterMetric {
  name: string;
  help: string;
  labelNames: string[];
  values: Map<string, number>;
  inc(labels?: MetricLabels, value?: number): void;
}

interface GaugeMetric {
  name: string;
  help: string;
  labelNames: string[];
  values: Map<string, number>;
  set(labels: MetricLabels, value: number): void;
  inc(labels?: MetricLabels, value?: number): void;
  dec(labels?: MetricLabels, value?: number): void;
}

interface HistogramMetric {
  name: string;
  help: string;
  labelNames: string[];
  buckets: number[];
  observations: Map<string, number[]>;
  observe(labels: MetricLabels, value: number): void;
}

// ============================================================================
// Simple In-Memory Metrics Implementation
// (Replace with prom-client in production)
// ============================================================================

function createLabelsKey(labels: MetricLabels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

function createCounter(name: string, help: string, labelNames: string[]): CounterMetric {
  const values = new Map<string, number>();

  return {
    name,
    help,
    labelNames,
    values,
    inc(labels: MetricLabels = {}, value = 1) {
      const key = createLabelsKey(labels);
      values.set(key, (values.get(key) || 0) + value);
    },
  };
}

function createGauge(name: string, help: string, labelNames: string[]): GaugeMetric {
  const values = new Map<string, number>();

  return {
    name,
    help,
    labelNames,
    values,
    set(labels: MetricLabels, value: number) {
      const key = createLabelsKey(labels);
      values.set(key, value);
    },
    inc(labels: MetricLabels = {}, value = 1) {
      const key = createLabelsKey(labels);
      values.set(key, (values.get(key) || 0) + value);
    },
    dec(labels: MetricLabels = {}, value = 1) {
      const key = createLabelsKey(labels);
      values.set(key, (values.get(key) || 0) - value);
    },
  };
}

function createHistogram(
  name: string,
  help: string,
  labelNames: string[],
  buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
): HistogramMetric {
  const observations = new Map<string, number[]>();

  return {
    name,
    help,
    labelNames,
    buckets,
    observations,
    observe(labels: MetricLabels, value: number) {
      const key = createLabelsKey(labels);
      const obs = observations.get(key) || [];
      obs.push(value);
      observations.set(key, obs);
    },
  };
}

// ============================================================================
// API Gateway Metrics
// ============================================================================

export const httpRequestsTotal = createCounter(
  'http_requests_total',
  'Total number of HTTP requests',
  ['method', 'route', 'status_code']
);

export const httpRequestDurationSeconds = createHistogram(
  'http_request_duration_seconds',
  'HTTP request latency in seconds',
  ['method', 'route', 'status_code'],
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

export const httpRequestSizeBytes = createHistogram(
  'http_request_size_bytes',
  'HTTP request size in bytes',
  ['method', 'route'],
  [100, 1000, 10000, 100000, 1000000]
);

export const httpResponseSizeBytes = createHistogram(
  'http_response_size_bytes',
  'HTTP response size in bytes',
  ['method', 'route'],
  [100, 1000, 10000, 100000, 1000000]
);

export const activeConnections = createGauge(
  'http_active_connections',
  'Number of active HTTP connections',
  []
);

export const websocketConnectionsTotal = createCounter(
  'websocket_connections_total',
  'Total number of WebSocket connections',
  ['status']
);

export const websocketActiveConnections = createGauge(
  'websocket_active_connections',
  'Number of active WebSocket connections',
  []
);

export const websocketMessagesTotal = createCounter(
  'websocket_messages_total',
  'Total number of WebSocket messages',
  ['direction', 'type']
);

export const databaseQueryDurationSeconds = createHistogram(
  'database_query_duration_seconds',
  'Database query latency in seconds',
  ['operation', 'table'],
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
);

export const databaseConnectionsActive = createGauge(
  'database_connections_active',
  'Number of active database connections',
  []
);

export const redisOperationDurationSeconds = createHistogram(
  'redis_operation_duration_seconds',
  'Redis operation latency in seconds',
  ['operation'],
  [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1]
);

export const cacheHitsTotal = createCounter(
  'cache_hits_total',
  'Total number of cache hits',
  ['cache_type']
);

export const cacheMissesTotal = createCounter(
  'cache_misses_total',
  'Total number of cache misses',
  ['cache_type']
);

export const circuitBreakerState = createGauge(
  'circuit_breaker_state',
  'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  ['service']
);

export const circuitBreakerFailuresTotal = createCounter(
  'circuit_breaker_failures_total',
  'Total number of circuit breaker failures',
  ['service']
);

export const externalServiceRequestsTotal = createCounter(
  'external_service_requests_total',
  'Total requests to external services',
  ['service', 'status']
);

export const externalServiceDurationSeconds = createHistogram(
  'external_service_duration_seconds',
  'External service request duration in seconds',
  ['service'],
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

export const rateLimitHitsTotal = createCounter(
  'rate_limit_hits_total',
  'Total number of rate limit hits',
  ['endpoint', 'type']
);

export const authenticationAttemptsTotal = createCounter(
  'authentication_attempts_total',
  'Total authentication attempts',
  ['status', 'method']
);

export const sessionEventsTotal = createCounter(
  'session_events_total',
  'Total session lifecycle events',
  ['event_type']
);

export const analysisRequestsTotal = createCounter(
  'analysis_requests_total',
  'Total AI analysis requests',
  ['type', 'status']
);

export const analysisRiskScoreHistogram = createHistogram(
  'analysis_risk_score',
  'Distribution of analysis risk scores',
  ['type'],
  [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
);

// ============================================================================
// Metrics Collection Helpers
// ============================================================================

export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number,
  requestSize?: number,
  responseSize?: number
): void {
  const labels = { method, route, status_code: statusCode.toString() };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationMs / 1000);

  if (requestSize !== undefined) {
    httpRequestSizeBytes.observe({ method, route }, requestSize);
  }
  if (responseSize !== undefined) {
    httpResponseSizeBytes.observe({ method, route }, responseSize);
  }
}

export function recordExternalServiceCall(
  service: string,
  status: 'success' | 'error' | 'timeout',
  durationMs: number
): void {
  externalServiceRequestsTotal.inc({ service, status });
  externalServiceDurationSeconds.observe({ service }, durationMs / 1000);
}

export function recordCacheAccess(cacheType: string, hit: boolean): void {
  if (hit) {
    cacheHitsTotal.inc({ cache_type: cacheType });
  } else {
    cacheMissesTotal.inc({ cache_type: cacheType });
  }
}

export function recordAnalysis(type: 'question' | 'answer', success: boolean, riskScore?: number): void {
  analysisRequestsTotal.inc({ type, status: success ? 'success' : 'error' });
  if (riskScore !== undefined) {
    analysisRiskScoreHistogram.observe({ type }, riskScore);
  }
}

// ============================================================================
// Prometheus Format Export
// ============================================================================

function formatCounter(metric: CounterMetric): string {
  const lines: string[] = [
    `# HELP ${metric.name} ${metric.help}`,
    `# TYPE ${metric.name} counter`,
  ];

  if (metric.values.size === 0) {
    lines.push(`${metric.name} 0`);
  } else {
    for (const [labels, value] of metric.values) {
      if (labels) {
        lines.push(`${metric.name}{${labels}} ${value}`);
      } else {
        lines.push(`${metric.name} ${value}`);
      }
    }
  }

  return lines.join('\n');
}

function formatGauge(metric: GaugeMetric): string {
  const lines: string[] = [
    `# HELP ${metric.name} ${metric.help}`,
    `# TYPE ${metric.name} gauge`,
  ];

  if (metric.values.size === 0) {
    lines.push(`${metric.name} 0`);
  } else {
    for (const [labels, value] of metric.values) {
      if (labels) {
        lines.push(`${metric.name}{${labels}} ${value}`);
      } else {
        lines.push(`${metric.name} ${value}`);
      }
    }
  }

  return lines.join('\n');
}

function formatHistogram(metric: HistogramMetric): string {
  const lines: string[] = [
    `# HELP ${metric.name} ${metric.help}`,
    `# TYPE ${metric.name} histogram`,
  ];

  for (const [labels, observations] of metric.observations) {
    const sortedObs = [...observations].sort((a, b) => a - b);
    const sum = observations.reduce((a, b) => a + b, 0);
    const count = observations.length;

    for (const bucket of metric.buckets) {
      const bucketCount = sortedObs.filter(v => v <= bucket).length;
      const labelStr = labels ? `${labels},le="${bucket}"` : `le="${bucket}"`;
      lines.push(`${metric.name}_bucket{${labelStr}} ${bucketCount}`);
    }

    const infLabelStr = labels ? `${labels},le="+Inf"` : `le="+Inf"`;
    lines.push(`${metric.name}_bucket{${infLabelStr}} ${count}`);

    if (labels) {
      lines.push(`${metric.name}_sum{${labels}} ${sum}`);
      lines.push(`${metric.name}_count{${labels}} ${count}`);
    } else {
      lines.push(`${metric.name}_sum ${sum}`);
      lines.push(`${metric.name}_count ${count}`);
    }
  }

  return lines.join('\n');
}

export function getMetrics(): string {
  const metrics: string[] = [
    formatCounter(httpRequestsTotal),
    formatHistogram(httpRequestDurationSeconds),
    formatHistogram(httpRequestSizeBytes),
    formatHistogram(httpResponseSizeBytes),
    formatGauge(activeConnections),
    formatCounter(websocketConnectionsTotal),
    formatGauge(websocketActiveConnections),
    formatCounter(websocketMessagesTotal),
    formatHistogram(databaseQueryDurationSeconds),
    formatGauge(databaseConnectionsActive),
    formatHistogram(redisOperationDurationSeconds),
    formatCounter(cacheHitsTotal),
    formatCounter(cacheMissesTotal),
    formatGauge(circuitBreakerState),
    formatCounter(circuitBreakerFailuresTotal),
    formatCounter(externalServiceRequestsTotal),
    formatHistogram(externalServiceDurationSeconds),
    formatCounter(rateLimitHitsTotal),
    formatCounter(authenticationAttemptsTotal),
    formatCounter(sessionEventsTotal),
    formatCounter(analysisRequestsTotal),
    formatHistogram(analysisRiskScoreHistogram),
  ];

  return metrics.join('\n\n');
}

// ============================================================================
// Fastify Plugin
// ============================================================================

async function metricsPlugin(fastify: FastifyInstance): Promise<void> {
  // Track active connections
  fastify.addHook('onRequest', async (request) => {
    activeConnections.inc();
    (request as any).metricsStartTime = process.hrtime.bigint();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    activeConnections.dec();

    const startTime = (request as any).metricsStartTime as bigint;
    if (startTime) {
      const durationNs = process.hrtime.bigint() - startTime;
      const durationMs = Number(durationNs) / 1_000_000;

      const route = request.routeOptions?.url || request.url;
      const contentLength = request.headers['content-length'];
      const responseSize = reply.getHeader('content-length');

      recordHttpRequest(
        request.method,
        route,
        reply.statusCode,
        durationMs,
        contentLength ? parseInt(contentLength as string, 10) : undefined,
        responseSize ? parseInt(responseSize as string, 10) : undefined
      );
    }
  });

  // Metrics endpoint
  fastify.get('/metrics', {
    schema: {
      tags: ['Monitoring'],
      summary: 'Prometheus metrics endpoint',
      description: 'Returns metrics in Prometheus text format',
    },
    handler: async (request, reply) => {
      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return reply.send(getMetrics());
    },
  });
}

export const metrics = fp(metricsPlugin, {
  name: 'metrics',
  fastify: '5.x',
});

export default metrics;
