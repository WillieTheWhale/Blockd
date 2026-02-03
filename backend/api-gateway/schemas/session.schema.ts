/**
 * Session Validation Schemas
 * Includes input sanitization to prevent XSS and injection attacks
 * Includes input length limits to prevent memory exhaustion
 */

import { z } from 'zod';
import { uuidSchema, paginationQuerySchema, INPUT_LIMITS, emailSchema, mediumTextSchema } from './common.schema';
import { sanitizeTransform, metadataTransform } from '../lib/sanitize';

// Session status enum
export const sessionStatusSchema = z.enum(['scheduled', 'active', 'ended', 'cancelled']);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

// Meeting link validation - supports Google Meet, Zoom, and Microsoft Teams
const meetingLinkSchema = z.string()
  .url('Invalid meeting link URL')
  .max(500, 'Meeting link too long')
  .refine(
    (url) => {
      const lowerUrl = url.toLowerCase();
      return (
        lowerUrl.includes('meet.google.com') ||
        lowerUrl.includes('zoom.us') ||
        lowerUrl.includes('teams.microsoft.com') ||
        lowerUrl.includes('teams.live.com')
      );
    },
    { message: 'Meeting link must be a Google Meet, Zoom, or Microsoft Teams URL' }
  )
  .optional();

// Create session request schema with input limits
export const createSessionRequestSchema = z.object({
  intervieweeEmail: emailSchema,
  intervieweeId: uuidSchema.optional(),
  scheduledStart: z.coerce.date(),
  expectedDuration: z.number().int().min(1).max(480).optional(), // in minutes, max 8 hours
  meetingLink: meetingLinkSchema,
  metadata: z
    .record(z.unknown())
    .optional()
    .refine(
      (val) => !val || JSON.stringify(val).length <= INPUT_LIMITS.METADATA_SIZE,
      { message: `Metadata size exceeds maximum of ${INPUT_LIMITS.METADATA_SIZE} bytes` }
    )
    .transform((val) => val ? metadataTransform(val) : val),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

// Update session request schema with input limits
export const updateSessionRequestSchema = z.object({
  status: sessionStatusSchema.optional(),
  scheduledStart: z.coerce.date().optional(),
  metadata: z
    .record(z.unknown())
    .optional()
    .refine(
      (val) => !val || JSON.stringify(val).length <= INPUT_LIMITS.METADATA_SIZE,
      { message: `Metadata size exceeds maximum of ${INPUT_LIMITS.METADATA_SIZE} bytes` }
    )
    .transform((val) => val ? metadataTransform(val) : val),
});

export type UpdateSessionRequest = z.infer<typeof updateSessionRequestSchema>;

// Start session request schema
export const startSessionRequestSchema = z.object({
  sessionToken: z.string().max(500).optional(), // Session tokens should be reasonable length
});

export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;

// End session request schema with input limits
export const endSessionRequestSchema = z.object({
  reason: z.string().max(INPUT_LIMITS.MEDIUM_TEXT).optional().transform((val) => val ? sanitizeTransform(val) : val),
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
