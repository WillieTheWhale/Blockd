/**
 * Global Error Handler Middleware
 */

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { isAppError, AppError, InternalServerError } from '../lib/errors.js';
import { sendError } from '../lib/response.js';
import config from '../src/config.js';

/**
 * Global error handler
 */
export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  // Log error with context
  const errorContext = {
    url: request.url,
    method: request.method,
    ip: request.ip,
    userId: request.user?.userId,
    requestId: request.id,
  };

  request.log.error(
    {
      err: error,
      ...errorContext,
    },
    'Request error'
  );

  // Handle AppError (custom errors)
  if (isAppError(error)) {
    return sendError(
      reply,
      error.statusCode,
      error.message,
      error.code || error.name,
      config.server.isDevelopment ? error.details : undefined
    );
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    return sendError(
      reply,
      400,
      'Request validation failed',
      'VALIDATION_ERROR',
      {
        validation: error.validation,
        validationContext: (error as any).validationContext,
      }
    );
  }

  // Handle Fastify errors
  if ('statusCode' in error && error.statusCode) {
    return sendError(
      reply,
      error.statusCode,
      error.message,
      'FASTIFY_ERROR',
      config.server.isDevelopment ? { stack: error.stack } : undefined
    );
  }

  // Handle unknown errors
  const internalError = new InternalServerError(
    config.server.isProduction
      ? 'An unexpected error occurred'
      : error.message
  );

  return sendError(
    reply,
    internalError.statusCode,
    internalError.message,
    internalError.code,
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
