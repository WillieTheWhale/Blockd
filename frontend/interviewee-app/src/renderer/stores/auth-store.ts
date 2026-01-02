/**
 * Auth Store
 * Manages authentication state using Zustand
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Actions
      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await window.electronAPI.auth.login(email, password);

          if (!result.success) {
            throw new Error(result.error || 'Login failed');
          }

          const { user } = result.data as { user: User };

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: (error as Error).message,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, fullName: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await window.electronAPI.auth.register(email, password, fullName);

          if (!result.success) {
            throw new Error(result.error || 'Registration failed');
          }

          const { user } = result.data as { user: User };

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: (error as Error).message,
          });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });

        try {
          await window.electronAPI.auth.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      checkAuth: async () => {
        set({ isLoading: true });

        try {
          const authResult = await window.electronAPI.auth.isAuthenticated();

          if (authResult.success && authResult.data) {
            const userResult = await window.electronAPI.auth.getUser();

            if (userResult.success && userResult.data) {
              set({
                user: userResult.data as User,
                isAuthenticated: true,
                isLoading: false,
              });
              return;
            }
          }

          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        } catch (error) {
          console.error('Auth check error:', error);
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'blockd-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
