/**
 * Browser Client Routes
 */

import { FastifyInstance } from 'fastify';
import { SecurityEventType, SeverityLevel, Prisma } from '@prisma/client';
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
import { sanitizeMetadata } from '../lib/sanitize';

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

      // Sanitize metadata before database storage to prevent XSS and prototype pollution
      const sanitizedMetadata = sanitizeMetadata((metadata || {}) as Record<string, unknown>);

      // Create security event
      const event = await prisma.securityEvent.create({
        data: {
          sessionId,
          eventType: eventType as SecurityEventType,
          severity: severity as SeverityLevel,
          description,
          metadata: sanitizedMetadata as Prisma.InputJsonValue,
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
      
    },
    handler: async (request, reply) => {
      const { events } = request.body;

      if (events.length === 0) {
        request.log.debug({ eventsCount: 0 }, 'Empty telemetry batch received');
        return sendSuccess(reply, {
          processed: 0,
          message: 'No telemetry data to process',
        });
      }

      // Validate all session IDs exist and are active
      const sessionIds = [...new Set(events.map(e => e.sessionId))];
      const sessions = await prisma.interviewSession.findMany({
        where: {
          id: { in: sessionIds },
          status: { in: ['active', 'scheduled'] },
        },
        select: { id: true },
      });

      const validSessionIds = new Set(sessions.map(s => s.id));
      const validEvents = events.filter(e => validSessionIds.has(e.sessionId));

      // Log skipped events for monitoring and debugging
      const invalidSessionIds = sessionIds.filter(id => !validSessionIds.has(id));
      if (invalidSessionIds.length > 0) {
        request.log.warn({
          telemetry_skip: {
            totalEvents: events.length,
            invalidSessionIds: invalidSessionIds.length,
            invalidIds: invalidSessionIds.slice(0, 5), // Log first 5 for debugging
            reason: 'session_not_found_or_inactive',
          },
        }, `Skipping telemetry for ${invalidSessionIds.length} invalid/inactive sessions`);
      }

      if (validEvents.length === 0) {
        request.log.warn({
          telemetry_skip: {
            totalEvents: events.length,
            sessionIdsAttempted: sessionIds.length,
            reason: 'no_valid_sessions',
          },
        }, 'All telemetry events skipped - no valid sessions found');
        return sendSuccess(reply, {
          processed: 0,
          message: 'No valid sessions found for telemetry data',
        });
      }

      // Use parameterized batch insert for security
      // Process events in batches to avoid parameter limit
      const BATCH_SIZE = 50;
      let processedCount = 0;

      for (let i = 0; i < validEvents.length; i += BATCH_SIZE) {
        const batch = validEvents.slice(i, i + BATCH_SIZE);

        // Use Prisma's createMany for safe parameterized inserts
        // Note: For TimescaleDB hypertables, this works because Prisma uses proper INSERT statements
        await prisma.browserTelemetry.createMany({
          data: batch.map(event => ({
            sessionId: event.sessionId,
            timestamp: new Date(event.timestamp),
            cpuPercent: event.cpuPercent ?? null,
            memoryMb: event.memoryMb ?? null,
            activeProcesses: event.activeProcesses ?? [],
            windowTitle: event.windowTitle ?? null,
            browserTabsCount: event.browserTabsCount ?? null,
            networkRequests: (event.networkRequests ?? []) as Prisma.InputJsonValue,
            metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });

        processedCount += batch.length;
      }

      const skipped = events.length - validEvents.length;
      return sendSuccess(reply, {
        processed: processedCount,
        skipped,
        message: skipped > 0
          ? `Processed ${processedCount} events, skipped ${skipped} invalid events`
          : 'Telemetry data processed successfully',
      });
    },
  });
}
