import { describe, it, expect } from 'vitest'
import {
  loginSchema,
  registerSchema,
  createSessionSchema,
  profileUpdateSchema,
  passwordChangeSchema,
  calculatePasswordStrength,
} from '../lib/validations'

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('validates correct login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'Password123!',
      }

      expect(() => loginSchema.parse(validData)).not.toThrow()
    })

    it('rejects invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'Password123!',
      }

      expect(() => loginSchema.parse(invalidData)).toThrow()
    })

    it('rejects short password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'short',
      }

      expect(() => loginSchema.parse(invalidData)).toThrow()
    })
  })

  describe('registerSchema', () => {
    it('validates correct registration data', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'interviewer' as const,
        acceptTerms: true,
      }

      expect(() => registerSchema.parse(validData)).not.toThrow()
    })

    it('rejects password without uppercase', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123!',
        confirmPassword: 'password123!',
        role: 'interviewer' as const,
        acceptTerms: true,
      }

      expect(() => registerSchema.parse(invalidData)).toThrow()
    })

    it('rejects mismatched passwords', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!',
        confirmPassword: 'Different123!',
        role: 'interviewer' as const,
        acceptTerms: true,
      }

      expect(() => registerSchema.parse(invalidData)).toThrow()
    })

    it('rejects when terms not accepted', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'interviewer' as const,
        acceptTerms: false,
      }

      expect(() => registerSchema.parse(invalidData)).toThrow()
    })
  })

  describe('createSessionSchema', () => {
    it('validates correct session data', () => {
      const validData = {
        title: 'Frontend Interview',
        candidateName: 'Jane Doe',
        candidateEmail: 'jane@example.com',
        scheduledAt: '2024-12-01T10:00:00',
        duration: 60,
        questions: [
          {
            content: 'What is React?',
            type: 'free_text' as const,
            difficulty: 'medium' as const,
          },
        ],
        settings: {
          enableRecording: true,
          enableAiDetection: true,
          enableEyeTracking: false,
          sendEmailInvitation: true,
        },
      }

      expect(() => createSessionSchema.parse(validData)).not.toThrow()
    })

    it('rejects session without questions', () => {
      const invalidData = {
        title: 'Frontend Interview',
        candidateName: 'Jane Doe',
        candidateEmail: 'jane@example.com',
        scheduledAt: '2024-12-01T10:00:00',
        duration: 60,
        questions: [],
        settings: {
          enableRecording: true,
          enableAiDetection: true,
          enableEyeTracking: false,
          sendEmailInvitation: true,
        },
      }

      expect(() => createSessionSchema.parse(invalidData)).toThrow()
    })
  })

  describe('calculatePasswordStrength', () => {
    it('returns weak for short password', () => {
      const result = calculatePasswordStrength('Pass1!')
      expect(result.label).toBe('weak')
    })

    it('returns strong for complex password', () => {
      const result = calculatePasswordStrength('MySecureP@ssw0rd123!')
      expect(result.label).toBe('strong')
      expect(result.strength).toBeGreaterThan(80)
    })

    it('returns fair for moderate password', () => {
      const result = calculatePasswordStrength('Password1!')
      expect(result.label).toBe('fair')
    })
  })
})
