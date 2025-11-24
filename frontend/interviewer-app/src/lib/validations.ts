/**
 * Form validation schemas using Zod
 */

import { z } from 'zod'
import { USER_ROLES } from './constants'

/**
 * Login validation schema
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional(),
  mfaCode: z.string().length(6, 'MFA code must be 6 digits').optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>

/**
 * Registration validation schema
 */
export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be less than 100 characters'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
    role: z.enum([USER_ROLES.INTERVIEWER, USER_ROLES.ADMIN, USER_ROLES.CANDIDATE]),
    organization: z.string().optional(),
    newOrganization: z.string().optional(),
    acceptTerms: z.boolean().refine((val) => val === true, {
      message: 'You must accept the terms and conditions',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type RegisterFormData = z.infer<typeof registerSchema>

/**
 * Create session validation schema
 */
export const createSessionSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title must be less than 200 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  candidateName: z.string().min(2, 'Candidate name is required'),
  candidateEmail: z.string().email('Invalid email address'),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date',
  }),
  duration: z.number().min(15, 'Duration must be at least 15 minutes').max(240, 'Duration must be less than 4 hours'),
  position: z.string().optional(),
  department: z.string().optional(),
  questions: z
    .array(
      z.object({
        content: z.string().min(10, 'Question must be at least 10 characters'),
        type: z.enum(['multiple_choice', 'free_text', 'coding', 'behavioral']),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        options: z.array(z.string()).optional(),
        correctAnswer: z.string().optional(),
      })
    )
    .min(1, 'At least one question is required'),
  settings: z.object({
    enableRecording: z.boolean().default(true),
    enableAiDetection: z.boolean().default(true),
    enableEyeTracking: z.boolean().default(false),
    sendEmailInvitation: z.boolean().default(true),
  }),
})

export type CreateSessionFormData = z.infer<typeof createSessionSchema>

/**
 * Profile update validation schema
 */
export const profileUpdateSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Invalid email address'),
  avatar: z.string().url('Invalid URL').optional(),
})

export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>

/**
 * Password change validation schema
 */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(8, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>

/**
 * MFA setup validation schema
 */
export const mfaSetupSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
})

export type MfaSetupFormData = z.infer<typeof mfaSetupSchema>

/**
 * Forgot password validation schema
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

/**
 * Reset password validation schema
 */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

/**
 * Password strength calculator
 */
export function calculatePasswordStrength(password: string): {
  strength: number
  label: 'weak' | 'fair' | 'good' | 'strong'
  color: string
} {
  let strength = 0

  if (password.length >= 8) strength += 20
  if (password.length >= 12) strength += 10
  if (password.length >= 16) strength += 10
  if (/[a-z]/.test(password)) strength += 15
  if (/[A-Z]/.test(password)) strength += 15
  if (/[0-9]/.test(password)) strength += 15
  if (/[^A-Za-z0-9]/.test(password)) strength += 15

  let label: 'weak' | 'fair' | 'good' | 'strong'
  let color: string

  if (strength < 40) {
    label = 'weak'
    color = 'bg-red-500'
  } else if (strength < 60) {
    label = 'fair'
    color = 'bg-orange-500'
  } else if (strength < 80) {
    label = 'good'
    color = 'bg-yellow-500'
  } else {
    label = 'strong'
    color = 'bg-green-500'
  }

  return { strength, label, color }
}
