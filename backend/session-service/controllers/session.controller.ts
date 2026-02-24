import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import sessionService from '../services/session.service';
import { CreateSessionDTO, SessionListQuery } from '../types/session.types';
import { formatErrorResponse } from '../lib/errors';

// Validation schemas
const createSessionSchema = z.object({
  interviewee_id: z.string().uuid().optional(),
  interviewee_email: z.string().email().optional(),
  scheduled_start: z.string().datetime(),
  duration_minutes: z.number().int().positive().max(240),
  questions: z.array(
    z.object({
      question_text: z.string().min(1),
      expected_duration_seconds: z.number().int().positive().optional(),
      difficulty: z.enum(['easy', 'medium', 'hard', 'expert']).optional(),
      question_order: z.number().int().optional(),
    })
  ),
  metadata: z.record(z.unknown()).optional(),
});

const listSessionsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['scheduled', 'active', 'ended', 'cancelled']).optional(),
  interviewer_id: z.string().uuid().optional(),
  interviewee_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

/**
 * Session Controller
 * HTTP endpoints for session management
 */

export class SessionController {
  /**
   * POST /sessions
   * Create new session
   */
  async createSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Validate request body
      const dto = createSessionSchema.parse(request.body) as CreateSessionDTO;

      // Get interviewer ID from JWT (would be extracted from auth middleware)
      const user = (request as FastifyRequest & { user?: { userId: string } }).user;
      if (!user?.userId) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required to create a session',
        });
      }
      const interviewerId = user.userId;

      // Create session
      const session = await sessionService.createSession(interviewerId, dto);

      return reply.status(201).send(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors,
        });
      }

      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:id
   * Get session by ID
   */
  async getSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const session = await sessionService.getSessionById(id);

      return reply.status(200).send(session);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/token/:token
   * Get session by token
   */
  async getSessionByToken(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { token } = request.params as { token: string };

      const session = await sessionService.getSessionByToken(token);

      return reply.status(200).send(session);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions
   * List sessions with pagination and filters
   */
  async listSessions(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Validate query parameters
      const query = listSessionsSchema.parse(request.query) as SessionListQuery;

      const sessions = await sessionService.listSessions(query);

      return reply.status(200).send(sessions);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid query parameters',
          details: error.errors,
        });
      }

      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * DELETE /sessions/:id
   * Delete session
   */
  async deleteSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      await sessionService.deleteSession(id);

      return reply.status(204).send();
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }
}

export default new SessionController();
