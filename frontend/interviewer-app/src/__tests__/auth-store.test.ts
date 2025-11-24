import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuthStore } from '../stores/auth-store'

// Mock API client
vi.mock('../lib/api-client', () => ({
  apiRequest: vi.fn(),
}))

// Mock auth utilities
vi.mock('../lib/auth', () => ({
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(),
  isTokenExpired: vi.fn(),
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { result } = renderHook(() => useAuthStore())
    act(() => {
      result.current.logout()
    })
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => useAuthStore())

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.mfaRequired).toBe(false)
  })

  it('sets user and isAuthenticated when setUser is called', () => {
    const { result } = renderHook(() => useAuthStore())
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'interviewer' as const,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }

    act(() => {
      result.current.setUser(mockUser)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('clears state when logout is called', async () => {
    const { result } = renderHook(() => useAuthStore())
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'interviewer' as const,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }

    act(() => {
      result.current.setUser(mockUser)
    })

    expect(result.current.isAuthenticated).toBe(true)

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('sets loading state correctly', () => {
    const { result } = renderHook(() => useAuthStore())

    act(() => {
      result.current.setLoading(true)
    })

    expect(result.current.isLoading).toBe(true)

    act(() => {
      result.current.setLoading(false)
    })

    expect(result.current.isLoading).toBe(false)
  })

  it('sets and clears error correctly', () => {
    const { result } = renderHook(() => useAuthStore())
    const errorMessage = 'Test error'

    act(() => {
      result.current.setError(errorMessage)
    })

    expect(result.current.error).toBe(errorMessage)

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})
