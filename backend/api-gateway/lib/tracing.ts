/**
 * Distributed Tracing Implementation
 * Provides request tracing across microservices using W3C Trace Context standard
 *
 * This is a lightweight implementation that can be upgraded to OpenTelemetry
 * for production use with minimal code changes.
 */

import * as crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// W3C Trace Context Headers
// See: https://www.w3.org/TR/trace-context/
// ============================================================================

/**
 * W3C standard header for propagating trace context across services.
 * Format: version-traceId-parentSpanId-flags
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
const TRACEPARENT_HEADER = 'traceparent';

/**
 * W3C standard header for vendor-specific trace context.
 * Allows multiple tracing systems to propagate their state.
 */
const TRACESTATE_HEADER = 'tracestate';

/**
 * Custom header for business-level correlation across requests.
 * Unlike trace IDs, correlation IDs can span multiple traces
 * (e.g., a user action that triggers multiple API calls).
 */
const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Standard request ID header, used as fallback correlation ID.
 * Also used by load balancers and proxies for request tracking.
 */
const REQUEST_ID_HEADER = 'x-request-id';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  traceState?: string;
  correlationId: string;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Generate a random hex string
 */
function generateHexId(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a new trace ID (32 hex characters = 16 bytes)
 */
export function generateTraceId(): string {
  return generateHexId(16);
}

/**
 * Generate a new span ID (16 hex characters = 8 bytes)
 */
export function generateSpanId(): string {
  return generateHexId(8);
}

/**
 * Generate a correlation ID (UUID v4 format)
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Parse W3C traceparent header
 * Format: version-traceId-parentSpanId-flags
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
export function parseTraceParent(header: string): Partial<TraceContext> | null {
  const parts = header.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, parentSpanId, flags] = parts;

  // Only support version 00
  if (version !== '00') {
    return null;
  }

  // Validate trace ID (32 hex chars, not all zeros)
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === '00000000000000000000000000000000') {
    return null;
  }

  // Validate parent span ID (16 hex chars, not all zeros)
  if (!/^[0-9a-f]{16}$/.test(parentSpanId) || parentSpanId === '0000000000000000') {
    return null;
  }

  // Parse flags
  const flagsInt = parseInt(flags, 16);
  const sampled = (flagsInt & 0x01) === 0x01;

  return {
    traceId,
    parentSpanId,
    sampled,
  };
}

/**
 * Create W3C traceparent header
 */
export function createTraceParent(context: TraceContext): string {
  const flags = context.sampled ? '01' : '00';
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Extract trace context from request headers
 */
export function extractTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext {
  const traceparent = headers[TRACEPARENT_HEADER];
  const tracestate = headers[TRACESTATE_HEADER];
  const correlationId = headers[CORRELATION_ID_HEADER] || headers[REQUEST_ID_HEADER];

  let context: TraceContext;

  if (typeof traceparent === 'string') {
    const parsed = parseTraceParent(traceparent);
    if (parsed) {
      context = {
        traceId: parsed.traceId!,
        spanId: generateSpanId(),
        parentSpanId: parsed.parentSpanId,
        sampled: parsed.sampled ?? true,
        traceState: typeof tracestate === 'string' ? tracestate : undefined,
        correlationId: (typeof correlationId === 'string' ? correlationId : undefined) || generateCorrelationId(),
      };
    } else {
      // Invalid traceparent, start a new trace
      context = createNewTraceContext(typeof correlationId === 'string' ? correlationId : undefined);
    }
  } else {
    // No traceparent header, start a new trace
    context = createNewTraceContext(typeof correlationId === 'string' ? correlationId : undefined);
  }

  return context;
}

/**
 * Create a new trace context
 */
export function createNewTraceContext(correlationId?: string): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    sampled: true,
    correlationId: correlationId || generateCorrelationId(),
  };
}

/**
 * Create headers for propagating trace context
 */
export function createTraceHeaders(context: TraceContext): Record<string, string> {
  const headers: Record<string, string> = {
    [TRACEPARENT_HEADER]: createTraceParent(context),
    [CORRELATION_ID_HEADER]: context.correlationId,
    [REQUEST_ID_HEADER]: context.correlationId,
  };

  if (context.traceState) {
    headers[TRACESTATE_HEADER] = context.traceState;
  }

  return headers;
}

// ============================================================================
// Span Management
// ============================================================================

/**
 * Service name used in all spans from this service.
 * Should match the service name in Kubernetes/Docker for correlation.
 */
const SERVICE_NAME = 'api-gateway';

