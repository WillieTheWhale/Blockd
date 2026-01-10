/**
 * Browser Client Routes
 * Proxies requests to session-service for session validation and security events
 */

import { FastifyInstance } from 'fastify';
import { publicRateLimiter, authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import {
  validateSessionRequestSchema,
  securityEventRequestSchema,
  batchTelemetryRequestSchema,
  ValidateSessionRequest,
  SecurityEventRequest,
  BatchTelemetryRequest,
} from '../schemas/browser.schema';
import { sendSuccess } from '../lib/response';
import { NotFoundError, BadRequestError, InternalServerError } from '../lib/errors';
import {
  sessionServiceClient,
  ServiceClientError,
} from '../lib/service-client';

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

export default async function browserRoutes(fastify: FastifyInstance) {
  // Validate session token
  fastify.post<{ Body: ValidateSessionRequest }>('/session/validate', {
    preHandler: [publicRateLimiter, validateBody(validateSessionRequestSchema)],
    schema: {
      tags: ['Browser'],
      summary: 'Validate session token',
      description: 'Validates a session token for browser client',
    },
    handler: async (request, reply) => {
      const { sessionToken } = request.body;

      try {
        const validation = await sessionServiceClient.post<{
          valid: boolean;
          sessionId?: string;
          expiresAt?: string;
        }>(
          '/sessions/token/validate',
          { sessionToken }
        );

        return sendSuccess(reply, validation);
      } catch (error) {
        // If session not found, return valid: false instead of throwing
        if (error instanceof ServiceClientError && error.statusCode === 404) {
          return sendSuccess(reply, { valid: false });
        }
        handleServiceError(error);
      }
    },
  });

  // Report security event
  fastify.post<{ Body: SecurityEventRequest }>('/security/event', {
    preHandler: [authRateLimiter, validateBody(securityEventRequestSchema)],
    schema: {
      tags: ['Browser'],
      summary: 'Report security event',
      description: 'Reports a security event from the browser client',
    },
    handler: async (request, reply) => {
      const { sessionId, eventType, severity, description, metadata } = request.body;

      try {
        const event = await sessionServiceClient.post<{
          id: string;
          sessionId: string;
          eventType: string;
          severity: string;
          description?: string;
          metadata?: Record<string, unknown>;
          timestamp: string;
        }>(
          `/sessions/${sessionId}/security-events`,
          {
            eventType,
            severity,
            description,
            metadata,
          }
        );

        return sendSuccess(reply, event);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Batch telemetry data
  fastify.post<{ Body: BatchTelemetryRequest }>('/telemetry/batch', {
    preHandler: [authRateLimiter, validateBody(batchTelemetryRequestSchema)],
    schema: {
      tags: ['Browser'],
      summary: 'Submit batch telemetry',
      description: 'Submits a batch of telemetry data from browser client',
    },
    handler: async (request, reply) => {
      const { events } = request.body;

      try {
        // Group events by session ID and forward to session-service
        const sessionGroups = new Map<string, typeof events>();

        for (const event of events) {
          const sessionId = event.sessionId;
          if (!sessionGroups.has(sessionId)) {
            sessionGroups.set(sessionId, []);
          }
          sessionGroups.get(sessionId)!.push(event);
        }

        // Send telemetry batches to session-service for each session
        const promises = Array.from(sessionGroups.entries()).map(
          ([sessionId, sessionEvents]) =>
            sessionServiceClient.post(
              `/sessions/${sessionId}/telemetry/batch`,
              { events: sessionEvents }
            )
        );

        await Promise.all(promises);

        return sendSuccess(reply, {
          processed: events.length,
          message: 'Telemetry data processed successfully',
        });
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get session info for browser client
  fastify.get<{ Params: { sessionToken: string } }>('/session/:sessionToken', {
    preHandler: [publicRateLimiter],
    schema: {
      tags: ['Browser'],
      summary: 'Get session info by token',
      description: 'Retrieves session information for the browser client',
      params: {
        type: 'object',
        properties: {
          sessionToken: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { sessionToken } = request.params;

      try {
        const session = await sessionServiceClient.get<{
          id: string;
          status: string;
          scheduledStart?: string;
          actualStart?: string;
          metadata?: Record<string, unknown>;
        }>(
          `/sessions/token/${sessionToken}`
        );

        return sendSuccess(reply, session);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Heartbeat endpoint for browser client
  fastify.post<{ Body: { sessionId: string; timestamp: string } }>('/heartbeat', {
    preHandler: [authRateLimiter],
    schema: {
      tags: ['Browser'],
      summary: 'Session heartbeat',
      description: 'Sends a heartbeat to indicate browser client is still active',
    },
    handler: async (request, reply) => {
      const { sessionId, timestamp } = request.body;

      try {
        await sessionServiceClient.post(
          `/sessions/${sessionId}/heartbeat`,
          { timestamp }
        );

        return sendSuccess(reply, {
          acknowledged: true,
          serverTime: new Date().toISOString(),
        });
      } catch (error) {
        handleServiceError(error);
      }
    },
  });
}
