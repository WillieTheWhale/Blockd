/**
 * Custom Error Classes for Blockd API Gateway
 */

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code || this.name,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
      },
    };
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: any) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: any) {
    super(401, message, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: any) {
    super(403, message, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: any) {
    super(404, message, 'NOT_FOUND', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: any) {
    super(409, message, 'CONFLICT', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: any) {
    super(422, message, 'VALIDATION_ERROR', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', details?: any) {
    super(429, message, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: any) {
    super(500, message, 'INTERNAL_SERVER_ERROR', details);
  }
}

export class BadGatewayError extends AppError {
  constructor(message = 'Bad gateway', details?: any) {
    super(502, message, 'BAD_GATEWAY', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details?: any) {
    super(503, message, 'SERVICE_UNAVAILABLE', details);
  }
}

export class GatewayTimeoutError extends AppError {
  constructor(message = 'Gateway timeout', details?: any) {
    super(504, message, 'GATEWAY_TIMEOUT', details);
  }
}

/**
 * Check if error is an instance of AppError
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}
