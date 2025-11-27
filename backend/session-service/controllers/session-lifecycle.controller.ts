import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import sessionLifecycleService from '../services/session-lifecycle.service';
import { formatErrorResponse } from '../lib/errors';

// Validation schemas
const startSessionSchema = z.object({
  started_by: z.string().uuid(),
});

const endSessionSchema = z.object({
  ended_by: z.string().uuid(),
  reason: z.string().optional(),
});

const cancelSessionSchema = z.object({
  cancelled_by: z.string().uuid(),
  reason: z.string().optional(),
});

/**
 * Session Lifecycle Controller
 * HTTP endpoints for session lifecycle operations
 */

export class SessionLifecycleController {
  /**
   * POST /sessions/:id/start
   * Start session
   */
  async startSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const dto = startSessionSchema.parse(request.body);

      const result = await sessionLifecycleService.startSession(id, dto);

      return reply.status(200).send(result);
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
   * POST /sessions/:id/end
   * End session
   */
  async endSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const dto = endSessionSchema.parse(request.body);

      const result = await sessionLifecycleService.endSession(id, dto);

      return reply.status(200).send(result);
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
   * POST /sessions/:id/cancel
   * Cancel session
   */
  async cancelSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const dto = cancelSessionSchema.parse(request.body);

      await sessionLifecycleService.cancelSession(id, dto);

      return reply.status(204).send();
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
   * GET /sessions/:id/can-start
   * Check if session can be started
   */
  async canStartSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const canStart = await sessionLifecycleService.canStartSession(id);

      return reply.status(200).send({ can_start: canStart });
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:id/can-end
   * Check if session can be ended
   */
  async canEndSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const canEnd = await sessionLifecycleService.canEndSession(id);

      return reply.status(200).send({ can_end: canEnd });
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }
}

export default new SessionLifecycleController();
