/**
 * Session Validation Schemas
 * Includes input sanitization to prevent XSS and injection attacks
 */

import { z } from 'zod';
import { uuidSchema, paginationQuerySchema } from './common.schema';
import { sanitizeTransform, metadataTransform } from '../lib/sanitize';

// Session status enum
export const sessionStatusSchema = z.enum(['scheduled', 'active', 'ended', 'cancelled']);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

// Create session request schema
export const createSessionRequestSchema = z.object({
  intervieweeEmail: z.string().email('Invalid email address'),
  intervieweeId: uuidSchema.optional(),
  scheduledStart: z.coerce.date(),
  expectedDuration: z.number().int().min(1).max(480).optional(), // in minutes
  metadata: z.record(z.unknown()).optional().transform((val) => val ? metadataTransform(val) : val),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

// Update session request schema
export const updateSessionRequestSchema = z.object({
  status: sessionStatusSchema.optional(),
  scheduledStart: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional().transform((val) => val ? metadataTransform(val) : val),
});

export type UpdateSessionRequest = z.infer<typeof updateSessionRequestSchema>;

// Start session request schema
export const startSessionRequestSchema = z.object({
  sessionToken: z.string().optional(),
});

export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;

// End session request schema
export const endSessionRequestSchema = z.object({
  reason: z.string().max(500).optional().transform((val) => val ? sanitizeTransform(val) : val),
});

export type EndSessionRequest = z.infer<typeof endSessionRequestSchema>;

// List sessions query schema
export const listSessionsQuerySchema = paginationQuerySchema.extend({
  status: sessionStatusSchema.optional(),
  interviewerId: uuidSchema.optional(),
  intervieweeId: uuidSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

// Session response schema
export const sessionResponseSchema = z.object({
  id: uuidSchema,
  interviewerId: uuidSchema,
  intervieweeId: uuidSchema.nullable(),
  intervieweeEmail: z.string().nullable(),
  organizationId: uuidSchema,
  status: sessionStatusSchema,
  sessionToken: z.string().nullable(),
  scheduledStart: z.string().nullable(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  durationMinutes: z.number().nullable(),
  riskScore: z.number().nullable(),
  videoUrl: z.string().nullable(),
  recordingUrl: z.string().nullable(),
  metadata: z.record(z.any()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// Valid security event types (matches database schema)
export const securityEventTypeSchema = z.enum([
  'suspicious_process',
  'screen_recording_detected',
  'vm_detected',
  'window_focus_changed',
  'multi_monitor_detected',
  'unauthorized_browser',
  'copy_paste_detected',
  'keyboard_shortcut_blocked',
]);

// Session events query schema with proper enum validation
export const sessionEventsQuerySchema = paginationQuerySchema.extend({
  eventType: securityEventTypeSchema.optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

// Email report recipients schema
export const emailReportRecipientsSchema = z.object({
  recipients: z.array(
    z.string()
      .email('Invalid email address')
      .max(254, 'Email address too long') // RFC 5321 limit
  )
    .min(1, 'At least one recipient required')
    .max(10, 'Maximum 10 recipients allowed'),
});

export type EmailReportRecipientsRequest = z.infer<typeof emailReportRecipientsSchema>;

export type SessionEventsQuery = z.infer<typeof sessionEventsQuerySchema>;
