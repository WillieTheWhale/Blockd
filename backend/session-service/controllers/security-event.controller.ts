import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import securityEventService from '../services/security-event.service';
import { formatErrorResponse } from '../lib/errors';

// Validation schemas
const createSecurityEventSchema = z.object({
  event_type: z.enum([
    'suspicious_process',
    'screen_recording_detected',
    'vm_detected',
    'window_focus_changed',
    'multi_monitor_detected',
    'unauthorized_browser',
    'copy_paste_detected',
    'keyboard_shortcut_blocked',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Security Event Controller
 * HTTP endpoints for security event logging
 */

export class SecurityEventController {
  /**
   * POST /sessions/:id/security-events
   * Log security event
   */
  async logSecurityEvent(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const dto = createSecurityEventSchema.parse(request.body);

      const result = await securityEventService.logSecurityEvent(id, dto);

      return reply.status(201).send(result);
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
   * GET /sessions/:id/security-events
   * Get security events for session
   */
  async getSecurityEvents(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const events = await securityEventService.getSessionSecurityEvents(id);

      return reply.status(200).send(events);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:id/security-events/statistics
   * Get security event statistics
   */
  async getSecurityStatistics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const stats = await securityEventService.getSecurityStatistics(id);

      return reply.status(200).send(stats);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:id/security-events/critical
   * Check if session has critical events
   */
  async hasCriticalEvents(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const hasCritical = await securityEventService.hasCriticalEvents(id);

      return reply.status(200).send({ has_critical_events: hasCritical });
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }
}

export default new SecurityEventController();
