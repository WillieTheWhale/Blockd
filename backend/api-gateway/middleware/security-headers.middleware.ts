/**
 * Security Headers Middleware
 * Implements comprehensive security headers for API responses
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import config from '../src/config';

export interface SecurityHeadersOptions {
  /**
   * Enable HTTP Strict Transport Security
   * Default: true in production
   */
  hsts?: boolean;

  /**
   * HSTS max-age in seconds
   * Default: 1 year (31536000)
   */
  hstsMaxAge?: number;

  /**
   * Include subdomains in HSTS
   * Default: true
   */
  hstsIncludeSubDomains?: boolean;

  /**
   * Add preload directive to HSTS
   * Default: false (requires submission to browsers)
   */
  hstsPreload?: boolean;

  /**
   * Enable Content-Security-Policy
   * Default: true
   */
  contentSecurityPolicy?: boolean;

  /**
   * CSP directives override
   */
  cspDirectives?: Record<string, string[]>;

  /**
   * Enable X-Content-Type-Options: nosniff
   * Default: true
   */
  noSniff?: boolean;

  /**
   * Enable X-Frame-Options
   * Default: 'DENY'
   */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | false;

  /**
   * Enable X-XSS-Protection
   * Default: true
   */
  xssProtection?: boolean;

  /**
   * Enable Referrer-Policy
   * Default: 'strict-origin-when-cross-origin'
   */
  referrerPolicy?: string | false;

  /**
   * Enable Permissions-Policy
   * Default: true
   */
  permissionsPolicy?: boolean;

  /**
   * Permissions-Policy directives
   */
  permissionsPolicyDirectives?: Record<string, string[]>;

  /**
   * Remove X-Powered-By header
   * Default: true
   */
  hidePoweredBy?: boolean;

  /**
   * Enable Cross-Origin-Embedder-Policy
   * Default: false (can break cross-origin resources)
   */
  crossOriginEmbedderPolicy?: boolean;

  /**
   * Enable Cross-Origin-Opener-Policy
   * Default: 'same-origin'
   */
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false;

  /**
   * Enable Cross-Origin-Resource-Policy
   * Default: 'same-origin'
   */
  crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin' | false;
}

const defaultOptions: SecurityHeadersOptions = {
  hsts: true,
  hstsMaxAge: 31536000, // 1 year
  hstsIncludeSubDomains: true,
  hstsPreload: false,
  contentSecurityPolicy: true,
  noSniff: true,
  frameOptions: 'DENY',
  xssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: true,
  hidePoweredBy: true,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
};

const defaultCspDirectives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};

const defaultPermissionsPolicyDirectives: Record<string, string[]> = {
  accelerometer: [],
  'ambient-light-sensor': [],
  autoplay: [],
  battery: [],
  camera: ['self'],
  'display-capture': [],
  'document-domain': [],
  'encrypted-media': [],
  fullscreen: ['self'],
  geolocation: [],
  gyroscope: [],
  'layout-animations': ['self'],
  'legacy-image-formats': ['self'],
  magnetometer: [],
  microphone: ['self'],
  midi: [],
  'oversized-images': ['self'],
  payment: [],
  'picture-in-picture': ['self'],
  'publickey-credentials-get': [],
  'sync-xhr': [],
  usb: [],
  'wake-lock': [],
  'xr-spatial-tracking': [],
};

/**
 * Build Content-Security-Policy header value
 */
function buildCspHeader(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) {
        return key;
      }
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Build Permissions-Policy header value
 */
function buildPermissionsPolicyHeader(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) {
        return `${key}=()`;
      }
      return `${key}=(${values.join(' ')})`;
    })
    .join(', ');
}

/**
 * Security headers hook
 */
