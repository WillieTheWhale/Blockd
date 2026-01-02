/**
 * Custom Error Classes
 * Blockd Auth Service
 */

export class AuthError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'AUTH_ERROR', details?: any) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AuthError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AuthError {
  constructor(message: string = 'Not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AuthError {
  constructor(message: string = 'Conflict', details?: any) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AuthError {
  public retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number, details?: any) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor(message: string = 'Invalid credentials') {
    super(message, { code: 'INVALID_CREDENTIALS' });
    this.name = 'InvalidCredentialsError';
  }
}

export class EmailNotVerifiedError extends UnauthorizedError {
  constructor(message: string = 'Email not verified') {
    super(message, { code: 'EMAIL_NOT_VERIFIED' });
    this.name = 'EmailNotVerifiedError';
  }
}

export class MFARequiredError extends AuthError {
  public mfaToken?: string;

  constructor(message: string = 'MFA verification required', mfaToken?: string) {
    super(message, 403, 'MFA_REQUIRED', { mfa_token: mfaToken });
    this.name = 'MFARequiredError';
    this.mfaToken = mfaToken;
  }
}

export class InvalidMFACodeError extends UnauthorizedError {
  constructor(message: string = 'Invalid MFA code') {
    super(message, { code: 'INVALID_MFA_CODE' });
    this.name = 'InvalidMFACodeError';
  }
}

export class InvalidTokenError extends UnauthorizedError {
  constructor(message: string = 'Invalid or expired token') {
    super(message, { code: 'INVALID_TOKEN' });
    this.name = 'InvalidTokenError';
  }
}

export class TokenExpiredError extends UnauthorizedError {
  constructor(message: string = 'Token has expired') {
    super(message, { code: 'TOKEN_EXPIRED' });
    this.name = 'TokenExpiredError';
  }
}

export class AccountLockedError extends UnauthorizedError {
  public lockedUntil?: Date;

  constructor(message: string = 'Account is locked', lockedUntil?: Date) {
    super(message, { code: 'ACCOUNT_LOCKED', locked_until: lockedUntil });
    this.name = 'AccountLockedError';
    this.lockedUntil = lockedUntil;
  }
}

export class WeakPasswordError extends ValidationError {
  constructor(message: string = 'Password does not meet requirements', requirements?: string[]) {
    super(message, { code: 'WEAK_PASSWORD', requirements });
    this.name = 'WeakPasswordError';
  }
}

export class EmailAlreadyExistsError extends ConflictError {
  constructor(message: string = 'Email already registered') {
    super(message, { code: 'EMAIL_EXISTS' });
    this.name = 'EmailAlreadyExistsError';
  }
}

/**
 * Error handler helper for Fastify routes
 */
export function handleError(error: unknown): {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: any;
} {
  if (error instanceof AuthError) {
    return {
      statusCode: error.statusCode,
      error: error.name,
      message: error.message,
      code: error.code,
      details: error.details
    };
  }

  // Handle Prisma errors
  if (error instanceof Error && error.constructor.name.startsWith('Prisma')) {
    return {
      statusCode: 500,
      error: 'DatabaseError',
      message: 'A database error occurred',
      code: 'DATABASE_ERROR'
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      statusCode: 500,
      error: 'InternalServerError',
      message: error.message,
      code: 'INTERNAL_ERROR'
    };
  }

  // Unknown error
  return {
    statusCode: 500,
    error: 'UnknownError',
    message: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR'
  };
}
