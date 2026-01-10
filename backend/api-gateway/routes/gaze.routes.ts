/**
 * Gaze Tracking Routes
 * Proxies requests to eye-tracking-service
 * WebSocket for real-time gaze tracking
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateParams } from '../middleware/validation.middleware';
import { idParamSchema, IdParam } from '../schemas/common.schema';
import { sendSuccess } from '../lib/response';
import { NotFoundError, BadRequestError, InternalServerError } from '../lib/errors';
import {
  eyeTrackingServiceClient,
  sessionServiceClient,
  ServiceClientError,
  extractAuthToken,
  ServiceTypes,
} from '../lib/service-client';

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

export default async function gazeRoutes(fastify: FastifyInstance) {
  // WebSocket endpoint for gaze streaming
  // Note: WebSocket connections are proxied directly to eye-tracking-service
  // The API Gateway maintains the WebSocket connection and forwards messages
  fastify.get('/stream', {
    websocket: true,
    schema: {
      tags: ['Gaze'],
      summary: 'Gaze tracking WebSocket',
      description: 'WebSocket endpoint for real-time gaze tracking data',
    },
    handler: async (connection, request) => {
      request.log.info('Gaze tracking WebSocket connection established');

      // Connect to the eye-tracking-service WebSocket
      const WebSocket = (await import('ws')).default;
      const serviceWs = new WebSocket(
        `${eyeTrackingServiceClient['baseUrl'].replace('http', 'ws')}/gaze/stream`
      );

      // Forward messages from client to service
      connection.socket.on('message', (message) => {
        if (serviceWs.readyState === WebSocket.OPEN) {
          serviceWs.send(message);
        }
      });

      // Forward messages from service to client
      serviceWs.on('message', (message) => {
        connection.socket.send(message.toString());
      });

      // Handle client disconnect
      connection.socket.on('close', () => {
        request.log.info('Client WebSocket closed');
        serviceWs.close();
      });

      // Handle service disconnect
      serviceWs.on('close', () => {
        request.log.info('Service WebSocket closed');
        connection.socket.close();
      });

      // Handle errors
      serviceWs.on('error', (error) => {
        request.log.error('Service WebSocket error:', error);
        connection.socket.close();
      });
    },
  });

  // Get gaze summary for a session
  fastify.get<{ Params: { session_id: string } }>('/summary/:session_id', {
    preHandler: [
      authenticate,
      authRateLimiter,
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
      const sessionId = request.params.session_id;

      try {
        // Verify session exists and user has access
        await sessionServiceClient.forward<ServiceTypes.Session>(
          'GET',
          `/sessions/${sessionId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        // Get gaze summary from eye-tracking-service
        const summary = await eyeTrackingServiceClient.forward<ServiceTypes.GazeSummary>(
          'GET',
          `/gaze/summary/${sessionId}`,
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

  // Get gaze heatmap data for a session
  fastify.get<{ Params: { session_id: string }; Querystring: { resolution?: number } }>('/heatmap/:session_id', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Gaze'],
      summary: 'Get gaze heatmap',
      description: 'Retrieves gaze heatmap data for visualization',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          resolution: { type: 'number', default: 100 },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = request.params.session_id;
      const { resolution } = request.query;

      try {
        // Verify session exists and user has access
        await sessionServiceClient.forward<ServiceTypes.Session>(
          'GET',
          `/sessions/${sessionId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        // Get heatmap data from eye-tracking-service
        const heatmap = await eyeTrackingServiceClient.forward<{
          sessionId: string;
          resolution: number;
          data: number[][];
          maxValue: number;
        }>(
          'GET',
          `/gaze/heatmap/${sessionId}`,
          {
            query: { resolution },
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, heatmap);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get gaze timeline for a session
  fastify.get<{
    Params: { session_id: string };
    Querystring: { startTime?: string; endTime?: string; limit?: number };
  }>('/timeline/:session_id', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Gaze'],
      summary: 'Get gaze timeline',
      description: 'Retrieves gaze events timeline for a session',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          limit: { type: 'number', default: 1000 },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = request.params.session_id;
      const { startTime, endTime, limit } = request.query;

      try {
        // Verify session exists and user has access
        await sessionServiceClient.forward<ServiceTypes.Session>(
          'GET',
          `/sessions/${sessionId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        // Get timeline data from eye-tracking-service
        const timeline = await eyeTrackingServiceClient.forward<{
          sessionId: string;
          events: Array<{
            timestamp: string;
            gazeX: number;
            gazeY: number;
            isOffScreen: boolean;
            offScreenDirection?: string;
            confidence: number;
          }>;
          totalEvents: number;
        }>(
          'GET',
          `/gaze/timeline/${sessionId}`,
          {
            query: { startTime, endTime, limit },
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, timeline);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get off-screen events for a session
  fastify.get<{ Params: { session_id: string } }>('/off-screen/:session_id', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Gaze'],
      summary: 'Get off-screen events',
      description: 'Retrieves off-screen gaze events for a session',
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
        // Verify session exists and user has access
        await sessionServiceClient.forward<ServiceTypes.Session>(
          'GET',
          `/sessions/${sessionId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        // Get off-screen events from eye-tracking-service
        const offScreenEvents = await eyeTrackingServiceClient.forward<{
          sessionId: string;
          events: Array<{
            timestamp: string;
            direction: string;
            duration: number;
            confidence: number;
          }>;
          totalDuration: number;
          directionBreakdown: Record<string, number>;
        }>(
          'GET',
          `/gaze/off-screen/${sessionId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, offScreenEvents);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });
}
