import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { User } from '@/types'
import { clearTokens, setTokens } from '@/lib/auth'
import { STORAGE_KEYS } from '@/lib/constants'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  setUser: (user: User) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  logout: () => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

type AuthStore = AuthState & AuthActions

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setUser: (user) =>
          set({
            user,
            isAuthenticated: true,
            error: null,
          }),

        setTokens: (accessToken, refreshToken) => {
          setTokens({ accessToken, refreshToken })
          set({ isAuthenticated: true })
        },

        logout: () => {
          clearTokens()
          set(initialState)
        },

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        clearError: () => set({ error: null }),
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
