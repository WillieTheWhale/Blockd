/**
 * Gaze Tracking Routes
 * WebSocket for real-time gaze tracking
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rate-limit.middleware.js';
import { validateParams } from '../middleware/validation.middleware.js';
import { idParamSchema, IdParam } from '../schemas/common.schema.js';
import { sendSuccess } from '../lib/response.js';
import { NotFoundError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';

export default async function gazeRoutes(fastify: FastifyInstance) {
  // WebSocket endpoint for gaze streaming
  fastify.get('/stream', {
    websocket: true,
    schema: {
      tags: ['Gaze'],
      summary: 'Gaze tracking WebSocket',
      description: 'WebSocket endpoint for real-time gaze tracking data',
    },
    handler: (connection, request) => {
      request.log.info('Gaze tracking WebSocket connection established');

      connection.socket.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());

          // Validate and process gaze data
          if (data.type === 'gaze' && data.sessionId) {
            // Store gaze event in database
            await prisma.gazeEvent.create({
              data: {
                sessionId: data.sessionId,
                timestamp: new Date(data.timestamp || Date.now()),
                gazeX: data.gazeX,
                gazeY: data.gazeY,
                isOffScreen: data.isOffScreen || false,
                offScreenDirection: data.offScreenDirection,
                confidence: data.confidence,
                pupilDiameterLeft: data.pupilDiameterLeft,
                pupilDiameterRight: data.pupilDiameterRight,
                metadata: data.metadata || {},
              } as any,
            });

            // Send acknowledgment
            connection.socket.send(JSON.stringify({
              type: 'ack',
              timestamp: Date.now(),
            }));
          }
        } catch (error) {
          request.log.error('Error processing gaze data:', error);
          connection.socket.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process gaze data',
          }));
        }
      });

      connection.socket.on('close', () => {
        request.log.info('Gaze tracking WebSocket connection closed');
      });
    },
  });

  // Get gaze summary for a session
  fastify.get<{ Params: IdParam }>('/summary/:session_id', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema.extend({ session_id: idParamSchema.shape.id })),
    ],
    schema: {
      tags: ['Gaze'],
      summary: 'Get gaze tracking summary',
      description: 'Retrieves aggregated gaze tracking data for a session',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = (request.params as any).session_id;

      // Verify session exists
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Get gaze event statistics
      const [totalEvents, offScreenEvents, avgConfidence] = await Promise.all([
        prisma.gazeEvent.count({ where: { sessionId } }),
        prisma.gazeEvent.count({
          where: {
            sessionId,
            isOffScreen: true,
          },
        }),
        prisma.gazeEvent.aggregate({
          where: { sessionId },
          _avg: { confidence: true },
        }),
      ]);

      // Get off-screen direction breakdown
      const offScreenDirections = await prisma.$queryRaw<Array<{ offScreenDirection: string; count: number }>>`
        SELECT
          "off_screen_direction" as "offScreenDirection",
          COUNT(*)::int as count
        FROM gaze_events
        WHERE session_id = ${sessionId}::uuid
          AND is_off_screen = true
          AND "off_screen_direction" IS NOT NULL
        GROUP BY "off_screen_direction"
      `;

      const summary = {
        sessionId,
        totalEvents,
        offScreenEvents,
        offScreenPercentage: totalEvents > 0 ? (offScreenEvents / totalEvents) * 100 : 0,
        averageConfidence: Number(avgConfidence._avg.confidence) || 0,
        offScreenDirections: offScreenDirections.reduce((acc, curr) => {
          acc[curr.offScreenDirection] = curr.count;
          return acc;
        }, {} as Record<string, number>),
      };

      return sendSuccess(reply, summary);
    },
  });
}
