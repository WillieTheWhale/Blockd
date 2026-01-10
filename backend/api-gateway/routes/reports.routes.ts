/**
 * Reports Routes
 * Proxies requests to session-service for report generation and retrieval
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateParams } from '../middleware/validation.middleware';
import { idParamSchema, IdParam } from '../schemas/common.schema';
import { sendSuccess } from '../lib/response';
import { NotFoundError, BadRequestError, InternalServerError } from '../lib/errors';
import {
  sessionServiceClient,
  ServiceClientError,
  extractAuthToken,
  ServiceTypes,
} from '../lib/service-client';
import { config } from '../src/config';

/**
 * Helper to forward authentication context
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
      default:
        throw new InternalServerError(error.message);
    }
  }
  throw error;
}

export default async function reportsRoutes(fastify: FastifyInstance) {
  // Get session report
  fastify.get<{ Params: { session_id: string } }>('/:session_id', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Get session report',
      description: 'Retrieves the analysis report for a session',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = request.params.session_id;

      try {
        // Get report from session-service
        const report = await sessionServiceClient.forward<ServiceTypes.SessionReport & {
          session: Partial<ServiceTypes.Session>;
        }>(
          'GET',
          `/sessions/${sessionId}/report`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, report);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get session report as PDF
  fastify.get<{ Params: { session_id: string } }>('/:session_id/pdf', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Download session report as PDF',
      description: 'Downloads the session report as a PDF file',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = request.params.session_id;

      try {
        // For PDF export, we need to stream directly from session-service
        const response = await fetch(
          `${config.services.sessionService}/sessions/${sessionId}/report/export`,
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
          throw new InternalServerError('Failed to generate PDF report');
        }

        const buffer = await response.arrayBuffer();
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `attachment; filename="session-report-${sessionId}.pdf"`);

        return reply.send(Buffer.from(buffer));
      } catch (error) {
        if (error instanceof NotFoundError || error instanceof InternalServerError) {
          throw error;
        }
        throw new InternalServerError('Failed to export report');
      }
    },
  });

  // Get report summary (lightweight version)
  fastify.get<{ Params: { session_id: string } }>('/:session_id/summary', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Get report summary',
      description: 'Retrieves a lightweight summary of the session report',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = request.params.session_id;

      try {
        const summary = await sessionServiceClient.forward<{
          sessionId: string;
          overallRiskScore: number;
          riskLevel: 'low' | 'medium' | 'high' | 'critical';
          securityEventsCount: number;
          aiDetectionFlags: number;
          gazeAnomalies: number;
          status: string;
        }>(
          'GET',
          `/sessions/${sessionId}/report/summary`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, summary);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // List reports for organization
  fastify.get<{
    Querystring: {
      page?: number;
      pageSize?: number;
      startDate?: string;
      endDate?: string;
      riskLevel?: string;
    };
  }>('/', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Reports'],
      summary: 'List organization reports',
      description: 'Lists all reports for the organization with filtering options',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          pageSize: { type: 'number', default: 20 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { page, pageSize, startDate, endDate, riskLevel } = request.query;

      try {
        const result = await sessionServiceClient.forward<ServiceTypes.PaginatedResponse<{
          sessionId: string;
          sessionStatus: string;
          overallRiskScore: number;
          riskLevel: string;
          securityEventsCount: number;
          generatedAt: string;
          interviewee?: { email: string; firstName?: string; lastName?: string };
        }>>(
          'GET',
          '/reports',
          {
            query: {
              page: page || 1,
              pageSize: pageSize || 20,
              startDate,
              endDate,
              riskLevel,
            },
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, result);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Regenerate session report
  fastify.post<{ Params: { session_id: string } }>('/:session_id/regenerate', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Regenerate session report',
      description: 'Regenerates the analysis report for a session with fresh data',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = request.params.session_id;

      try {
        const report = await sessionServiceClient.forward<ServiceTypes.SessionReport>(
          'POST',
          `/sessions/${sessionId}/report/regenerate`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, report);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });
}
