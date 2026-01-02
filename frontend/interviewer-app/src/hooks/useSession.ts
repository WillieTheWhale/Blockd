import { useSessionStore } from '@/stores/session-store'

/**
 * Custom hook for accessing session state and actions
 */
export function useSession() {
  const currentSession = useSessionStore((state) => state.currentSession)
  const currentQuestions = useSessionStore((state) => state.currentQuestions)
  const currentQuestionIndex = useSessionStore((state) => state.currentQuestionIndex)
  const isSessionActive = useSessionStore((state) => state.isSessionActive)
  const sessionStartTime = useSessionStore((state) => state.sessionStartTime)
  const questionStartTime = useSessionStore((state) => state.questionStartTime)
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession)
  const setCurrentQuestions = useSessionStore((state) => state.setCurrentQuestions)
  const startSession = useSessionStore((state) => state.startSession)
  const endSession = useSessionStore((state) => state.endSession)
  const nextQuestion = useSessionStore((state) => state.nextQuestion)
  const previousQuestion = useSessionStore((state) => state.previousQuestion)
  const goToQuestion = useSessionStore((state) => state.goToQuestion)
  const startQuestionTimer = useSessionStore((state) => state.startQuestionTimer)
  const clearSession = useSessionStore((state) => state.clearSession)

  const currentQuestion = currentQuestions[currentQuestionIndex]

  return {
    currentSession,
    currentQuestions,
    currentQuestion,
    currentQuestionIndex,
    isSessionActive,
    sessionStartTime,
    questionStartTime,
    setCurrentSession,
    setCurrentQuestions,
    startSession,
    endSession,
    nextQuestion,
    previousQuestion,
    goToQuestion,
    startQuestionTimer,
    clearSession,
  }
}
