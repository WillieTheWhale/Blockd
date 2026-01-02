/**
 * Browser Client Routes
 */

import { FastifyInstance } from 'fastify';
import { optionalAuthenticate } from '../middleware/auth.middleware';
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
import { NotFoundError } from '../lib/errors';
import prisma from '../lib/prisma';

export default async function browserRoutes(fastify: FastifyInstance) {
  // Validate session token
  fastify.post<{ Body: ValidateSessionRequest }>('/session/validate', {
    preHandler: [publicRateLimiter, validateBody(validateSessionRequestSchema)],
    schema: {
      tags: ['Browser'],
      summary: 'Validate session token',
      description: 'Validates a session token for browser client',
      body: validateSessionRequestSchema,
    },
    handler: async (request, reply) => {
      const { sessionToken } = request.body;

      const session = await prisma.interviewSession.findUnique({
        where: { sessionToken },
      });

      if (!session) {
        return sendSuccess(reply, {
          valid: false,
        });
      }

      // Check if session is active
      const isValid = session.status === 'active' || session.status === 'scheduled';

      return sendSuccess(reply, {
        valid: isValid,
        sessionId: isValid ? session.id : undefined,
        expiresAt: session.actualEnd?.toISOString(),
      });
    },
  });

  // Report security event
  fastify.post<{ Body: SecurityEventRequest }>('/security/event', {
    preHandler: [authRateLimiter, validateBody(securityEventRequestSchema)],
    schema: {
      tags: ['Browser'],
      summary: 'Report security event',
      description: 'Reports a security event from the browser client',
      body: securityEventRequestSchema,
    },
    handler: async (request, reply) => {
      const { sessionId, eventType, severity, description, metadata } = request.body;

      // Verify session exists
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Create security event
      const event = await prisma.securityEvent.create({
        data: {
          sessionId,
          eventType: eventType as any,
          severity: severity as any,
          description,
          metadata: metadata || {},
        },
      });

      // Update session risk score (simplified calculation)
      const eventCount = await prisma.securityEvent.count({
        where: { sessionId },
      });

      const riskScore = Math.min(eventCount * 0.1, 1.0);

      await prisma.interviewSession.update({
        where: { id: sessionId },
        data: { riskScore },
      });

      return sendSuccess(reply, event);
    },
  });

  // Batch telemetry data
  fastify.post<{ Body: BatchTelemetryRequest }>('/telemetry/batch', {
    preHandler: [authRateLimiter, validateBody(batchTelemetryRequestSchema)],
    schema: {
      tags: ['Browser'],
      summary: 'Submit batch telemetry',
      description: 'Submits a batch of telemetry data from browser client',
      body: batchTelemetryRequestSchema,
    },
    handler: async (request, reply) => {
      const { events } = request.body;

      // Process telemetry events in batch
      const telemetryRecords = events.map(event => ({
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        cpuPercent: event.cpuPercent,
        memoryMb: event.memoryMb,
        activeProcesses: event.activeProcesses || [],
        windowTitle: event.windowTitle,
        browserTabsCount: event.browserTabsCount,
        networkRequests: event.networkRequests || [],
        metadata: event.metadata || {},
      }));

      // Insert in batch (note: this uses createMany which doesn't work with TimescaleDB hypertables)
      // In production, use individual inserts or batch insert via raw SQL
      for (const record of telemetryRecords) {
        await prisma.browserTelemetry.create({
          data: record as any,
        });
      }

      return sendSuccess(reply, {
        processed: telemetryRecords.length,
        message: 'Telemetry data processed successfully',
      });
    },
  });
}
