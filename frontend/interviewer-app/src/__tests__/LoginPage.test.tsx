import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { LoginPage } from '../pages/LoginPage'

// Mock the auth store
vi.mock('../stores/auth-store', () => ({
  useAuthStore: () => ({
    login: vi.fn().mockResolvedValue({ success: true }),
    isLoading: false,
    mfaRequired: false,
    setMfaRequired: vi.fn(),
  }),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login form with email and password fields', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('displays validation errors for empty fields', async () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )

    const submitButton = screen.getByRole('button', { name: /sign in/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument()
    })
  })

  it('shows OAuth login buttons', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )

    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument()
  })

  it('displays forgot password link', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )

    const forgotPasswordLink = screen.getByText(/forgot password/i)
    expect(forgotPasswordLink).toBeInTheDocument()
    expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password')
  })

  it('displays sign up link', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    )

    const signUpLink = screen.getByText(/sign up/i)
    expect(signUpLink).toBeInTheDocument()
    expect(signUpLink).toHaveAttribute('href', '/register')
  })
})
