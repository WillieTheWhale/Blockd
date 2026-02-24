/**
 * User Profile Validation Schemas
 * Includes input sanitization to prevent XSS and injection attacks
 * Includes input length limits to prevent memory exhaustion
 */

import { z } from 'zod';
import { sanitizeTransform } from '../lib/sanitize';
import { INPUT_LIMITS, emailSchema } from './common.schema';

// =============================================================================
// Update Profile Schema
// =============================================================================

/**
 * Update profile request schema
 * Allows updating user profile fields (excluding sensitive auth data)
 */
export const updateProfileRequestSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(INPUT_LIMITS.SHORT_TEXT, `First name must not exceed ${INPUT_LIMITS.SHORT_TEXT} characters`)
    .transform(sanitizeTransform)
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name cannot be empty')
    .max(INPUT_LIMITS.SHORT_TEXT, `Last name must not exceed ${INPUT_LIMITS.SHORT_TEXT} characters`)
    .transform(sanitizeTransform)
    .optional(),
  // Email updates require additional verification in production
  // For now, we allow email updates but log them for auditing
  email: emailSchema.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

// =============================================================================
// User Profile Response Schema
// =============================================================================

/**
 * User profile response schema (excludes sensitive data)
 */
export const userProfileResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string(),
  role: z.enum(['admin', 'interviewer', 'interviewee']),
  organizationId: z.string().uuid().nullable(),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }).nullable(),
  mfaEnabled: z.boolean(),
  emailVerified: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

// =============================================================================
// Preferences Schema (for future use)
// =============================================================================

/**
 * User preferences schema
 * Can be extended for user-specific settings
 */
export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).default('en'),
  notifications: z.object({
    email: z.boolean().default(true),
    browser: z.boolean().default(true),
    sessionReminders: z.boolean().default(true),
  }).optional(),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/**
 * Update preferences request schema
 */
export const updatePreferencesRequestSchema = userPreferencesSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one preference must be provided for update' }
);

export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;
