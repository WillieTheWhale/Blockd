/**
 * Audit Logging Middleware
 * Provides comprehensive audit trail for security-sensitive operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../lib/prisma';

export enum AuditAction {
  // Authentication
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',
  MFA_VERIFICATION_SUCCESS = 'MFA_VERIFICATION_SUCCESS',
  MFA_VERIFICATION_FAILURE = 'MFA_VERIFICATION_FAILURE',

  // Authorization
  ACCESS_DENIED = 'ACCESS_DENIED',
  ROLE_CHANGED = 'ROLE_CHANGED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',

  // Resource Operations
  RESOURCE_CREATED = 'RESOURCE_CREATED',
  RESOURCE_UPDATED = 'RESOURCE_UPDATED',
  RESOURCE_DELETED = 'RESOURCE_DELETED',
  RESOURCE_ACCESSED = 'RESOURCE_ACCESSED',

  // Session Operations
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_STARTED = 'SESSION_STARTED',
  SESSION_ENDED = 'SESSION_ENDED',
  SESSION_CANCELLED = 'SESSION_CANCELLED',

  // Security Events
  SECURITY_EVENT_DETECTED = 'SECURITY_EVENT_DETECTED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Data Operations
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_IMPORT = 'DATA_IMPORT',
  BULK_OPERATION = 'BULK_OPERATION',
}

export interface AuditLogEntry {
  action: AuditAction | string;
  resourceType: string;
  resourceId?: string;
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  result?: 'success' | 'failure' | 'partial';
  errorMessage?: string;
}

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        userId: entry.userId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: {
          ...entry.metadata,
          result: entry.result,
          errorMessage: entry.errorMessage,
          organizationId: entry.organizationId,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    // Log to console as fallback - audit logging should never crash the app
    console.error('[AUDIT_LOG_ERROR]', {
      error: error instanceof Error ? error.message : 'Unknown error',
      entry,
    });
  }
}

/**
 * Log an audit event asynchronously (fire-and-forget)
 * Use this for non-critical audit events to avoid blocking the request
 */
export function logAuditEventAsync(entry: AuditLogEntry): void {
  setImmediate(() => {
    logAuditEvent(entry).catch((error) => {
      console.error('[AUDIT_LOG_ASYNC_ERROR]', error);
    });
  });
}

/**
 * Extract audit context from request
 */
