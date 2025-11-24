import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { User, LoginCredentials, RegisterData, ProfileUpdateFormData } from '@/types'
import { clearTokens, setTokens as setAuthTokens } from '@/lib/auth'
import { STORAGE_KEYS } from '@/lib/constants'
import { apiRequest } from '@/lib/api-client'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  mfaRequired: boolean
  mfaSetupData: { qrCode?: string; secret?: string } | null
}

interface AuthActions {
  setUser: (user: User) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  logout: () => Promise<void>
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; requiresMfa?: boolean }>
  register: (data: RegisterData) => Promise<{ success: boolean }>
  updateProfile: (data: ProfileUpdateFormData) => Promise<{ success: boolean }>
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean }>
  setupMfa: () => Promise<{ success: boolean; qrCode?: string; secret?: string }>
  verifyMfa: (code: string) => Promise<{ success: boolean }>
  disableMfa: (code: string) => Promise<{ success: boolean }>
  forgotPassword: (email: string) => Promise<{ success: boolean }>
  resetPassword: (token: string, password: string) => Promise<{ success: boolean }>
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  setMfaRequired: (required: boolean) => void
}

type AuthStore = AuthState & AuthActions

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  mfaRequired: false,
  mfaSetupData: null,
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setUser: (user) =>
          set({
            user,
            isAuthenticated: true,
            error: null,
          }),

        setTokens: (accessToken, refreshToken) => {
          setAuthTokens({ accessToken, refreshToken })
          set({ isAuthenticated: true })
        },

        login: async (credentials) => {
          set({ isLoading: true, error: null })
          try {
            const response = await apiRequest<{
              user: User
              accessToken: string
              refreshToken: string
              requiresMfa?: boolean
            }>('POST', '/api/v1/auth/login', credentials)

            if (response.requiresMfa) {
              set({ isLoading: false, mfaRequired: true })
              return { success: false, requiresMfa: true }
            }

            const { user, accessToken, refreshToken } = response
            get().setUser(user)
            get().setTokens(accessToken, refreshToken)
            set({ isLoading: false })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        register: async (data) => {
          set({ isLoading: true, error: null })
          try {
            const response = await apiRequest<{
              user: User
              accessToken: string
              refreshToken: string
            }>('POST', '/api/v1/auth/register', data)

            const { user, accessToken, refreshToken } = response
            get().setUser(user)
            get().setTokens(accessToken, refreshToken)
            set({ isLoading: false })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Registration failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        updateProfile: async (data) => {
          set({ isLoading: true, error: null })
          try {
            const user = await apiRequest<User>('PUT', '/api/v1/users/me', data)
            set({ user, isLoading: false })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Profile update failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        changePassword: async (currentPassword, newPassword) => {
          set({ isLoading: true, error: null })
          try {
            await apiRequest('POST', '/api/v1/auth/change-password', {
              currentPassword,
              newPassword,
            })
            set({ isLoading: false })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Password change failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        setupMfa: async () => {
          set({ isLoading: true, error: null })
          try {
            const response = await apiRequest<{ qrCode: string; secret: string }>(
              'POST',
              '/api/v1/auth/mfa/setup'
            )
            set({ isLoading: false, mfaSetupData: response })
            return { success: true, qrCode: response.qrCode, secret: response.secret }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'MFA setup failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        verifyMfa: async (code) => {
          set({ isLoading: true, error: null })
          try {
            const response = await apiRequest<{ user: User }>('POST', '/api/v1/auth/mfa/verify', {
              code,
            })
            set({ isLoading: false, user: response.user, mfaSetupData: null })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'MFA verification failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        disableMfa: async (code) => {
          set({ isLoading: true, error: null })
          try {
            const response = await apiRequest<{ user: User }>('POST', '/api/v1/auth/mfa/disable', {
              code,
            })
            set({ isLoading: false, user: response.user })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'MFA disable failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        forgotPassword: async (email) => {
          set({ isLoading: true, error: null })
          try {
            await apiRequest('POST', '/api/v1/auth/forgot-password', { email })
            set({ isLoading: false })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Password reset request failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        resetPassword: async (token, password) => {
          set({ isLoading: true, error: null })
          try {
            await apiRequest('POST', '/api/v1/auth/reset-password', { token, password })
            set({ isLoading: false })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Password reset failed'
            set({ isLoading: false, error: message })
            return { success: false }
          }
        },

        logout: async () => {
          set({ isLoading: true })
          try {
            await apiRequest('POST', '/api/v1/auth/logout', {})
          } catch {
            // Ignore logout errors
          } finally {
            clearTokens()
            set({ ...initialState })
          }
        },

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        clearError: () => set({ error: null }),

        setMfaRequired: (required) => set({ mfaRequired: required }),
      }),
      {
        name: STORAGE_KEYS.USER_DATA,
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    {
      name: 'auth-store',
    }
  )
)
