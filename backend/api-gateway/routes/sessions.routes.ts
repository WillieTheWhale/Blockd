/**
 * Session Management Routes
 * Proxies requests to session-service with state machine enforcement
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware';
import { sessionStateMiddleware } from '../middleware/session-state.middleware';
import {
  createSessionRequestSchema,
  startSessionRequestSchema,
  endSessionRequestSchema,
  listSessionsQuerySchema,
  sessionEventsQuerySchema,
  CreateSessionRequest,
  StartSessionRequest,
  EndSessionRequest,
  ListSessionsQuery,
  SessionEventsQuery,
} from '../schemas/session.schema';
import { idParamSchema, IdParam } from '../schemas/common.schema';
import { sendSuccess, sendCreated, sendPaginated } from '../lib/response';
import { NotFoundError, BadRequestError, ForbiddenError, InternalServerError } from '../lib/errors';
import {
  sessionServiceClient,
  ServiceClientError,
  extractAuthToken,
  ServiceTypes,
} from '../lib/service-client';

/**
 * Helper to forward authentication context to session-service
 */
function getForwardHeaders(request: FastifyRequest): {
  authToken?: string;
  userId?: string;
  organizationId?: string;
} {
  return {
    authToken: extractAuthToken(request.headers.authorization),
    userId: request.user?.userId,
    organizationId: request.user?.organizationId,
  };
}

/**
 * Convert service client errors to appropriate HTTP errors
 */
function handleServiceError(error: unknown): never {
  if (error instanceof ServiceClientError) {
    switch (error.statusCode) {
      case 404:
        throw new NotFoundError(error.message);
      case 400:
        throw new BadRequestError(error.message);
      case 403:
        throw new ForbiddenError(error.message);
      default:
        throw new InternalServerError(error.message);
    }
  }
  throw error;
}

