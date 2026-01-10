/**
 * Global Error Handler Middleware
 * Enhanced with distributed tracing, comprehensive logging context,
 * error fingerprinting, and sensitive data sanitization
 */

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { isAppError, AppError, InternalServerError } from '../lib/errors';
import { sendError, sendErrorWithTrace } from '../lib/response';
import { addSpanEvent, setSpanAttribute } from '../lib/tracing';
import config from '../src/config';

// Service metadata for error context
const SERVICE_NAME = 'api-gateway';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const HOSTNAME = process.env.HOSTNAME || require('os').hostname();

// Sensitive fields to sanitize from request body/headers
const SENSITIVE_FIELDS = new Set([
  'password',
  'password_confirmation',
  'passwordConfirmation',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'apiKey',
  'api_key',
  'secret',
  'secretKey',
  'secret_key',
  'authorization',
  'cookie',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'ssn',
  'mfaCode',
  'mfa_code',
  'totpCode',
  'totp_code',
  'privateKey',
  'private_key',
]);

// Error severity levels
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error context for logging and tracing
 */
interface ErrorContext {
  // Request info
  url: string;
  method: string;
  route?: string;
  ip: string;
  userAgent?: string;
  origin?: string;
  contentType?: string;

  // User context
  userId?: string;
  organizationId?: string;

  // Trace context
  requestId?: string;
  traceId?: string;
  spanId?: string;
  correlationId?: string;

  // Error info
  errorType: string;
  errorCode?: string;
  statusCode: number;
  errorSeverity: ErrorSeverity;
  errorFingerprint: string;

  // Timing
  requestDurationMs?: number;

  // Service info
  service: string;
  version: string;
  hostname: string;
}

/**
 * Sanitize an object by removing sensitive fields
 */
function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = Array.isArray(value)
        ? value.map((v) => (typeof v === 'object' ? sanitizeObject(v) : v))
        : sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Generate a fingerprint for error deduplication
 * Combines error type, code, route, and message pattern
 */
function generateErrorFingerprint(
  error: Error,
  route: string | undefined,
  statusCode: number
): string {
  // Normalize message by removing dynamic parts (UUIDs, numbers, etc.)
  const normalizedMessage = error.message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}')
    .replace(/\d+/g, '{number}')
    .replace(/"[^"]+"/g, '"{string}"')
    .substring(0, 200);

  const fingerprintData = [
    error.name || 'Error',
    isAppError(error) ? error.code : statusCode.toString(),
    route || 'unknown',
    normalizedMessage,
  ].join('|');

  return createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);
}

/**
 * Determine error severity based on status code and error type
 */
function determineErrorSeverity(statusCode: number, error: Error): ErrorSeverity {
  // Critical: Security and auth failures that might indicate attack
  if (statusCode === 401 || statusCode === 403) {
    // Check if it's repeated auth failures (potential brute force)
    return 'high';
  }

  // Critical: Server errors
  if (statusCode >= 500) {
    // Database and critical service errors
    if (
      error.message.toLowerCase().includes('database') ||
      error.message.toLowerCase().includes('connection') ||
      error.message.toLowerCase().includes('timeout')
    ) {
      return 'critical';
    }
    return 'high';
  }

  // Medium: Client errors that might indicate issues
  if (statusCode === 429) {
    return 'medium'; // Rate limiting
  }

  if (statusCode >= 400 && statusCode < 500) {
    return 'low';
  }

  return 'low';
}

/**
 * Extract error details from different error types
 * Categorizes errors by source for better monitoring and alerting
 */
