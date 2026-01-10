/**
 * Request Validation Middleware
 * Uses Zod schemas for validation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors';

export interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

/**
 * Create validation middleware from Zod schemas
 */
export function validate(options: ValidationOptions) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    try {
      // Validate request body
      if (options.body) {
        request.body = options.body.parse(request.body);
      }

      // Validate query parameters
      if (options.query) {
        request.query = options.query.parse(request.query);
      }

      // Validate route parameters
      if (options.params) {
        request.params = options.params.parse(request.params);
      }

      // Validate headers
      if (options.headers) {
        request.headers = options.headers.parse(request.headers);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        throw new ValidationError('Request validation failed', {
          errors,
          zodError: error.format(),
        });
      }
      throw error;
    }
  };
}

/**
 * Validate request body
 */
export function validateBody(schema: ZodSchema) {
  return validate({ body: schema });
}

/**
 * Validate query parameters
 */
export function validateQuery(schema: ZodSchema) {
  return validate({ query: schema });
}

/**
 * Validate route parameters
 */
export function validateParams(schema: ZodSchema) {
  return validate({ params: schema });
}

/**
 * Validate headers
 */
export function validateHeaders(schema: ZodSchema) {
  return validate({ headers: schema });
}