export function getAuditContext(request: FastifyRequest): Partial<AuditLogEntry> {
  return {
    userId: request.user?.userId,
    organizationId: request.user?.organizationId,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

/**
 * Audit logging middleware for specific route patterns
 */
export function createAuditMiddleware(options: {
  action: AuditAction | string;
  resourceType: string;
  getResourceId?: (request: FastifyRequest) => string | undefined;
  getMetadata?: (request: FastifyRequest) => Record<string, unknown>;
  logOnSuccess?: boolean;
  logOnFailure?: boolean;
}) {
  const {
    action,
    resourceType,
    getResourceId,
    getMetadata,
    logOnSuccess = true,
    logOnFailure = true,
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Store audit context on request for post-response logging
    const startTime = Date.now();

    // Store audit info on request for later logging
    (request as any).__auditContext = {
      action,
      resourceType,
      getResourceId,
      getMetadata,
      logOnSuccess,
      logOnFailure,
      startTime,
    };

    // Use reply.then() to log after response is sent
    reply.then(
      () => {
        const statusCode = reply.statusCode;
        const isSuccess = statusCode >= 200 && statusCode < 400;
        const shouldLog = (isSuccess && logOnSuccess) || (!isSuccess && logOnFailure);

        if (shouldLog) {
          const entry: AuditLogEntry = {
            action,
            resourceType,
            resourceId: getResourceId?.(request),
            ...getAuditContext(request),
            metadata: {
              ...getMetadata?.(request),
              httpMethod: request.method,
              httpPath: request.url,
              statusCode,
              durationMs: Date.now() - startTime,
            },
            result: isSuccess ? 'success' : 'failure',
          };

          logAuditEventAsync(entry);
        }
      },
      (err) => {
        // Log failed requests if configured
        if (logOnFailure) {
          const entry: AuditLogEntry = {
            action,
            resourceType,
            resourceId: getResourceId?.(request),
            ...getAuditContext(request),
            metadata: {
              ...getMetadata?.(request),
              httpMethod: request.method,
              httpPath: request.url,
              error: err?.message,
              durationMs: Date.now() - startTime,
            },
            result: 'failure',
          };

          logAuditEventAsync(entry);
        }
      }
    );
  };
}

/**
 * Pre-configured audit middleware for authentication routes
 */
export const auditLogin = createAuditMiddleware({
  action: AuditAction.LOGIN_SUCCESS,
  resourceType: 'authentication',
  getMetadata: (req) => ({
    email: (req.body as { email?: string })?.email,
  }),
});

export const auditLogout = createAuditMiddleware({
  action: AuditAction.LOGOUT,
  resourceType: 'authentication',
});

export const auditTokenRefresh = createAuditMiddleware({
  action: AuditAction.TOKEN_REFRESH,
  resourceType: 'authentication',
});

export const auditMfaSetup = createAuditMiddleware({
  action: AuditAction.MFA_ENABLED,
  resourceType: 'mfa',
  getMetadata: (req) => ({
    enabled: (req.body as { enabled?: boolean })?.enabled,
  }),
});

/**
 * Pre-configured audit middleware for session operations
 */
export const auditSessionCreated = createAuditMiddleware({
  action: AuditAction.SESSION_CREATED,
  resourceType: 'interview_session',
});

export const auditSessionStarted = createAuditMiddleware({
  action: AuditAction.SESSION_STARTED,
  resourceType: 'interview_session',
  getResourceId: (req) => (req.params as { sessionId?: string })?.sessionId,
});

export const auditSessionEnded = createAuditMiddleware({
  action: AuditAction.SESSION_ENDED,
  resourceType: 'interview_session',
  getResourceId: (req) => (req.params as { sessionId?: string })?.sessionId,
});

/**
 * Pre-configured audit middleware for security events
 */
export const auditSecurityEvent = createAuditMiddleware({
  action: AuditAction.SECURITY_EVENT_DETECTED,
  resourceType: 'security_event',
  getMetadata: (req) => ({
    eventType: (req.body as { eventType?: string })?.eventType,
    severity: (req.body as { severity?: string })?.severity,
  }),
});

/**
 * Audit decorator for controller methods
 * Use with: @Audit({ action: AuditAction.RESOURCE_CREATED, resourceType: 'user' })
 */
export function createAuditDecorator(options: {
  action: AuditAction | string;
  resourceType: string;
  getResourceId?: (result: unknown) => string | undefined;
}) {
  return function auditDecorator<T extends (...args: unknown[]) => Promise<unknown>>(
    target: T,
    _context: ClassMethodDecoratorContext
  ): T {
    return async function (this: unknown, ...args: unknown[]) {
      const request = args[0] as FastifyRequest;
      const startTime = Date.now();

      try {
        const result = await target.apply(this, args);

        logAuditEventAsync({
          action: options.action,
          resourceType: options.resourceType,
          resourceId: options.getResourceId?.(result),
          ...getAuditContext(request),
          metadata: {
            durationMs: Date.now() - startTime,
          },
          result: 'success',
        });

        return result;
      } catch (error) {
        logAuditEventAsync({
          action: options.action,
          resourceType: options.resourceType,
          ...getAuditContext(request),
          metadata: {
            durationMs: Date.now() - startTime,
          },
          result: 'failure',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    } as T;
  };
}

/**
 * Audit helper for manual logging in route handlers
 */
export class AuditLogger {
  private request: FastifyRequest;
  private context: Partial<AuditLogEntry>;

  constructor(request: FastifyRequest) {
    this.request = request;
    this.context = getAuditContext(request);
  }

  log(entry: Omit<AuditLogEntry, 'userId' | 'organizationId' | 'ipAddress' | 'userAgent'>): void {
    logAuditEventAsync({
      ...this.context,
      ...entry,
    });
  }

  loginSuccess(email: string): void {
    this.log({
      action: AuditAction.LOGIN_SUCCESS,
      resourceType: 'authentication',
      metadata: { email },
      result: 'success',
    });
  }

  loginFailure(email: string, reason: string): void {
    this.log({
      action: AuditAction.LOGIN_FAILURE,
      resourceType: 'authentication',
      metadata: { email },
      result: 'failure',
      errorMessage: reason,
    });
  }

  accessDenied(resourceType: string, resourceId?: string, reason?: string): void {
    this.log({
      action: AuditAction.ACCESS_DENIED,
      resourceType,
      resourceId,
      result: 'failure',
      errorMessage: reason,
    });
  }

  resourceCreated(resourceType: string, resourceId: string): void {
    this.log({
      action: AuditAction.RESOURCE_CREATED,
      resourceType,
      resourceId,
      result: 'success',
    });
  }

  resourceUpdated(resourceType: string, resourceId: string, changes?: Record<string, unknown>): void {
    this.log({
      action: AuditAction.RESOURCE_UPDATED,
      resourceType,
      resourceId,
      metadata: { changes },
      result: 'success',
    });
  }

  resourceDeleted(resourceType: string, resourceId: string): void {
    this.log({
      action: AuditAction.RESOURCE_DELETED,
      resourceType,
      resourceId,
      result: 'success',
    });
  }

  securityEvent(eventType: string, severity: string, details?: Record<string, unknown>): void {
    this.log({
      action: AuditAction.SECURITY_EVENT_DETECTED,
      resourceType: 'security_event',
      metadata: { eventType, severity, ...details },
    });
  }
}

/**
 * Get an AuditLogger instance for a request
 */
export function getAuditLogger(request: FastifyRequest): AuditLogger {
  return new AuditLogger(request);
}
