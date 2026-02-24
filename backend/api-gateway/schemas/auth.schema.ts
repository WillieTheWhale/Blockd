/**
 * Authentication Validation Schemas
 * Includes input sanitization to prevent XSS and injection attacks
 * Includes input length limits to prevent memory exhaustion
 */

import { z } from 'zod';
import { sanitizeTransform } from '../lib/sanitize';
import { INPUT_LIMITS, emailSchema } from './common.schema';

// Password schema with complexity requirements
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters') // Prevent DoS via bcrypt
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Register request schema with input limits
// Supports both 'name' (from frontend) and 'firstName'/'lastName' (API standard)
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(INPUT_LIMITS.SHORT_TEXT).optional().transform((val) => val ? sanitizeTransform(val) : val),
  firstName: z.string().min(1).max(INPUT_LIMITS.SHORT_TEXT).optional().transform((val) => val ? sanitizeTransform(val) : val),
  lastName: z.string().min(1).max(INPUT_LIMITS.SHORT_TEXT).optional().transform((val) => val ? sanitizeTransform(val) : val),
  role: z.enum(['admin', 'interviewer', 'interviewee']).default('interviewee'),
  organizationId: z.string().uuid().optional(),
  organization: z.string().max(INPUT_LIMITS.SHORT_TEXT).optional(), // Organization name from frontend
  newOrganization: z.string().max(INPUT_LIMITS.SHORT_TEXT).optional(), // For creating new org
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// Login request schema with input limits
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128), // Match registration limit
  mfaCode: z.string().length(6).optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Refresh token request schema with reasonable token size limit
export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').max(2048), // JWT tokens can be large
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

// Logout request schema
export const logoutRequestSchema = z.object({
  refreshToken: z.string().optional(),
});

export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

// MFA setup request schema
export const mfaSetupRequestSchema = z.object({
  enabled: z.boolean(),
});

export type MfaSetupRequest = z.infer<typeof mfaSetupRequestSchema>;

// MFA verify request schema
export const mfaVerifyRequestSchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits'),
  secret: z.string().min(1, 'MFA secret is required'),
});

export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

// Auth response schema
export const authResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(['admin', 'interviewer', 'interviewee']),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    organizationId: z.string().uuid().nullable(),
    mfaEnabled: z.boolean(),
    emailVerified: z.boolean(),
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
  }),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// MFA setup response schema
export const mfaSetupResponseSchema = z.object({
  secret: z.string(),
  qrCode: z.string(),
  backupCodes: z.array(z.string()),
});

export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

// Change password request schema
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

// MFA disable request schema (requires password for security)
export const mfaDisableRequestSchema = z.object({
  password: z.string().min(1, 'Password is required').max(128),
  mfaCode: z.string().length(6, 'MFA code must be 6 digits').optional(),
});

export type MfaDisableRequest = z.infer<typeof mfaDisableRequestSchema>;

// Forgot password request schema
export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

// Reset password request schema
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Reset token is required').max(256),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

// OAuth state request schema
export const oauthStateRequestSchema = z.object({
  provider: z.enum(['google', 'microsoft'], {
    errorMap: () => ({ message: 'Provider must be either "google" or "microsoft"' }),
  }),
});

export type OAuthStateRequest = z.infer<typeof oauthStateRequestSchema>;

// OAuth callback request schema
export const oauthCallbackRequestSchema = z.object({
  code: z.string().min(1, 'Authorization code is required').max(2048, 'Authorization code is too long'),
  codeVerifier: z.string().min(43, 'Code verifier must be at least 43 characters').max(128, 'Code verifier is too long'),
  provider: z.enum(['google', 'microsoft'], {
    errorMap: () => ({ message: 'Provider must be either "google" or "microsoft"' }),
  }),
  redirectUri: z.string().url('Redirect URI must be a valid URL').max(2048).optional(),
  state: z.string().min(1, 'State parameter is required').max(256, 'State parameter is too long'),
});

export type OAuthCallbackRequest = z.infer<typeof oauthCallbackRequestSchema>;

// User profile response schema (for /me endpoint)
export const userProfileResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'interviewer', 'interviewee']),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  organizationId: z.string().uuid().nullable(),
  mfaEnabled: z.boolean(),
  emailVerified: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;
