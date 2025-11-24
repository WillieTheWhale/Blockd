import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import reportService from '../services/report.service';
import { formatErrorResponse } from '../lib/errors';

// Validation schemas
const generateReportSchema = z.object({
  format: z.enum(['json', 'pdf']).optional().default('json'),
  include_gaze_data: z.boolean().optional().default(true),
  include_telemetry: z.boolean().optional().default(true),
});

/**
 * Report Controller
 * HTTP endpoints for report generation
 */

export class ReportController {
  /**
   * POST /sessions/:id/report
   * Generate session report
   */
  async generateReport(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const report = await reportService.generateReport(id);

      return reply.status(200).send(report);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:id/report/export
   * Export session report
   */
  async exportReport(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const query = generateReportSchema.parse(request.query);

      const reportExport = await reportService.exportReport({
        session_id: id,
        format: query.format,
        include_gaze_data: query.include_gaze_data,
        include_telemetry: query.include_telemetry,
      });

      // Set headers for download
      reply.header('Content-Type', reportExport.mime_type);
      reply.header('Content-Disposition', `attachment; filename="${reportExport.filename}"`);
      reply.header('Content-Length', reportExport.size_bytes.toString());

      return reply.status(200).send(reportExport.content);
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
}

export default new ReportController();
