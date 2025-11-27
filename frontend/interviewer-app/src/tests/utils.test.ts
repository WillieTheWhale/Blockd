import { describe, it, expect } from 'vitest'
import { cn, formatDate, formatDuration, capitalize, getInitials } from '@/lib/utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('should handle conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    })
  })

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-01-01')
      expect(formatDate(date)).toBe('January 1, 2024')
    })
  })

  describe('formatDuration', () => {
    it('should format seconds only', () => {
      expect(formatDuration(30)).toBe('30s')
    })

    it('should format minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1m 30s')
    })

    it('should format hours, minutes and seconds', () => {
      expect(formatDuration(3665)).toBe('1h 1m 5s')
    })
  })

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello')
    })

    it('should lowercase the rest', () => {
      expect(capitalize('hELLO')).toBe('Hello')
    })
  })

  describe('getInitials', () => {
    it('should get initials from full name', () => {
      expect(getInitials('John Doe')).toBe('JD')
    })

    it('should handle single name', () => {
      expect(getInitials('John')).toBe('JO')
    })

    it('should limit to 2 characters', () => {
      expect(getInitials('John Paul Doe')).toBe('JP')
    })
  })
})