/**
 * In-memory store of currently active spans.
 * Used for debugging and span management during request lifecycle.
 * Key: spanId, Value: Span object
 */
const activeSpans = new Map<string, Span>();

/**
 * Ring buffer of recently completed spans.
 * Retained for debugging, testing, and potential batch export.
 * In production, completed spans should be sent to a tracing backend (Jaeger, Zipkin).
 */
const completedSpans: Span[] = [];

/**
 * Maximum number of completed spans to retain in memory.
 * Older spans are evicted when this limit is exceeded.
 * Adjust based on memory constraints and debugging needs.
 */
const MAX_COMPLETED_SPANS = 1000;

/**
 * Start a new span
 */
export function startSpan(
  operationName: string,
  context: TraceContext,
  attributes: Record<string, string | number | boolean> = {}
): Span {
  const span: Span = {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    operationName,
    serviceName: SERVICE_NAME,
    startTime: Date.now(),
    status: 'UNSET',
    attributes: {
      'correlation.id': context.correlationId,
      ...attributes,
    },
    events: [],
  };

  activeSpans.set(span.spanId, span);
  return span;
}

/**
 * End a span
 */
export function endSpan(span: Span, status: 'OK' | 'ERROR' = 'OK'): void {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;

  activeSpans.delete(span.spanId);

  // Store completed span
  completedSpans.push(span);
  if (completedSpans.length > MAX_COMPLETED_SPANS) {
    completedSpans.shift();
  }

  // Log span for debugging/collection
  logSpan(span);
}

/**
 * Add an event to a span
 */
export function addSpanEvent(
  span: Span,
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  span.events.push({
    name,
    timestamp: Date.now(),
    attributes,
  });
}

/**
 * Set span attribute
 */
export function setSpanAttribute(
  span: Span,
  key: string,
  value: string | number | boolean
): void {
  span.attributes[key] = value;
}

/**
 * Log span data (for debugging/export)
 */
function logSpan(span: Span): void {
  const logData = {
    trace_id: span.traceId,
    span_id: span.spanId,
    parent_span_id: span.parentSpanId,
    operation: span.operationName,
    service: span.serviceName,
    duration_ms: span.duration,
    status: span.status,
    attributes: span.attributes,
    events: span.events,
  };

  // In production, this would be sent to a tracing backend (Jaeger, Zipkin, etc.)
  console.log('[TRACE]', JSON.stringify(logData));
}

// ============================================================================
// Fastify Integration
// ============================================================================

// Store trace context on request
declare module 'fastify' {
  interface FastifyRequest {
    traceContext?: TraceContext;
    span?: Span;
  }
}

/**
 * Fastify hook to extract trace context and start request span
 */
export function tracingPreHandler(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  // Extract or create trace context
  const context = extractTraceContext(request.headers as Record<string, string | string[] | undefined>);
  request.traceContext = context;

  // Start request span
  const span = startSpan(`${request.method} ${request.routeOptions?.url || request.url}`, context, {
    'http.method': request.method,
    'http.url': request.url,
    'http.route': request.routeOptions?.url || 'unknown',
    'http.client_ip': request.ip,
    'http.user_agent': request.headers['user-agent'] || 'unknown',
  });
  request.span = span;

  // Set response headers for correlation
  reply.header(CORRELATION_ID_HEADER, context.correlationId);
  reply.header(REQUEST_ID_HEADER, context.correlationId);

  done();
}

/**
 * Fastify hook to end request span
 */
export function tracingOnResponse(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (request.span) {
    setSpanAttribute(request.span, 'http.status_code', reply.statusCode);

    const status = reply.statusCode >= 400 ? 'ERROR' : 'OK';
    endSpan(request.span, status);
  }

  done();
}

/**
 * Get trace headers from request for propagation to other services
 */
export function getTraceHeadersFromRequest(request: FastifyRequest): Record<string, string> {
  if (request.traceContext) {
    // Create child span context for downstream service
    const childContext: TraceContext = {
      ...request.traceContext,
      parentSpanId: request.traceContext.spanId,
      spanId: generateSpanId(),
    };
    return createTraceHeaders(childContext);
  }
  return createTraceHeaders(createNewTraceContext());
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get all completed spans (for debugging/testing)
 */
export function getCompletedSpans(): Span[] {
  return [...completedSpans];
}

/**
 * Clear completed spans (for testing)
 */
export function clearCompletedSpans(): void {
  completedSpans.length = 0;
}

/**
 * Get active span count
 */
export function getActiveSpanCount(): number {
  return activeSpans.size;
}
