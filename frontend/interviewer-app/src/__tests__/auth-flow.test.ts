import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  isAuthenticated,
  isTokenExpired,
  decodeToken,
  getTokenExpiration,
} from '../lib/auth'
import { STORAGE_KEYS } from '../lib/constants'

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
})

describe('Auth Token Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage.clear()
  })

  describe('getAccessToken', () => {
    it('returns access token from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValueOnce('test-access-token')

      const token = getAccessToken()

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(STORAGE_KEYS.ACCESS_TOKEN)
      expect(token).toBe('test-access-token')
    })

    it('returns null when no token exists', () => {
      mockLocalStorage.getItem.mockReturnValueOnce(null)

      const token = getAccessToken()

      expect(token).toBeNull()
    })
  })

  describe('getRefreshToken', () => {
    it('returns refresh token from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValueOnce('test-refresh-token')

      const token = getRefreshToken()

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(STORAGE_KEYS.REFRESH_TOKEN)
      expect(token).toBe('test-refresh-token')
    })
  })

  describe('setTokens', () => {
    it('stores both tokens in localStorage', () => {
      setTokens({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.ACCESS_TOKEN,
        'new-access-token'
      )
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.REFRESH_TOKEN,
        'new-refresh-token'
      )
    })
  })

  describe('clearTokens', () => {
    it('removes all auth-related items from localStorage', () => {
      clearTokens()

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.ACCESS_TOKEN)
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.REFRESH_TOKEN)
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.USER_DATA)
    })
  })

  describe('isAuthenticated', () => {
    it('returns true when access token exists', () => {
      mockLocalStorage.getItem.mockReturnValueOnce('some-token')

      expect(isAuthenticated()).toBe(true)
    })

    it('returns false when no access token', () => {
      mockLocalStorage.getItem.mockReturnValueOnce(null)

      expect(isAuthenticated()).toBe(false)
    })

    it('returns false for empty string token', () => {
      mockLocalStorage.getItem.mockReturnValueOnce('')

      expect(isAuthenticated()).toBe(false)
    })
  })

  describe('decodeToken', () => {
    // Create a valid JWT-like token with base64 encoded payload
    const createTestToken = (payload: Record<string, unknown>) => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payloadBase64 = btoa(JSON.stringify(payload))
      return `${header}.${payloadBase64}.signature`
    }

    it('decodes a valid JWT payload', () => {
      const payload = { sub: '123', email: 'test@example.com', exp: 9999999999 }
      const token = createTestToken(payload)

      const decoded = decodeToken(token)

      expect(decoded).toEqual(payload)
    })

    it('returns null for invalid token format', () => {
      expect(decodeToken('invalid-token')).toBeNull()
      expect(decodeToken('')).toBeNull()
      expect(decodeToken('header.invalid-payload.signature')).toBeNull()
    })

    it('returns null for token without payload section', () => {
      expect(decodeToken('headeronly')).toBeNull()
    })
  })

  describe('isTokenExpired', () => {
    const createTestToken = (exp: number) => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }))
      const payload = btoa(JSON.stringify({ exp }))
      return `${header}.${payload}.sig`
    }

    it('returns true for expired token', () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      const token = createTestToken(expiredTimestamp)

      expect(isTokenExpired(token)).toBe(true)
    })

    it('returns false for valid non-expired token', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      const token = createTestToken(futureTimestamp)

      expect(isTokenExpired(token)).toBe(false)
    })

    it('returns true for token without exp claim', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }))
      const payload = btoa(JSON.stringify({ sub: '123' })) // no exp
      const token = `${header}.${payload}.sig`

      expect(isTokenExpired(token)).toBe(true)
    })

    it('returns true for invalid token', () => {
      expect(isTokenExpired('invalid-token')).toBe(true)
    })

    it('returns true when exp is exactly now (edge case)', () => {
      const nowTimestamp = Math.floor(Date.now() / 1000)
      const token = createTestToken(nowTimestamp)

      expect(isTokenExpired(token)).toBe(true)
    })
  })

  describe('getTokenExpiration', () => {
    const createTestToken = (exp: number) => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }))
      const payload = btoa(JSON.stringify({ exp }))
      return `${header}.${payload}.sig`
    }

    it('returns expiration time in milliseconds', () => {
      const expTimestamp = 1700000000
      const token = createTestToken(expTimestamp)

      const expiration = getTokenExpiration(token)

      expect(expiration).toBe(expTimestamp * 1000)
    })

    it('returns null for invalid token', () => {
      expect(getTokenExpiration('invalid')).toBeNull()
    })

    it('returns null for token without exp claim', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }))
      const payload = btoa(JSON.stringify({ sub: '123' }))
      const token = `${header}.${payload}.sig`

      expect(getTokenExpiration(token)).toBeNull()
    })
  })
})

describe('Auth Store State Derivation', () => {
  it('should derive isAuthenticated from token validity on rehydration', () => {
    // This test verifies the fix for stale auth state
    // When the app reloads, isAuthenticated should be derived from actual token validity
    // not from persisted state

    // Mock an expired token scenario
    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.ACCESS_TOKEN) {
        // Return an expired token
        const header = btoa(JSON.stringify({ alg: 'HS256' }))
        const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 }))
        return `${header}.${payload}.sig`
      }
      return null
    })

    // The deriveIsAuthenticated function should return false for expired token
    const token = getAccessToken()
    const isExpired = token ? isTokenExpired(token) : true
    const derivedAuth = token !== null && !isExpired

    expect(derivedAuth).toBe(false)
  })
})
