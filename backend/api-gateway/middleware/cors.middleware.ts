/**
 * CORS Configuration Middleware
 */

import { FastifyRequest } from 'fastify';
import config from '../src/config';

export interface CorsOptions {
  origin: string | string[] | boolean | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void);
  credentials?: boolean;
  exposedHeaders?: string[];
  allowedHeaders?: string[];
  methods?: string[];
  maxAge?: number;
}

/**
 * CORS configuration for Fastify
 */
export const corsOptions: CorsOptions = {
  // Origin configuration
  origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = config.cors.origin;

    // Reject requests with no origin in production
    // No-origin requests (curl, Postman, etc.) should use API keys instead of CORS
    if (!origin) {
      // In development, allow no-origin for testing tools
      if (config.cors.allowNoOrigin || process.env.NODE_ENV === 'development') {
        callback(null, true);
        return;
      }
      callback(new Error('Origin header is required'), false);
      return;
    }

    // Allow all origins if configured as '*' (development only)
    if (allowedOrigins === '*') {
      if (process.env.NODE_ENV === 'production') {
        callback(new Error('Wildcard CORS not allowed in production'), false);
        return;
      }
      callback(null, true);
      return;
    }

    // Check if origin is in allowed list
    const allowed = Array.isArray(allowedOrigins)
      ? allowedOrigins.includes(origin)
      : allowedOrigins === origin;

    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    }
  },

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
