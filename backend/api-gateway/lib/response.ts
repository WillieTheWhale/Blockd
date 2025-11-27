/**
 * Standardized API Response Utilities
 */

import { FastifyReply } from 'fastify';

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
    [key: string]: any;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export interface PaginatedResponse<T = any> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Send success response
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200,
  meta?: Record<string, any>
): FastifyReply {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: reply.request.id,
      ...meta,
    },
  };

  return reply.code(statusCode).send(response);
}

/**
 * Send error response
 */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  code: string,
  details?: any
): FastifyReply {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      statusCode,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: reply.request.id,
    },
  };

  return reply.code(statusCode).send(response);
}

/**
 * Send paginated response
 */
export function sendPaginated<T>(
  reply: FastifyReply,
  data: T[],
  page: number,
  pageSize: number,
  totalItems: number,
  meta?: Record<string, any>
): FastifyReply {
  const totalPages = Math.ceil(totalItems / pageSize);

  const response: PaginatedResponse<T> = {
    success: true,
    data,
    pagination: {
      page,
      pageSize,
      totalPages,
      totalItems,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: reply.request.id,
      ...meta,
    },
  };

  // Set pagination headers
  reply.header('X-Page', page.toString());
  reply.header('X-Page-Size', pageSize.toString());
  reply.header('X-Total-Pages', totalPages.toString());
  reply.header('X-Total-Count', totalItems.toString());

  return reply.code(200).send(response);
}

/**
 * Send created response (201)
 */
export function sendCreated<T>(
  reply: FastifyReply,
  data: T,
  location?: string
): FastifyReply {
  if (location) {
    reply.header('Location', location);
  }
  return sendSuccess(reply, data, 201);
}

/**
 * Send accepted response (202)
 */
export function sendAccepted<T>(
  reply: FastifyReply,
  data: T,
  location?: string
): FastifyReply {
  if (location) {
    reply.header('Location', location);
  }
  return sendSuccess(reply, data, 202);
}

/**
 * Send no content response (204)
 */
export function sendNoContent(reply: FastifyReply): FastifyReply {
  return reply.code(204).send();
}
