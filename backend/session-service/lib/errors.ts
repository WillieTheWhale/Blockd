// Custom error classes for session service

export class SessionServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'SESSION_ERROR'
  ) {
    super(message);
    this.name = 'SessionServiceError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class SessionNotFoundError extends SessionServiceError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 404, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class InvalidSessionStateError extends SessionServiceError {
  constructor(currentState: string, attemptedAction: string) {
    super(
      `Cannot ${attemptedAction} session in state: ${currentState}`,
      400,
      'INVALID_SESSION_STATE'
    );
    this.name = 'InvalidSessionStateError';
  }
}

export class SessionTokenInvalidError extends SessionServiceError {
  constructor() {
    super('Invalid or expired session token', 401, 'INVALID_SESSION_TOKEN');
    this.name = 'SessionTokenInvalidError';
  }
}

export class UnauthorizedAccessError extends SessionServiceError {
  constructor(resource: string) {
    super(`Unauthorized access to ${resource}`, 403, 'UNAUTHORIZED_ACCESS');
    this.name = 'UnauthorizedAccessError';
  }
}

export class QuestionNotFoundError extends SessionServiceError {
  constructor(questionId: string) {
    super(`Question not found: ${questionId}`, 404, 'QUESTION_NOT_FOUND');
    this.name = 'QuestionNotFoundError';
  }
}

export class DuplicateAnswerError extends SessionServiceError {
  constructor(questionId: string) {
    super(
      `Answer already submitted for question: ${questionId}`,
      409,
      'DUPLICATE_ANSWER'
    );
    this.name = 'DuplicateAnswerError';
  }
}

export class SessionLimitExceededError extends SessionServiceError {
  constructor(limit: number) {
    super(
      `Maximum concurrent session limit exceeded: ${limit}`,
      429,
      'SESSION_LIMIT_EXCEEDED'
    );
    this.name = 'SessionLimitExceededError';
  }
}

export class ValidationError extends SessionServiceError {
  constructor(message: string, public details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class CacheError extends SessionServiceError {
  constructor(operation: string, details?: string) {
    super(
      `Cache operation failed: ${operation}${details ? ` - ${details}` : ''}`,
      500,
      'CACHE_ERROR'
    );
    this.name = 'CacheError';
  }
}

export class MessageQueueError extends SessionServiceError {
  constructor(operation: string, details?: string) {
    super(
      `Message queue operation failed: ${operation}${details ? ` - ${details}` : ''}`,
      500,
      'MESSAGE_QUEUE_ERROR'
    );
    this.name = 'MessageQueueError';
  }
}

export class ReportGenerationError extends SessionServiceError {
  constructor(reason: string) {
    super(`Report generation failed: ${reason}`, 500, 'REPORT_GENERATION_ERROR');
    this.name = 'ReportGenerationError';
  }
}

export class WebSocketError extends SessionServiceError {
  constructor(message: string) {
    super(message, 500, 'WEBSOCKET_ERROR');
    this.name = 'WebSocketError';
  }
}

// Error handler for Fastify
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  timestamp: string;
}

export function formatErrorResponse(error: Error): ErrorResponse {
  if (error instanceof SessionServiceError) {
    return {
      statusCode: error.statusCode,
      error: error.name,
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
    };
  }

  // Unknown errors
  return {
    statusCode: 500,
    error: 'InternalServerError',
    message: error.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  };
}
