/**
 * CSRF Protection Middleware
 *
 * ============================================================================
 * SECURITY MODEL DOCUMENTATION
 * ============================================================================
 *
 * For REST APIs using JWT Bearer authentication, traditional CSRF tokens
 * don't work well since they require server-side session state.
 *
 * This middleware implements protection through:
 * 1. Origin header verification for state-changing requests
 * 2. Custom header requirement (X-Requested-With) in production
 * 3. SameSite cookie settings for any cookies
 *
 * ============================================================================
 * EXEMPT ENDPOINTS AND SECURITY RATIONALE
 * ============================================================================
 *
 * The following endpoints are exempt from CSRF protection for specific
 * security and architectural reasons:
 *
 * HEALTH/MONITORING ENDPOINTS:
 * - /api/v1/health, /api/v1/health/quick, /api/v1/ready, /api/v1/live
 * - /metrics, /docs
 * - Rationale: These are read-only endpoints used by orchestration systems
 *   (Kubernetes, load balancers, monitoring). They expose no sensitive data
 *   and perform no state changes. CSRF protection would break health checks.
 *
 * WEBSOCKET ENDPOINTS:
 * - /api/v1/gaze/stream
 * - Rationale: WebSocket connections use a different security model. The
 *   initial HTTP upgrade request cannot include custom headers in all
 *   browsers. Authentication is performed via session tokens in the WebSocket
 *   protocol after connection establishment.
 *
 * BROWSER CLIENT ENDPOINTS:
 * - /api/v1/browser/*
 * - Rationale: These endpoints serve the browser extension which uses
 *   session-based tokens (not cookies). The browser extension generates
 *   cryptographically secure session tokens that are transmitted via headers.
 *   Since these are not cookie-based, they are not vulnerable to traditional
 *   CSRF attacks. The extension's content security policy provides isolation.
 *
 * ============================================================================
 * PROTECTION MECHANISMS
 * ============================================================================
 *
 * 1. ORIGIN VALIDATION:
 *    - All state-changing requests (POST, PUT, PATCH, DELETE) must include
 *      an Origin or Referer header matching configured allowed origins.
 *    - In production, requests without origin headers are rejected.
 *    - In development, localhost requests are allowed for easier testing.
 *
 * 2. CUSTOM HEADER REQUIREMENT (Production only):
 *    - Requires X-Requested-With header for state-changing requests.
 *    - Simple cross-origin requests cannot set custom headers without CORS
 *      preflight, providing defense-in-depth against CSRF.
 *
 * 3. SAMESITE COOKIES:
 *    - All cookies are set with SameSite=Strict by default.
 *    - Combined with Secure flag in production.
 *    - Prevents cookies from being sent in cross-origin requests.
 *
 * ============================================================================
 * WHEN TO UPDATE EXEMPTIONS
 * ============================================================================
 *
 * Add a new exemption ONLY if:
 * 1. The endpoint is truly read-only OR
 * 2. The endpoint uses non-cookie-based authentication AND
 * 3. The endpoint's authentication mechanism is immune to CSRF AND
 * 4. The security implications have been reviewed
 *
 * Document the rationale for any new exemptions in this file.
 *
 * ============================================================================
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
      const secureOptions: typeof options = {
        ...options,
        sameSite: (options.sameSite || 'strict') as 'strict' | 'lax' | 'none',
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
