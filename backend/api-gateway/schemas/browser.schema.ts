/**
 * Browser Client Validation Schemas
 * Includes input sanitization to prevent XSS and injection attacks
 */

import { z } from 'zod';
import { uuidSchema } from './common.schema';
import { sanitizeTransform, metadataTransform, sanitizeUrl } from '../lib/sanitize';

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

// Session token format: alphanumeric with dashes, 32-128 characters
// This prevents SQL injection and ensures only valid tokens are queried
const sessionTokenSchema = z.string()
  .min(32, 'Session token too short')
  .max(128, 'Session token too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Session token contains invalid characters');

// Validate session request schema
export const validateSessionRequestSchema = z.object({
  sessionToken: sessionTokenSchema,
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
  description: z.string().max(1000).optional().transform((val) => val ? sanitizeTransform(val) : val),
  metadata: z.record(z.unknown()).optional().transform((val) => val ? metadataTransform(val) : val),
});

export type SecurityEventRequest = z.infer<typeof securityEventRequestSchema>;

// Telemetry data schema with size limits to prevent DoS
export const telemetryDataSchema = z.object({
  sessionId: uuidSchema,
  timestamp: z.coerce.date(),
  cpuPercent: z.number().min(0).max(100).optional(),
  memoryMb: z.number().int().min(0).max(1048576).optional(), // Max 1TB in MB
  // Limit active processes array to prevent memory exhaustion
  activeProcesses: z.array(
    z.string().max(256).transform(sanitizeTransform)
  ).max(100).optional(),
  windowTitle: z.string().max(500).optional().transform((val) => val ? sanitizeTransform(val) : val),
  browserTabsCount: z.number().int().min(0).max(1000).optional(),
  // Limit network requests array to prevent payload explosion
  networkRequests: z.array(z.object({
    url: z.string().max(2048).transform((val) => sanitizeUrl(val) || val),
    method: z.string().max(10).transform(sanitizeTransform),
    timestamp: z.number(),
  })).max(50).optional(),
  metadata: z.record(z.unknown()).optional().transform((val) => val ? metadataTransform(val) : val),
});

export type TelemetryData = z.infer<typeof telemetryDataSchema>;

// Batch telemetry request schema
export const batchTelemetryRequestSchema = z.object({
  events: z.array(telemetryDataSchema).min(1).max(100),
});

export type BatchTelemetryRequest = z.infer<typeof batchTelemetryRequestSchema>;
