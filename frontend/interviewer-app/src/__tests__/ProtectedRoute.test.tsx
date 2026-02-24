import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { ProtectedRoute } from '../components/ProtectedRoute'

// Mock auth store
const mockLogout = vi.fn()
const mockUseAuthStore = vi.fn()

vi.mock('../stores/auth-store', () => ({
  useAuthStore: () => mockUseAuthStore(),
}))

// Mock auth utilities
const mockGetAccessToken = vi.fn()
const mockIsTokenExpired = vi.fn()

vi.mock('../lib/auth', () => ({
  getAccessToken: () => mockGetAccessToken(),
  isTokenExpired: (token: string) => mockIsTokenExpired(token),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogout.mockResolvedValue(undefined)
  })

  it('renders children when authenticated with valid token', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      logout: mockLogout,
    })
    mockGetAccessToken.mockReturnValue('valid-token')
    mockIsTokenExpired.mockReturnValue(false)

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('redirects to login when not authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      logout: mockLogout,
    })
    mockGetAccessToken.mockReturnValue(null)
    mockIsTokenExpired.mockReturnValue(true)

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('redirects to login when token is expired', async () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      logout: mockLogout,
    })
    mockGetAccessToken.mockReturnValue('expired-token')
    mockIsTokenExpired.mockReturnValue(true)

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('triggers logout when store thinks authenticated but token is expired', async () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      logout: mockLogout,
    })
    mockGetAccessToken.mockReturnValue('expired-token')
    mockIsTokenExpired.mockReturnValue(true)

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('handles missing token correctly', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      logout: mockLogout,
    })
    mockGetAccessToken.mockReturnValue(null)
    mockIsTokenExpired.mockReturnValue(true)

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    // Should not trigger logout when already not authenticated
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