function securityHeadersHook(
  options: SecurityHeadersOptions
): (request: FastifyRequest, reply: FastifyReply, done: () => void) => void {
  const opts = { ...defaultOptions, ...options };
  const isProduction = config.server.isProduction;

  // Pre-compute static headers
  const staticHeaders: Record<string, string> = {};

  // X-Content-Type-Options
  if (opts.noSniff) {
    staticHeaders['X-Content-Type-Options'] = 'nosniff';
  }

  // X-Frame-Options
  if (opts.frameOptions) {
    staticHeaders['X-Frame-Options'] = opts.frameOptions;
  }

  // X-XSS-Protection (legacy, but still useful)
  if (opts.xssProtection) {
    staticHeaders['X-XSS-Protection'] = '1; mode=block';
  }

  // Referrer-Policy
  if (opts.referrerPolicy) {
    staticHeaders['Referrer-Policy'] = opts.referrerPolicy;
  }

  // HSTS (only in production or if forced)
  if (opts.hsts && isProduction) {
    let hstsValue = `max-age=${opts.hstsMaxAge}`;
    if (opts.hstsIncludeSubDomains) {
      hstsValue += '; includeSubDomains';
    }
    if (opts.hstsPreload) {
      hstsValue += '; preload';
    }
    staticHeaders['Strict-Transport-Security'] = hstsValue;
  }

  // Content-Security-Policy
  if (opts.contentSecurityPolicy) {
    const directives = { ...defaultCspDirectives, ...opts.cspDirectives };
    staticHeaders['Content-Security-Policy'] = buildCspHeader(directives);
  }

  // Permissions-Policy
  if (opts.permissionsPolicy) {
    const directives = { ...defaultPermissionsPolicyDirectives, ...opts.permissionsPolicyDirectives };
    staticHeaders['Permissions-Policy'] = buildPermissionsPolicyHeader(directives);
  }

  // Cross-Origin-Embedder-Policy
  if (opts.crossOriginEmbedderPolicy) {
    staticHeaders['Cross-Origin-Embedder-Policy'] = 'require-corp';
  }

  // Cross-Origin-Opener-Policy
  if (opts.crossOriginOpenerPolicy) {
    staticHeaders['Cross-Origin-Opener-Policy'] = opts.crossOriginOpenerPolicy;
  }

  // Cross-Origin-Resource-Policy
  if (opts.crossOriginResourcePolicy) {
    staticHeaders['Cross-Origin-Resource-Policy'] = opts.crossOriginResourcePolicy;
  }

  return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Remove X-Powered-By if configured
    if (opts.hidePoweredBy) {
      reply.removeHeader('X-Powered-By');
    }

    // Set all static headers
    for (const [key, value] of Object.entries(staticHeaders)) {
      reply.header(key, value);
    }

    // Add request ID if available (for correlation)
    const requestId = request.id || request.headers['x-request-id'];
    if (requestId) {
      reply.header('X-Request-ID', requestId);
    }

    // Add cache control for API responses (no caching by default)
    if (!reply.hasHeader('Cache-Control')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }

    done();
  };
}

/**
 * Security headers plugin for Fastify
 */
async function securityHeadersPlugin(
  fastify: FastifyInstance,
  options: SecurityHeadersOptions
): Promise<void> {
  fastify.addHook('onRequest', securityHeadersHook(options));
}

export const securityHeaders = fp(securityHeadersPlugin, {
  name: 'security-headers',
  fastify: '5.x',
});

/**
 * Get security headers options for API routes
 */
export function getApiSecurityHeaders(): SecurityHeadersOptions {
  return {
    ...defaultOptions,
    // APIs typically don't need CSP since they return JSON
    contentSecurityPolicy: false,
    // APIs should be embeddable for legitimate use cases
    frameOptions: false,
    // Allow cross-origin for API
    crossOriginResourcePolicy: 'cross-origin',
  };
}

/**
 * Get security headers options for HTML/web routes
 */
export function getWebSecurityHeaders(customCsp?: Record<string, string[]>): SecurityHeadersOptions {
  return {
    ...defaultOptions,
    cspDirectives: customCsp,
  };
}

/**
 * Create CSP directives for the application
 */
export function createCspDirectives(options: {
  allowInlineStyles?: boolean;
  allowInlineScripts?: boolean;
  allowEval?: boolean;
  scriptSources?: string[];
  styleSources?: string[];
  imageSources?: string[];
  fontSources?: string[];
  connectSources?: string[];
  frameSources?: string[];
  mediaSources?: string[];
  workerSources?: string[];
}): Record<string, string[]> {
  const directives = { ...defaultCspDirectives };

  if (options.scriptSources?.length) {
    directives['script-src'] = ["'self'", ...options.scriptSources];
  }
  if (options.allowInlineScripts) {
    directives['script-src'].push("'unsafe-inline'");
  }
  if (options.allowEval) {
    directives['script-src'].push("'unsafe-eval'");
  }

  if (options.styleSources?.length) {
    directives['style-src'] = ["'self'", ...options.styleSources];
  }
  if (options.allowInlineStyles) {
    if (!directives['style-src'].includes("'unsafe-inline'")) {
      directives['style-src'].push("'unsafe-inline'");
    }
  }

  if (options.imageSources?.length) {
    directives['img-src'] = ["'self'", 'data:', ...options.imageSources];
  }

  if (options.fontSources?.length) {
    directives['font-src'] = ["'self'", ...options.fontSources];
  }

  if (options.connectSources?.length) {
    directives['connect-src'] = ["'self'", ...options.connectSources];
  }

  if (options.frameSources?.length) {
    directives['frame-src'] = options.frameSources;
  }

  if (options.mediaSources?.length) {
    directives['media-src'] = options.mediaSources;
  }

  if (options.workerSources?.length) {
    directives['worker-src'] = options.workerSources;
  }

  return directives;
}

/**
 * Nonce generator for CSP
 */
export function generateCspNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString('base64');
}

export default securityHeaders;
