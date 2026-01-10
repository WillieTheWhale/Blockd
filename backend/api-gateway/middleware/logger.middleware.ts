/**
 * Request Logger Middleware Configuration
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import config from '../src/config';

/**
 * Pino logger configuration
 */
export const loggerConfig = {
  level: config.logging.level,
  transport: config.logging.prettyPrint
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  serializers: {
    req: (request: FastifyRequest) => ({
      method: request.method,
      url: request.url,
      path: request.routeOptions?.url,
      parameters: request.params,
      headers: {
        host: request.headers.host,
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
      },
      remoteAddress: request.ip,
      remotePort: request.socket?.remotePort,
    }),
    res: (reply: FastifyReply) => ({
      statusCode: reply.statusCode,
      headers: reply.getHeaders(),
    }),
    err: (error: Error) => ({
      type: error.name,
      message: error.message,
      stack: config.server.isDevelopment ? error.stack : undefined,
    }),
  },
};

/**
 * Request logging options
 */
export const requestLoggingOptions = {
  // Don't log health check requests in production
  ignore: (request: FastifyRequest) => {
    if (config.server.isProduction && request.url === '/api/v1/health') {
      return true;
    }
    return false;
  },
};

/**
 * Custom request ID generator
 * Compatible with Fastify's genReqId option which receives raw IncomingMessage
 */
export function genReqId(request: { headers: Record<string, string | string[] | undefined> }): string {
  const existingId = request.headers['x-request-id'];
  if (existingId && typeof existingId === 'string') {
    return existingId;
  }
  // Generate a simple unique ID
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Request timing symbol for storing start time
 */
const REQUEST_START_TIME = Symbol('requestStartTime');

/**
 * Augment FastifyRequest to include timing
 */
declare module 'fastify' {
  interface FastifyRequest {
    [REQUEST_START_TIME]?: bigint;
  }
}

/**
 * Hook to record request start time
 * Register with: app.addHook('onRequest', requestTimingStart)
 */
export async function requestTimingStart(request: FastifyRequest): Promise<void> {
  request[REQUEST_START_TIME] = process.hrtime.bigint();
}

/**
 * Hook to log request duration on response
 * Register with: app.addHook('onResponse', requestTimingEnd)
 *
 * Logs request duration in milliseconds along with method, path, and status code.
 * Useful for monitoring API performance and identifying slow endpoints.
 */
export async function requestTimingEnd(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = request[REQUEST_START_TIME];
  if (!startTime) return;

  const endTime = process.hrtime.bigint();
  const durationNs = endTime - startTime;
  const durationMs = Number(durationNs) / 1_000_000;

  // Log request timing metrics
  request.log.info({
    request_timing: {
      method: request.method,
      path: request.routeOptions?.url || request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(durationMs * 100) / 100, // Round to 2 decimal places
    },
  }, `Request completed in ${durationMs.toFixed(2)}ms`);

  // Log slow requests as warnings (>1000ms)
  if (durationMs > 1000) {
    request.log.warn({
      slow_request: {
        method: request.method,
        path: request.routeOptions?.url || request.url,
        durationMs: Math.round(durationMs),
      },
    }, `Slow request detected: ${durationMs.toFixed(0)}ms`);
  }
}
