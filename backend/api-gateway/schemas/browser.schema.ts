/**
 * Browser Client Validation Schemas
 */

import { z } from 'zod';
import { uuidSchema } from './common.schema';

// Security event type enum
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

export type SecurityEventType = z.infer<typeof securityEventTypeSchema>;

// Severity level enum
export const severityLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

export type SeverityLevel = z.infer<typeof severityLevelSchema>;

// Validate session request schema
export const validateSessionRequestSchema = z.object({
  sessionToken: z.string().min(1, 'Session token is required'),
});

export type ValidateSessionRequest = z.infer<typeof validateSessionRequestSchema>;

// Validate session response schema
export const validateSessionResponseSchema = z.object({
  valid: z.boolean(),
  sessionId: uuidSchema.optional(),
  expiresAt: z.string().optional(),
});

export type ValidateSessionResponse = z.infer<typeof validateSessionResponseSchema>;

// Security event request schema
export const securityEventRequestSchema = z.object({
  sessionId: uuidSchema,
  eventType: securityEventTypeSchema,
  severity: severityLevelSchema.default('medium'),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.any()).optional(),
});

export type SecurityEventRequest = z.infer<typeof securityEventRequestSchema>;

// Telemetry data schema
export const telemetryDataSchema = z.object({
  sessionId: uuidSchema,
  timestamp: z.coerce.date(),
  cpuPercent: z.number().min(0).max(100).optional(),
  memoryMb: z.number().int().min(0).optional(),
  activeProcesses: z.array(z.string()).optional(),
  windowTitle: z.string().max(500).optional(),
  browserTabsCount: z.number().int().min(0).optional(),
  networkRequests: z.array(z.object({
    url: z.string(),
    method: z.string(),
    timestamp: z.number(),
  })).optional(),
  metadata: z.record(z.any()).optional(),
});

export type TelemetryData = z.infer<typeof telemetryDataSchema>;

// Batch telemetry request schema
export const batchTelemetryRequestSchema = z.object({
  events: z.array(telemetryDataSchema).min(1).max(100),
});

export type BatchTelemetryRequest = z.infer<typeof batchTelemetryRequestSchema>;
