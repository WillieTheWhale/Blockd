/**
 * Authentication Validation Schemas
 */

import { z } from 'zod';

// Register request schema
export const registerRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'interviewer', 'interviewee']).default('interviewee'),
  organizationId: z.string().uuid().optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// Login request schema
export const loginRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().length(6).optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Refresh token request schema
export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
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
