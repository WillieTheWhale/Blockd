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
 */
export function genReqId(request: FastifyRequest): string {
  const existingId = request.headers['x-request-id'] as string;
  if (existingId) {
    return existingId;
  }
  // Generate a simple unique ID
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