export default async function sessionsRoutes(fastify: FastifyInstance) {
  // Create session
  fastify.post<{ Body: CreateSessionRequest }>('/', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
      validateBody(createSessionRequestSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Create a new interview session',
      description: 'Creates a new interview session',
      body: createSessionRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { intervieweeEmail, intervieweeId, scheduledStart, metadata } = request.body;
      const interviewerId = request.user!.userId;
      const organizationId = request.user!.organizationId;

      if (!organizationId) {
        throw new BadRequestError('User must belong to an organization');
      }

      try {
        const session = await sessionServiceClient.forward<ServiceTypes.Session>(
          'POST',
          '/sessions',
          {
            body: {
              interviewerId,
              intervieweeId,
              intervieweeEmail,
              organizationId,
              scheduledStart,
              metadata,
            },
            ...getForwardHeaders(request),
          }
        );

        return sendCreated(reply, session);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get session by ID
  fastify.get<{ Params: IdParam }>('/:id', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Get session by ID',
      description: 'Retrieves a specific interview session',
      params: idParamSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const session = await sessionServiceClient.forward<ServiceTypes.Session>(
          'GET',
          `/sessions/${id}`,
          {
            ...getForwardHeaders(request),
          }
        );

        // Access control is enforced by session-service based on forwarded headers
        return sendSuccess(reply, session);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // List sessions
  fastify.get<{ Querystring: ListSessionsQuery }>('/', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateQuery(listSessionsQuerySchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'List sessions',
      description: 'Lists interview sessions with pagination',
      querystring: listSessionsQuerySchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { page, pageSize, status, interviewerId, intervieweeId, startDate, endDate } = request.query;

      try {
        const result = await sessionServiceClient.forward<ServiceTypes.PaginatedResponse<ServiceTypes.Session>>(
          'GET',
          '/sessions',
          {
            query: {
              page,
              pageSize,
              status,
              interviewerId,
              intervieweeId,
              startDate: startDate?.toISOString(),
              endDate: endDate?.toISOString(),
            },
            ...getForwardHeaders(request),
          }
        );

        return sendPaginated(reply, result.items, result.page, result.pageSize, result.totalItems);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Start session
  fastify.post<{ Params: IdParam; Body: StartSessionRequest }>('/:id/start', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      validateBody(startSessionRequestSchema),
      sessionStateMiddleware.start, // Validates: scheduled -> active
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Start a session',
      description: 'Starts an interview session',
      params: idParamSchema,
      body: startSessionRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const session = await sessionServiceClient.forward<ServiceTypes.Session>(
          'POST',
          `/sessions/${id}/start`,
          {
            body: request.body,
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, session);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // End session
  fastify.post<{ Params: IdParam; Body: EndSessionRequest }>('/:id/end', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      validateBody(endSessionRequestSchema),
      sessionStateMiddleware.end, // Validates: active -> ended
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'End a session',
      description: 'Ends an interview session',
      params: idParamSchema,
      body: endSessionRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const session = await sessionServiceClient.forward<ServiceTypes.Session>(
          'POST',
          `/sessions/${id}/end`,
          {
            body: request.body,
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, session);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Cancel session
  fastify.post<{ Params: IdParam }>('/:id/cancel', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
      validateParams(idParamSchema),
      sessionStateMiddleware.cancel, // Validates: scheduled/active -> cancelled
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Cancel a session',
      description: 'Cancels a scheduled interview session',
      params: idParamSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const session = await sessionServiceClient.forward<ServiceTypes.Session>(
          'POST',
          `/sessions/${id}/cancel`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, session);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get session events (security events)
  fastify.get<{ Params: IdParam; Querystring: SessionEventsQuery }>('/:id/events', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      validateQuery(sessionEventsQuerySchema),
      sessionStateMiddleware.events, // Validates: only active/ended sessions
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Get session events',
      description: 'Retrieves security events for a session',
      params: idParamSchema,
      querystring: sessionEventsQuerySchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { page, pageSize, eventType, severity } = request.query;

      try {
        const result = await sessionServiceClient.forward<ServiceTypes.PaginatedResponse<ServiceTypes.SecurityEvent>>(
          'GET',
          `/sessions/${id}/security-events`,
          {
            query: { page, pageSize, eventType, severity },
            ...getForwardHeaders(request),
          }
        );

        return sendPaginated(reply, result.items, result.page, result.pageSize, result.totalItems);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get session questions
  fastify.get<{ Params: IdParam }>('/:id/questions', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      sessionStateMiddleware.questions, // Validates: not cancelled sessions
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Get session questions',
      description: 'Retrieves all questions for a session',
      params: idParamSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const questions = await sessionServiceClient.forward<ServiceTypes.Question[]>(
          'GET',
          `/sessions/${id}/questions`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, questions);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Generate session report
  fastify.post<{ Params: IdParam }>('/:id/report', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
      validateParams(idParamSchema),
      sessionStateMiddleware.report, // Validates: only ended sessions
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Generate session report',
      description: 'Generates an analysis report for the session',
      params: idParamSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        const report = await sessionServiceClient.forward<ServiceTypes.SessionReport>(
          'POST',
          `/sessions/${id}/report`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendCreated(reply, report);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Export session report
  fastify.get<{ Params: IdParam }>('/:id/report/export', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
      validateParams(idParamSchema),
      sessionStateMiddleware.report, // Validates: only ended sessions
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Export session report',
      description: 'Exports the session report as PDF',
      params: idParamSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        // For binary responses like PDF, we need a different approach
        // The session-service returns the PDF directly
        const response = await fetch(
          `${sessionServiceClient['baseUrl']}/sessions/${id}/report/export`,
          {
            headers: {
              Authorization: request.headers.authorization || '',
              'X-User-Id': request.user?.userId || '',
              'X-Organization-Id': request.user?.organizationId || '',
            },
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new NotFoundError('Session or report not found');
          }
          throw new InternalServerError('Failed to export report');
        }

        const buffer = await response.arrayBuffer();
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `attachment; filename="session-report-${id}.pdf"`);

        return reply.send(Buffer.from(buffer));
      } catch (error) {
        if (error instanceof NotFoundError || error instanceof InternalServerError) {
          throw error;
        }
        throw new InternalServerError('Failed to export report');
      }
    },
  });
}
