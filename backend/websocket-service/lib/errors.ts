/**
 * Custom Error Classes
 * Specialized error types for WebSocket operations
 */

/**
 * Base WebSocket error
 */
export class WebSocketError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'WebSocketError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends WebSocketError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (insufficient permissions)
 */
export class AuthorizationError extends WebSocketError {
  constructor(message: string = 'Insufficient permissions', details?: any) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Session not found error
 */
export class SessionNotFoundError extends WebSocketError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND', 404, { sessionId });
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Session access denied error
 */
export class SessionAccessDeniedError extends WebSocketError {
  constructor(sessionId: string, userId: string) {
    super(
      `Access denied to session: ${sessionId}`,
      'SESSION_ACCESS_DENIED',
      403,
      { sessionId, userId }
    );
    this.name = 'SessionAccessDeniedError';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends WebSocketError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Invalid token error
 */
export class InvalidTokenError extends WebSocketError {
  constructor(message: string = 'Invalid or expired token') {
    super(message, 'INVALID_TOKEN', 401);
    this.name = 'InvalidTokenError';
  }
}

/**
 * Room not found error
 */
export class RoomNotFoundError extends WebSocketError {
  constructor(roomId: string) {
    super(`Room not found: ${roomId}`, 'ROOM_NOT_FOUND', 404, { roomId });
    this.name = 'RoomNotFoundError';
  }
}

/**
 * Message buffer overflow error
 */
export class MessageBufferOverflowError extends WebSocketError {
  constructor(userId: string, currentSize: number, maxSize: number) {
    super(
      `Message buffer overflow for user ${userId}`,
      'BUFFER_OVERFLOW',
      507,
      { userId, currentSize, maxSize }
    );
    this.name = 'MessageBufferOverflowError';
  }
}

/**
 * Connection error
 */
export class ConnectionError extends WebSocketError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', 500, details);
    this.name = 'ConnectionError';
  }
}

/**
 * Redis connection error
 */
export class RedisConnectionError extends WebSocketError {
  constructor(message: string = 'Redis connection failed', details?: any) {
    super(message, 'REDIS_CONNECTION_ERROR', 500, details);
    this.name = 'RedisConnectionError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends WebSocketError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Convert error to client-safe error object
 */
export function toClientError(error: Error): { message: string; code?: string; details?: any } {
  if (error instanceof WebSocketError) {
    return {
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }

  // Don't expose internal error details to clients
  return {
    message: 'An internal error occurred',
    code: 'INTERNAL_ERROR',
  };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof WebSocketError) {
    return [
      'CONNECTION_ERROR',
      'REDIS_CONNECTION_ERROR',
      'RATE_LIMIT_EXCEEDED',
    ].includes(error.code);
  }
  return false;
}
