import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Session, Question } from '@/types'

interface SessionState {
  currentSession: Session | null
  currentQuestions: Question[]
  currentQuestionIndex: number
  isSessionActive: boolean
  sessionStartTime: number | null
  questionStartTime: number | null
}

interface SessionActions {
  setCurrentSession: (session: Session | null) => void
  setCurrentQuestions: (questions: Question[]) => void
  startSession: () => void
  endSession: () => void
  nextQuestion: () => void
  previousQuestion: () => void
  goToQuestion: (index: number) => void
  startQuestionTimer: () => void
  clearSession: () => void
}

type SessionStore = SessionState & SessionActions

const initialState: SessionState = {
  currentSession: null,
  currentQuestions: [],
  currentQuestionIndex: 0,
  isSessionActive: false,
  sessionStartTime: null,
  questionStartTime: null,
}

export const useSessionStore = create<SessionStore>()(
  devtools(
    (set) => ({
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
    }),
    {
      name: 'session-store',
    }
  )
)
