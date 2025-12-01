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
    it('returns weak for very short simple password', () => {
      // Only lowercase, short = 15 strength (weak)
      const result = calculatePasswordStrength('abc')
      expect(result.label).toBe('weak')
    })

    it('returns strong for complex password', () => {
      // 20+ chars: 40, lowercase: 15, uppercase: 15, number: 15, special: 15 = 100
      const result = calculatePasswordStrength('MySecureP@ssw0rd123!')
      expect(result.label).toBe('strong')
      expect(result.strength).toBeGreaterThan(80)
    })

    it('returns good for password with all character types but short', () => {
      // 'Pass1!' (6 chars): uppercase(15) + lowercase(15) + number(15) + special(15) = 60 → good
      const result = calculatePasswordStrength('Pass1!')
      expect(result.label).toBe('good')
    })

    it('returns fair for password without number or special chars', () => {
      // 'Passaaaa' (8 chars): 8+(20) + lower(15) + upper(15) = 50 → fair (40-59 range)
      const result = calculatePasswordStrength('Passaaaa')
      expect(result.label).toBe('fair')
    })
  })
})
