/**
 * Gaze Tracking Routes
 * WebSocket for real-time gaze tracking with authentication and validation
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateParams } from '../middleware/validation.middleware';
import { idParamSchema, IdParam } from '../schemas/common.schema';
import { sendSuccess } from '../lib/response';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../lib/errors';
import prisma from '../lib/prisma';
import config from '../src/config';
import { z } from 'zod';

/**
 * Sanitize validation error for WebSocket response
 * Only expose detailed errors in development mode
 */
function sanitizeValidationError(error: z.ZodError): {
  message: string;
  details?: Array<{ field: string; message: string }>;
} {
  const firstError = error.errors[0];
  const genericMessage = 'Invalid data format';

  // In production, only return generic error message
  if (config.server.isProduction) {
    return { message: genericMessage };
  }

  // In development, include details for debugging
  return {
    message: firstError?.message || genericMessage,
    details: error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })),
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

const gazeMessageSchema = z.object({
  type: z.literal('gaze'),
  sessionToken: z.string().min(1, 'Session token is required'),
  sessionId: z.string().uuid('Invalid session ID'),
  timestamp: z.number().optional(),
  gazeX: z.number().min(0).max(1, 'gazeX must be between 0 and 1'),
  gazeY: z.number().min(0).max(1, 'gazeY must be between 0 and 1'),
  isOffScreen: z.boolean().optional().default(false),
  offScreenDirection: z.enum(['left', 'right', 'up', 'down']).optional(),
  confidence: z.number().min(0).max(1, 'confidence must be between 0 and 1').optional(),
  pupilDiameterLeft: z.number().positive().optional(),
  pupilDiameterRight: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const authMessageSchema = z.object({
  type: z.literal('auth'),
  sessionToken: z.string().min(1, 'Session token is required'),
});

const pingMessageSchema = z.object({
  type: z.literal('ping'),
});

type GazeMessage = z.infer<typeof gazeMessageSchema>;
type AuthMessage = z.infer<typeof authMessageSchema>;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const RATE_LIMIT_MAX_MESSAGES = 60; // 60 messages per second (2x the 30 FPS target)
const MAX_MESSAGE_SIZE = 4096; // 4KB max message size

// ============================================================================
// WebSocket State Management
// ============================================================================

interface ConnectionState {
  authenticated: boolean;
  sessionId?: string;
  sessionToken?: string;
  messageCount: number;
  windowStart: number;
  lastActivity: number;
}

const connectionStates = new WeakMap<WebSocket, ConnectionState>();

function getConnectionState(socket: WebSocket): ConnectionState {
  let state = connectionStates.get(socket);
  if (!state) {
    state = {
      authenticated: false,
      messageCount: 0,
      windowStart: Date.now(),
      lastActivity: Date.now(),
    };
    connectionStates.set(socket, state);
  }
  return state;
}

function checkRateLimit(state: ConnectionState): boolean {
  const now = Date.now();

  // Reset window if expired
  if (now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
    state.messageCount = 0;
    state.windowStart = now;
  }

  state.messageCount++;
  state.lastActivity = now;

  return state.messageCount <= RATE_LIMIT_MAX_MESSAGES;
}

// ============================================================================
// Routes
// ============================================================================

export default async function gazeRoutes(fastify: FastifyInstance) {
  // WebSocket endpoint for gaze streaming
  fastify.get('/stream', {
    websocket: true,
    schema: {
      tags: ['Gaze'],
      summary: 'Gaze tracking WebSocket',
      description: 'WebSocket endpoint for real-time gaze tracking data. Requires session token authentication.',
    },
    handler: (connection, request) => {
      const state = getConnectionState(connection.socket as unknown as WebSocket);
      request.log.info({ ip: request.ip }, 'Gaze tracking WebSocket connection established');

      // Set up connection timeout for authentication
      const authTimeout = setTimeout(() => {
        if (!state.authenticated) {
          request.log.warn({ ip: request.ip }, 'WebSocket authentication timeout');
          connection.socket.send(JSON.stringify({
            type: 'error',
            code: 'AUTH_TIMEOUT',
            message: 'Authentication required within 10 seconds',
          }));
          connection.socket.close(4001, 'Authentication timeout');
        }
      }, 10000);

      connection.socket.on('message', async (message) => {
        try {
          // Check message size
          const messageStr = message.toString();
          if (messageStr.length > MAX_MESSAGE_SIZE) {
            connection.socket.send(JSON.stringify({
              type: 'error',
              code: 'MESSAGE_TOO_LARGE',
              message: `Message exceeds maximum size of ${MAX_MESSAGE_SIZE} bytes`,
            }));
            return;
          }

          // Check rate limit
          if (!checkRateLimit(state)) {
            connection.socket.send(JSON.stringify({
              type: 'error',
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many messages, please slow down',
            }));
            return;
          }

          const rawData = JSON.parse(messageStr);

          // Handle ping messages (keep-alive)
          if (rawData.type === 'ping') {
            connection.socket.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now(),
            }));
            return;
          }

          // Handle authentication
          if (rawData.type === 'auth') {
            const parseResult = authMessageSchema.safeParse(rawData);
            if (!parseResult.success) {
              connection.socket.send(JSON.stringify({
                type: 'error',
                code: 'INVALID_AUTH_MESSAGE',
                message: parseResult.error.errors[0]?.message || 'Invalid auth message',
              }));
              return;
            }

            const { sessionToken } = parseResult.data;

            // Validate session token
            const session = await prisma.interviewSession.findUnique({
              where: { sessionToken },
              select: { id: true, status: true },
            });

            if (!session) {
              connection.socket.send(JSON.stringify({
                type: 'error',
                code: 'INVALID_SESSION',
                message: 'Invalid session token',
              }));
              connection.socket.close(4002, 'Invalid session token');
              return;
            }

            if (session.status !== 'active' && session.status !== 'scheduled') {
              connection.socket.send(JSON.stringify({
                type: 'error',
                code: 'SESSION_NOT_ACTIVE',
                message: 'Session is not active',
              }));
              connection.socket.close(4003, 'Session not active');
              return;
            }

            // Authentication successful
            state.authenticated = true;
            state.sessionId = session.id;
            state.sessionToken = sessionToken;
            clearTimeout(authTimeout);

            request.log.info({ sessionId: session.id, ip: request.ip }, 'WebSocket authenticated');
            connection.socket.send(JSON.stringify({
              type: 'auth_success',
              sessionId: session.id,
              timestamp: Date.now(),
            }));
            return;
          }

          // Require authentication for gaze data
          if (!state.authenticated) {
            connection.socket.send(JSON.stringify({
              type: 'error',
              code: 'NOT_AUTHENTICATED',
              message: 'Please authenticate first with type: "auth"',
            }));
            return;
          }

          // Handle gaze data
          if (rawData.type === 'gaze') {
            const parseResult = gazeMessageSchema.safeParse(rawData);
            if (!parseResult.success) {
              // Sanitize validation errors to avoid leaking schema details in production
              const sanitizedError = sanitizeValidationError(parseResult.error);
              connection.socket.send(JSON.stringify({
                type: 'error',
                code: 'VALIDATION_ERROR',
                ...sanitizedError,
              }));
              return;
            }

            const data = parseResult.data;

            // Verify session ID matches authenticated session
            if (data.sessionId !== state.sessionId) {
              connection.socket.send(JSON.stringify({
                type: 'error',
                code: 'SESSION_MISMATCH',
                message: 'Session ID does not match authenticated session',
              }));
              return;
            }

            // Store gaze event in database
            await prisma.gazeEvent.create({
              data: {
                sessionId: data.sessionId,
                timestamp: new Date(data.timestamp || Date.now()),
                gazeX: data.gazeX,
                gazeY: data.gazeY,
                isOffScreen: data.isOffScreen,
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
          request.log.error({ error, sessionId: state.sessionId }, 'Error processing gaze data');

          if (error instanceof SyntaxError) {
            connection.socket.send(JSON.stringify({
              type: 'error',
              code: 'INVALID_JSON',
              message: 'Invalid JSON format',
            }));
          } else {
            connection.socket.send(JSON.stringify({
              type: 'error',
              code: 'PROCESSING_ERROR',
              message: 'Failed to process gaze data',
            }));
          }
        }
      });

      connection.socket.on('close', (code, reason) => {
        clearTimeout(authTimeout);
        request.log.info(
          { sessionId: state.sessionId, code, reason: reason?.toString(), ip: request.ip },
          'Gaze tracking WebSocket connection closed'
        );
      });

      connection.socket.on('error', (error) => {
        request.log.error({ error, sessionId: state.sessionId }, 'WebSocket error');
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
