import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import verificationService from '../services/verification.service';
import { formatErrorResponse } from '../lib/errors';

// Validation schemas
const heartbeatSchema = z.object({
  session_id: z.string().uuid(),
  browser_fingerprint: z.string().min(32),
  user_agent: z.string(),
  platform: z.string(),
  timestamp: z.string().datetime(),
  meeting_url: z.string().url().optional(),
  is_on_meeting_platform: z.boolean(),
  current_url: z.string().url().optional(),
});

const verifyBrowserSchema = z.object({
  session_id: z.string().uuid(),
  browser_fingerprint: z.string().min(32),
  user_agent: z.string(),
  platform: z.string(),
  blockd_version: z.string(),
  hardware_info: z.object({
    cpu_cores: z.number().optional(),
    memory_gb: z.number().optional(),
    screen_width: z.number().optional(),
    screen_height: z.number().optional(),
    gpu_vendor: z.string().optional(),
  }).optional(),
});

const checkStatusSchema = z.object({
  session_id: z.string().uuid(),
});

/**
 * Verification Controller
 * HTTP endpoints for verifying interviewees are using Blockd browser during sessions
 */

export class VerificationController {
  /**
   * POST /sessions/:id/verify/heartbeat
   * Receive heartbeat from Blockd browser to confirm active session
   */
  async heartbeat(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const dto = heartbeatSchema.parse({
        ...request.body as object,
        session_id: id,
      });

      const result = await verificationService.processHeartbeat(dto);

      return reply.status(200).send({
        success: true,
        verified: result.verified,
        message: result.message,
        next_heartbeat_in_seconds: result.nextHeartbeatInterval,
        session_active: result.sessionActive,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid heartbeat data',
          details: error.errors,
        });
      }

      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * POST /sessions/:id/verify/browser
   * Verify that the browser is a legitimate Blockd browser
   */
  async verifyBrowser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const dto = verifyBrowserSchema.parse({
        ...request.body as object,
        session_id: id,
      });

      const result = await verificationService.verifyBrowser(dto);

      return reply.status(200).send({
        success: true,
        verified: result.verified,
        browser_token: result.browserToken,
        message: result.message,
        expires_at: result.expiresAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid browser verification data',
          details: error.errors,
        });
      }

      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:id/verify/status
   * Check verification status of a session
   */
  async checkStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const status = await verificationService.getVerificationStatus(id);

      return reply.status(200).send({
        session_id: id,
        is_verified: status.isVerified,
        is_on_blockd_browser: status.isOnBlockdBrowser,
        last_heartbeat: status.lastHeartbeat,
        heartbeat_interval_seconds: status.heartbeatIntervalSeconds,
        missed_heartbeats: status.missedHeartbeats,
        current_meeting_platform: status.currentMeetingPlatform,
        verification_warnings: status.warnings,
      });
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * POST /sessions/:id/verify/meeting-detected
   * Report that the browser has detected the user is on a meeting platform
   */
  async meetingDetected(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as {
        meeting_platform: string;
        meeting_url: string;
        detected_at: string;
      };

      const result = await verificationService.reportMeetingDetected(id, {
        platform: body.meeting_platform,
        url: body.meeting_url,
        detectedAt: body.detected_at,
      });

      return reply.status(200).send({
        success: true,
        message: 'Meeting detection recorded',
        should_start_streaming: result.shouldStartStreaming,
        streaming_config: result.streamingConfig,
      });
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * POST /sessions/:id/verify/meeting-ended
   * Report that the user has left the meeting platform
   */
  async meetingEnded(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as {
        meeting_platform: string;
        ended_at: string;
        duration_seconds: number;
      };

      await verificationService.reportMeetingEnded(id, {
        platform: body.meeting_platform,
        endedAt: body.ended_at,
        durationSeconds: body.duration_seconds,
      });

      return reply.status(200).send({
        success: true,
        message: 'Meeting end recorded',
      });
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }
}

export default new VerificationController();