function extractErrorDetails(error: Error): Record<string, any> {
  const details: Record<string, any> = {};
  const errorName = error.name || '';
  const errorMessage = error.message || '';

  // Prisma/Database errors - codes starting with 'P'
  if ('code' in error && typeof (error as any).code === 'string') {
    const code = (error as any).code;
    if (code.startsWith('P')) {
      details.prismaCode = code;
      details.errorSource = 'database';
      details.errorCategory = 'prisma';
      if ((error as any).meta) {
        details.prismaMeta = sanitizeObject((error as any).meta);
      }
    }
  }

  // JWT/Authentication errors
  if (
    errorName === 'JsonWebTokenError' ||
    errorName === 'TokenExpiredError' ||
    errorName === 'NotBeforeError' ||
    errorMessage.includes('jwt') ||
    errorMessage.includes('token')
  ) {
    details.errorSource = details.errorSource || 'authentication';
    details.errorCategory = 'jwt';
  }

  // Crypto errors
  if (
    errorName === 'Error' && (
      errorMessage.includes('crypto') ||
      errorMessage.includes('cipher') ||
      errorMessage.includes('decrypt') ||
      errorMessage.includes('encrypt')
    )
  ) {
    details.errorSource = details.errorSource || 'crypto';
    details.errorCategory = 'encryption';
  }

  // Network/HTTP errors
  if ('cause' in error && error.cause) {
    const cause = error.cause as any;
    if (cause.code) {
      details.causeCode = cause.code;
    }
    if (cause.syscall) {
      details.syscall = cause.syscall;
      details.errorSource = 'network';
    }
  }

  // Timeout errors (various sources)
  if (
    errorMessage.toLowerCase().includes('timeout') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('ESOCKETTIMEDOUT') ||
    errorName === 'TimeoutError'
  ) {
    details.errorSource = details.errorSource || 'timeout';
    details.errorCategory = 'timeout';
  }

  // Service-to-service HTTP errors (undici/fetch errors)
  if (
    errorName === 'UndiciError' ||
    errorName === 'FetchError' ||
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('request to') ||
    ('statusCode' in error && typeof (error as any).statusCode === 'number')
  ) {
    details.errorSource = details.errorSource || 'upstream_service';
    details.errorCategory = 'http_client';
    if ((error as any).statusCode) {
      details.upstreamStatusCode = (error as any).statusCode;
    }
  }

  // Redis errors
  if (
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('Redis') ||
    errorMessage.includes('redis') ||
    errorName.includes('Redis')
  ) {
    details.errorSource = details.errorSource || 'cache';
    details.errorCategory = 'redis';
  }

  // Validation errors (Zod, etc.)
  if (
    errorName === 'ZodError' ||
    'issues' in error ||
    errorMessage.includes('validation')
  ) {
    details.errorSource = details.errorSource || 'validation';
    details.errorCategory = 'input_validation';
  }

  return details;
}

/**
 * Get request timing if available
 */
function getRequestDuration(request: FastifyRequest): number | undefined {
  // Fastify stores request start time
  if ((request as any).startTime) {
    return Date.now() - (request as any).startTime;
  }
  // Check for custom start time from metrics plugin
  if ((request as any).metricsStartTime) {
    const startTime = (request as any).metricsStartTime as bigint;
    return Number(process.hrtime.bigint() - startTime) / 1_000_000;
  }
  return undefined;
}

/**
 * Build error context from request
 */
function buildErrorContext(
  request: FastifyRequest,
  error: Error,
  statusCode: number
): ErrorContext {
  const route = request.routeOptions?.url || (request as any).routerPath;
  const errorCode = isAppError(error) ? error.code : undefined;

  return {
    // Request info
    url: request.url,
    method: request.method,
    route,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    origin: request.headers.origin as string | undefined,
    contentType: request.headers['content-type'],

    // User context
    userId: request.user?.userId,
    organizationId: (request.user as any)?.organizationId,

    // Trace context
    requestId: request.id,
    traceId: request.traceContext?.traceId,
    spanId: request.traceContext?.spanId,
    correlationId: request.traceContext?.correlationId,

    // Error info
    errorType: error.name || 'Error',
    errorCode,
    statusCode,
    errorSeverity: determineErrorSeverity(statusCode, error),
    errorFingerprint: generateErrorFingerprint(error, route, statusCode),

    // Timing
    requestDurationMs: getRequestDuration(request),

    // Service info
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    hostname: HOSTNAME,
  };
}

/**
 * Add error information to the current span
 */
function recordErrorInSpan(
  request: FastifyRequest,
  error: Error,
  statusCode: number,
  errorCode: string
): void {
  if (!request.span) return;

  // Set error attributes on span
  setSpanAttribute(request.span, 'error', true);
  setSpanAttribute(request.span, 'error.type', error.name || 'Error');
  setSpanAttribute(request.span, 'error.code', errorCode);
  setSpanAttribute(request.span, 'http.status_code', statusCode);

  // Add error event with details
  addSpanEvent(request.span, 'error', {
    'error.type': error.name || 'Error',
    'error.message': error.message,
    'error.code': errorCode,
  });

  // Include stack trace in non-production
  if (config.server.isDevelopment && error.stack) {
    setSpanAttribute(request.span, 'error.stack', error.stack.substring(0, 500));
  }
}

/**
 * Build sanitized request info for logging
 */
