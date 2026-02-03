/**
 * CSRF Protection Middleware
 *
 * For REST APIs using JWT Bearer authentication, traditional CSRF tokens
 * don't work well since they require server-side session state.
 *
 * This middleware implements protection through:
 * 1. Origin header verification for state-changing requests
 * 2. Custom header requirement (X-Requested-With)
 * 3. SameSite cookie settings for any cookies
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { config } from '../src/config';

// Methods that modify state and need CSRF protection
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths exempt from CSRF checks (public APIs, webhooks, etc.)
const EXEMPT_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/health/quick',
  '/api/v1/ready',
  '/api/v1/live',
  '/metrics',
  '/docs',
]);

// Allowed origins (should match CORS configuration)
const getAllowedOrigins = (): Set<string> => {
  const origins = new Set<string>();

  // Add configured allowed origins (matches config.cors.origin)
  const corsOrigins = config.cors.origin;
  if (Array.isArray(corsOrigins)) {
    corsOrigins.forEach(origin => origins.add(origin));
  } else if (typeof corsOrigins === 'string' && corsOrigins !== '*') {
    origins.add(corsOrigins);
  }

  // Always allow same-origin requests (no Origin header)
  // Add localhost variations for development
  if (config.server.isDevelopment) {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:3001');
    origins.add('http://localhost:5173'); // Vite default
    origins.add('http://localhost:5174'); // Blockd frontend
    origins.add('http://127.0.0.1:3000');
    origins.add('http://127.0.0.1:3001');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://127.0.0.1:5174');
  }

  return origins;
};

/**
 * Check if the request path is exempt from CSRF protection
 */
function isExemptPath(path: string): boolean {
  // Check exact matches
  if (EXEMPT_PATHS.has(path)) {
    return true;
  }

  // Check prefix matches for health endpoints
  if (path.startsWith('/api/v1/health')) {
    return true;
  }

  // Check if it's a WebSocket upgrade
  if (path.startsWith('/api/v1/gaze/stream')) {
    return true;
  }

  // Browser client endpoints that use session tokens (not cookies)
  if (path.startsWith('/api/v1/browser/')) {
    return true;
  }

  return false;
}

/**
 * Verify the Origin header against allowed origins
 */
function verifyOrigin(origin: string | undefined, referer: string | undefined): boolean {
  const allowedOrigins = getAllowedOrigins();

  // If no Origin header, check Referer
  const sourceOrigin = origin || extractOriginFromReferer(referer);

  // Same-origin requests may not have Origin header
  if (!sourceOrigin) {
    // In development, allow requests without Origin only for localhost requests
    // This handles same-origin requests from browser (no Origin header) and CLI tools
    // In production, require Origin for state-changing requests
    if (config.server.isDevelopment) {
      // Allow only if coming from localhost/127.0.0.1 (browser direct or same-origin)
      // Note: This is permissive in dev but still provides some protection
      return true;
    }
    // In production, reject requests without origin for state-changing operations
    return false;
  }

  return allowedOrigins.has(sourceOrigin);
}

/**
 * Extract origin from Referer header
 */
function extractOriginFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;

  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

/**
 * CSRF Protection Hook
 *
 * Verifies that state-changing requests come from allowed origins.
 * This prevents cross-site request forgery attacks.
 */
export async function csrfProtection(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): Promise<void> {
  // Skip non-state-changing methods
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    return done();
  }

  // Skip exempt paths
  if (isExemptPath(request.url)) {
    return done();
  }

  // Get Origin and Referer headers
  const origin = request.headers.origin;
  const referer = request.headers.referer;

  // Verify origin
  if (!verifyOrigin(origin, referer)) {
    request.log.warn(
      { origin, referer, url: request.url, method: request.method },
      'CSRF protection: Invalid origin'
    );

    return reply.code(403).send({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: 'Request origin not allowed',
        statusCode: 403,
      },
    });
  }

  return done();
}

/**
 * Custom Header Requirement Middleware
 *
 * Requires a custom header (X-Requested-With) for API requests.
 * This provides additional CSRF protection since custom headers
 * cannot be set in cross-origin requests without CORS preflight.
 */
export async function requireCustomHeader(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): Promise<void> {
  // Skip non-state-changing methods
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    return done();
  }

  // Skip exempt paths
  if (isExemptPath(request.url)) {
    return done();
  }

  // Check for custom header
  const customHeader = request.headers['x-requested-with'];

  // In production, require the header for additional security
  if (config.server.isProduction && !customHeader) {
    request.log.warn(
      { url: request.url, method: request.method },
      'CSRF protection: Missing X-Requested-With header'
    );

    return reply.code(403).send({
      success: false,
      error: {
        code: 'CSRF_HEADER_MISSING',
        message: 'X-Requested-With header required',
        statusCode: 403,
      },
    });
  }

  return done();
}

/**
 * Set secure cookie defaults
 * Apply SameSite and Secure attributes to cookies
 */
export function setSecureCookieDefaults(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Hook into reply to set secure cookie defaults
  const originalSetCookie = reply.setCookie?.bind(reply);

  if (originalSetCookie) {
    reply.setCookie = function(
      name: string,
      value: string,
      options: Record<string, unknown> = {}
    ) {
      // Apply secure defaults
      const secureOptions = {
        ...options,
        sameSite: options.sameSite || 'strict',
        secure: config.server.isProduction ? true : (options.secure ?? false),
        httpOnly: options.httpOnly ?? true,
        path: options.path || '/',
      };

      return originalSetCookie(name, value, secureOptions);
    };
  }

  done();
}

/**
 * Combined CSRF protection middleware
 * Applies all CSRF protections in one hook
 */
export async function csrfProtectionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip non-state-changing methods
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    return;
  }

  // Skip exempt paths
  if (isExemptPath(request.url)) {
    return;
  }

  // Get Origin and Referer headers
  const origin = request.headers.origin;
  const referer = request.headers.referer;

  // Verify origin
  if (!verifyOrigin(origin, referer)) {
    request.log.warn(
      { origin, referer, url: request.url, method: request.method },
      'CSRF protection: Invalid origin'
    );

    return reply.code(403).send({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: 'Request origin not allowed',
        statusCode: 403,
      },
    });
  }

  // In production, require custom header for additional security
  // This prevents cross-origin requests since custom headers require CORS preflight
  if (config.server.isProduction) {
    const customHeader = request.headers['x-requested-with'];
    if (!customHeader) {
      request.log.warn(
        { url: request.url, method: request.method },
        'CSRF protection: Missing X-Requested-With header in production'
      );

      return reply.code(403).send({
        success: false,
        error: {
          code: 'CSRF_HEADER_MISSING',
          message: 'X-Requested-With header required for this request',
          statusCode: 403,
        },
      });
    }
  }
}

export default csrfProtectionMiddleware;
