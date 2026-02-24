/**
 * CORS Configuration Middleware
 */

import config from '../src/config';

import type { FastifyCorsOptions } from '@fastify/cors';

export type CorsOptions = FastifyCorsOptions;

/**
 * Origin validation function for CORS
 * Using async origin function that returns Promise<boolean>
 * @fastify/cors v10+ uses single-argument async origin function
 */
async function validateOrigin(origin: string | undefined): Promise<boolean> {
  const allowedOrigins = config.cors.origin;

  // Reject requests with no origin in production
  // No-origin requests (curl, Postman, etc.) should use API keys instead of CORS
  if (!origin) {
    // In development/test mode, allow no-origin for testing tools
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (config.cors.allowNoOrigin || nodeEnv === 'development' || nodeEnv === 'test') {
      return true;
    }
    return false;
  }

  // Allow all origins if configured as '*' (development only)
  if (allowedOrigins === '*') {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  // Check if origin is in allowed list
  const allowed = Array.isArray(allowedOrigins)
    ? allowedOrigins.includes(origin)
    : allowedOrigins === origin;

  return allowed;
}

/**
 * CORS configuration for Fastify
 */
export const corsOptions: CorsOptions = {
  // Origin configuration using async function
  origin: validateOrigin,

  // Allow credentials
  credentials: config.cors.credentials,

  // Exposed headers
  exposedHeaders: [
    'Content-Range',
    'X-Total-Count',
    'X-Page',
    'X-Page-Size',
    'X-Total-Pages',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],

  // Allowed headers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
  ],

  // Allowed methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Preflight cache duration (24 hours)
  maxAge: 86400,
};

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string): boolean {
  const allowedOrigins = config.cors.origin;

  if (allowedOrigins === '*') {
    return true;
  }

  if (Array.isArray(allowedOrigins)) {
    return allowedOrigins.includes(origin);
  }

  return allowedOrigins === origin;
}
