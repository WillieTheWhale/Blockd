import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Session, Question, CreateSessionFormData, SessionStatus } from '@/types'
import { apiRequest } from '@/lib/api-client'

interface SessionFilters {
  status?: SessionStatus
  search?: string
  dateFrom?: string
  dateTo?: string
  interviewerId?: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface SessionState {
  // Active session state
  currentSession: Session | null
  currentQuestions: Question[]
  currentQuestionIndex: number
  isSessionActive: boolean
  sessionStartTime: number | null
  questionStartTime: number | null

  // Sessions list state
  sessions: Session[]
  filters: SessionFilters
  pagination: Pagination
  isLoading: boolean
  error: string | null
}

interface SessionActions {
  // Active session actions
  setCurrentSession: (session: Session | null) => void
  setCurrentQuestions: (questions: Question[]) => void
  startSession: () => void
  endSession: () => void
  nextQuestion: () => void
  previousQuestion: () => void
  goToQuestion: (index: number) => void
  startQuestionTimer: () => void
  clearSession: () => void

  // Sessions list actions
  fetchSessions: () => Promise<void>
  createSession: (data: CreateSessionFormData) => Promise<{ success: boolean; sessionId?: string }>
  updateSession: (id: string, data: Partial<Session>) => Promise<{ success: boolean }>
  deleteSession: (id: string) => Promise<{ success: boolean }>
  startSessionById: (id: string) => Promise<{ success: boolean }>
  endSessionById: (id: string) => Promise<{ success: boolean }>
  setFilters: (filters: Partial<SessionFilters>) => void
  setPagination: (pagination: Partial<Pagination>) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

type SessionStore = SessionState & SessionActions

const initialState: SessionState = {
  currentSession: null,
  currentQuestions: [],
  currentQuestionIndex: 0,
  isSessionActive: false,
  sessionStartTime: null,
  questionStartTime: null,
  sessions: [],
  filters: {},
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  },
  isLoading: false,
  error: null,
}

export const useSessionStore = create<SessionStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setCurrentSession: (session) =>
        set({
          currentSession: session,
        }),

      setCurrentQuestions: (questions) =>
        set({
          currentQuestions: questions,
          currentQuestionIndex: 0,
        }),

      startSession: () =>
        set({
          isSessionActive: true,
          sessionStartTime: Date.now(),
          questionStartTime: Date.now(),
        }),

      endSession: () =>
        set({
          isSessionActive: false,
          sessionStartTime: null,
          questionStartTime: null,
        }),

      nextQuestion: () =>
        set((state) => {
          const nextIndex = Math.min(state.currentQuestionIndex + 1, state.currentQuestions.length - 1)
          return {
            currentQuestionIndex: nextIndex,
            questionStartTime: Date.now(),
          }
        }),

      previousQuestion: () =>
        set((state) => {
          const prevIndex = Math.max(state.currentQuestionIndex - 1, 0)
          return {
            currentQuestionIndex: prevIndex,
            questionStartTime: Date.now(),
          }
        }),

      goToQuestion: (index) =>
        set({
          currentQuestionIndex: index,
          questionStartTime: Date.now(),
        }),

      startQuestionTimer: () =>
        set({
          questionStartTime: Date.now(),
        }),

      clearSession: () => set(initialState),

      fetchSessions: async () => {
        set({ isLoading: true, error: null })
        try {
          const { filters, pagination } = get()
          const params = new URLSearchParams({
            page: pagination.page.toString(),
            pageSize: pagination.pageSize.toString(),
            ...(filters.status && { status: filters.status }),
            ...(filters.search && { search: filters.search }),
            ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
            ...(filters.dateTo && { dateTo: filters.dateTo }),
            ...(filters.interviewerId && { interviewerId: filters.interviewerId }),
          })

          const response = await apiRequest<{
            data: Session[]
            total: number
            page: number
            pageSize: number
            totalPages: number
          }>('GET', `/api/v1/sessions?${params.toString()}`)

          set({
            sessions: response.data,
            pagination: {
              page: response.page,
              pageSize: response.pageSize,
              total: response.total,
              totalPages: response.totalPages,
            },
            isLoading: false,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch sessions'
          set({ isLoading: false, error: message })
        }
      },

      createSession: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiRequest<{ id: string; session: Session }>(
            'POST',
            '/api/v1/sessions',
            data
          )
          set({ isLoading: false })
          // Refresh sessions list
          await get().fetchSessions()
          return { success: true, sessionId: response.id }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to create session'
          set({ isLoading: false, error: message })
          return { success: false }
        }
      },

      updateSession: async (id, data) => {
        set({ isLoading: true, error: null })
        try {
          await apiRequest<Session>('PUT', `/api/v1/sessions/${id}`, data)
          set({ isLoading: false })
          // Refresh sessions list
          await get().fetchSessions()
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update session'
          set({ isLoading: false, error: message })
          return { success: false }
        }
      },

      deleteSession: async (id) => {
        set({ isLoading: true, error: null })
        try {
          await apiRequest('DELETE', `/api/v1/sessions/${id}`)
          set({ isLoading: false })
          // Refresh sessions list
          await get().fetchSessions()
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to delete session'
          set({ isLoading: false, error: message })
          return { success: false }
        }
      },

      startSessionById: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiRequest<Session>('POST', `/api/v1/sessions/${id}/start`)
          set({ isLoading: false, currentSession: response })
          // Refresh sessions list
          await get().fetchSessions()
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start session'
          set({ isLoading: false, error: message })
          return { success: false }
        }
      },

      endSessionById: async (id) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiRequest<Session>('POST', `/api/v1/sessions/${id}/end`)
          set({ isLoading: false, currentSession: response })
          // Refresh sessions list
          await get().fetchSessions()
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to end session'
          set({ isLoading: false, error: message })
          return { success: false }
        }
      },

      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
          pagination: { ...state.pagination, page: 1 }, // Reset to first page
        })),

      setPagination: (pagination) =>
        set((state) => ({
          pagination: { ...state.pagination, ...pagination },
        })),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'session-store',
    }
  )
)