function buildRequestInfo(request: FastifyRequest): Record<string, any> {
  const info: Record<string, any> = {
    url: request.url,
    method: request.method,
    route: request.routeOptions?.url || (request as any).routerPath,
    ip: request.ip,
    requestId: request.id,
  };

  // Add query params if present
  if (request.query && Object.keys(request.query as object).length > 0) {
    info.query = sanitizeObject(request.query as Record<string, any>);
  }

  // Add route params if present
  if (request.params && Object.keys(request.params as object).length > 0) {
    info.params = sanitizeObject(request.params as Record<string, any>);
  }

  // Add sanitized body for non-GET requests (truncated)
  if (request.body && request.method !== 'GET') {
    const sanitizedBody = sanitizeObject(request.body as Record<string, any>);
    const bodyStr = JSON.stringify(sanitizedBody);
    info.body = bodyStr.length > 1000 ? bodyStr.substring(0, 1000) + '...' : sanitizedBody;
  }

  // Add useful headers
  info.headers = {
    userAgent: request.headers['user-agent'],
    origin: request.headers.origin,
    contentType: request.headers['content-type'],
    contentLength: request.headers['content-length'],
  };

  return info;
}

/**
 * Global error handler
 */
export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  // Determine status code
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';

  if (isAppError(error)) {
    statusCode = error.statusCode;
    errorCode = error.code || error.name;
  } else if ('statusCode' in error && error.statusCode) {
    statusCode = error.statusCode;
    errorCode = 'FASTIFY_ERROR';
  } else if ('validation' in error && (error as any).validation) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  }

  // Build error context for logging
  const errorContext = buildErrorContext(request, error, statusCode);

  // Extract additional error details (Prisma, network, etc.)
  const errorDetails = extractErrorDetails(error);

  // Record error in span for tracing
  recordErrorInSpan(request, error, statusCode, errorCode);

  // Build comprehensive log payload
  const logPayload: Record<string, any> = {
    // Error details
    err: {
      message: error.message,
      name: error.name,
      code: errorCode,
      fingerprint: errorContext.errorFingerprint,
      severity: errorContext.errorSeverity,
      ...errorDetails,
      stack: config.server.isDevelopment ? error.stack : undefined,
    },

    // Trace context
    trace: {
      traceId: errorContext.traceId,
      spanId: errorContext.spanId,
      correlationId: errorContext.correlationId,
    },

    // Request details
    request: buildRequestInfo(request),

    // User context
    user: errorContext.userId
      ? {
          userId: errorContext.userId,
          organizationId: errorContext.organizationId,
        }
      : undefined,

    // Response
    response: {
      statusCode,
      durationMs: errorContext.requestDurationMs,
    },

    // Service metadata
    service: {
      name: errorContext.service,
      version: errorContext.version,
      hostname: errorContext.hostname,
    },
  };

  // Choose log level based on severity
  const logMessage = `[${errorContext.errorFingerprint}] ${error.message}`;

  switch (errorContext.errorSeverity) {
    case 'critical':
      request.log.fatal(logPayload, logMessage);
      break;
    case 'high':
      request.log.error(logPayload, logMessage);
      break;
    case 'medium':
      request.log.warn(logPayload, logMessage);
      break;
    case 'low':
    default:
      // For 4xx errors, use warn level to reduce noise
      if (statusCode >= 400 && statusCode < 500) {
        request.log.warn(logPayload, logMessage);
      } else {
        request.log.error(logPayload, logMessage);
      }
      break;
  }

  // Get trace info for response
  const traceInfo = request.traceContext
    ? {
        traceId: request.traceContext.traceId,
        correlationId: request.traceContext.correlationId,
      }
    : undefined;

  // Handle AppError (custom errors)
  if (isAppError(error)) {
    return sendErrorWithTrace(
      reply,
      error.statusCode,
      error.message,
      error.code || error.name,
      traceInfo,
      config.server.isDevelopment ? error.details : undefined
    );
  }

  // Handle Fastify validation errors
  if ('validation' in error && (error as any).validation) {
    return sendErrorWithTrace(
      reply,
      400,
      'Request validation failed',
      'VALIDATION_ERROR',
      traceInfo,
      {
        validation: (error as any).validation,
        validationContext: (error as any).validationContext,
      }
    );
  }

  // Handle Fastify errors
  if ('statusCode' in error && error.statusCode) {
    return sendErrorWithTrace(
      reply,
      error.statusCode,
      error.message,
      'FASTIFY_ERROR',
      traceInfo,
      config.server.isDevelopment ? { stack: error.stack } : undefined
    );
  }

  // Handle unknown errors
  const internalError = new InternalServerError(
    config.server.isProduction
      ? 'An unexpected error occurred'
      : error.message
  );

  return sendErrorWithTrace(
    reply,
    internalError.statusCode,
    internalError.message,
    internalError.code,
    traceInfo,
    config.server.isDevelopment
      ? { stack: error.stack, originalError: error.message }
      : undefined
  );
}

/**
 * Not found handler
 */
export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  return sendError(
    reply,
    404,
    `Route ${request.method} ${request.url} not found`,
    'NOT_FOUND'
  );
}
