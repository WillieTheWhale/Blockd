/**
 * Session Validation Schemas
 */

import { z } from 'zod';
import { uuidSchema, paginationQuerySchema } from './common.schema';

// Session status enum
export const sessionStatusSchema = z.enum(['scheduled', 'active', 'ended', 'cancelled']);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

// Create session request schema
export const createSessionRequestSchema = z.object({
  intervieweeEmail: z.string().email('Invalid email address'),
  intervieweeId: uuidSchema.optional(),
  scheduledStart: z.coerce.date(),
  expectedDuration: z.number().int().min(1).max(480).optional(), // in minutes
  metadata: z.record(z.any()).optional(),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

// Update session request schema
export const updateSessionRequestSchema = z.object({
  status: sessionStatusSchema.optional(),
  scheduledStart: z.coerce.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export type UpdateSessionRequest = z.infer<typeof updateSessionRequestSchema>;

// Start session request schema
export const startSessionRequestSchema = z.object({
  sessionToken: z.string().optional(),
});

export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;

// End session request schema
export const endSessionRequestSchema = z.object({
  reason: z.string().max(500).optional(),
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

// Session events query schema
export const sessionEventsQuerySchema = paginationQuerySchema.extend({
  eventType: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export type SessionEventsQuery = z.infer<typeof sessionEventsQuerySchema>;
