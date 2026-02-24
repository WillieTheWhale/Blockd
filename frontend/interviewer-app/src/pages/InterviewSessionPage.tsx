import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { VideoPlayer } from '@/components/VideoPlayer'
import { GazeHeatmap } from '@/components/GazeHeatmap'
import { RealtimeChat } from '@/components/RealtimeChat'
import { QuestionPresenter } from '@/components/interview/QuestionPresenter'
import { CandidateAnswer } from '@/components/interview/CandidateAnswer'
import { LiveSecurityFeed } from '@/components/interview/LiveSecurityFeed'
import { SessionControls } from '@/components/interview/SessionControls'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useSessionStore } from '@/stores/session-store'
import { apiRequest } from '@/lib/api-client'
import { API_ENDPOINTS, QUERY_KEYS } from '@/lib/constants'
import type { Session, Question, Answer, AIDetectionResult, SecurityEvent } from '@/types'

/**
 * Validate session ID format
 * Session IDs should be UUIDs or alphanumeric strings
 */
function isValidSessionId(id: string | undefined): id is string {
  if (!id || typeof id !== 'string') {
    return false
  }

  // Trim and check length
  const trimmed = id.trim()
  if (trimmed.length === 0 || trimmed.length > 128) {
    return false
  }

  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Alphanumeric format with optional hyphens and underscores
  const alphanumericRegex = /^[a-zA-Z0-9_-]+$/

  return uuidRegex.test(trimmed) || alphanumericRegex.test(trimmed)
}

export function InterviewSessionPage() {
  const { id: rawId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Validate session ID to prevent injection attacks
  const id = isValidSessionId(rawId) ? rawId : undefined

  // Local state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [sentQuestionIds, setSentQuestionIds] = useState<Set<string>>(new Set())
  const [questionSentAt, setQuestionSentAt] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map())
  const [latestAIResult, setLatestAIResult] = useState<AIDetectionResult | null>(null)
  const [showGazeOverlay, setShowGazeOverlay] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  // Stores
  const { securityEvents, addSecurityEvent } = useRealtimeStore()
  const { startSessionById, endSessionById } = useSessionStore()

  // WebSocket - only connect when we have an id
  const { isConnected, emit, subscribe } = useWebSocket({ sessionId: id ?? '' })

  // Fetch session data
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS.DETAIL(id!),
    queryFn: async () => {
      const response = await apiRequest<Session>('GET', API_ENDPOINTS.SESSIONS.GET(id!))
      return response
    },
    enabled: !!id,
  })

  // Fetch questions
  const { data: questions = [], isLoading: questionsLoading } = useQuery({
    queryKey: QUERY_KEYS.QUESTIONS.LIST(id!),
    queryFn: async () => {
      const response = await apiRequest<Question[]>('GET', API_ENDPOINTS.QUESTIONS.LIST(id!))
      return response
    },
    enabled: !!id,
  })

  const currentQuestion = questions[currentQuestionIndex] || null
  const currentAnswer = currentQuestion ? answers.get(currentQuestion.id) || null : null
  const isWaitingForAnswer = currentQuestion ? sentQuestionIds.has(currentQuestion.id) && !currentAnswer : false
  const sessionEvents = securityEvents.filter((e) => e.sessionId === id)

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!id) return

    const unsubscribes: (() => void)[] = []

    // Answer received
    unsubscribes.push(
      subscribe<{ questionId: string; answer: Answer }>('answer:received', (data) => {
        setAnswers((prev) => new Map(prev).set(data.questionId, data.answer))
        toast.success('Answer received from candidate')
      })
    )

    // Security alert
    unsubscribes.push(
      subscribe<SecurityEvent>('security:alert', (event) => {
        addSecurityEvent(event)
        if (event.severity === 'critical' || event.severity === 'high') {
          toast.warning(`Security Alert: ${event.description}`, {
            duration: 5000,
          })
        }
      })
    )

    // AI detection result
    unsubscribes.push(
      subscribe<AIDetectionResult>('ai:detection:complete', (result) => {
        setLatestAIResult(result)
      })
    )

    // Session started
    unsubscribes.push(
      subscribe('session:started', () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.DETAIL(id) })
        setIsRecording(true)
        toast.success('Session started')
      })
    )

    // Session ended
    unsubscribes.push(
      subscribe('session:ended', () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.DETAIL(id) })
        setIsRecording(false)
        toast.info('Session ended')
      })
    )

    // Participant joined
    unsubscribes.push(
      subscribe<{ userId: string; userName: string }>('participant:joined', (data) => {
        toast.success(`${data.userName} joined the session`)
      })
    )

    // Participant left
    unsubscribes.push(
      subscribe<{ userId: string; userName: string }>('participant:left', (data) => {
        toast.info(`${data.userName} left the session`)
      })
    )

    return () => {
      unsubscribes.forEach((unsub) => unsub())
    }
  }, [id, subscribe, addSecurityEvent, queryClient])

  // Send question to candidate
  const handleSendQuestion = useCallback(
    async (question: Question) => {
      if (!id) return

      emit('question:asked', {
        sessionId: id,
        questionId: question.id,
        question: {
          id: question.id,
          type: question.type,
          content: question.content,
          options: question.options,
          difficulty: question.difficulty,
        },
      })

      setSentQuestionIds((prev) => new Set(prev).add(question.id))
      setQuestionSentAt(Date.now())
      toast.success('Question sent to candidate')
    },
    [id, emit]
  )

  // Navigation
  const handlePreviousQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))
    setQuestionSentAt(null)
  }, [])

  const handleNextQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))
    setQuestionSentAt(null)
  }, [questions.length])

  // Session controls
  const handleStartSession = useCallback(async () => {
    if (!id) return
    const result = await startSessionById(id)
    if (result.success) {
      emit('session:started', { sessionId: id })
    }
  }, [id, startSessionById, emit])

  const handleEndSession = useCallback(async () => {
    if (!id) return
    const result = await endSessionById(id)
    if (result.success) {
      emit('session:ended', { sessionId: id })
      navigate(`/sessions/${id}`)
    }
  }, [id, endSessionById, emit, navigate])

  // Loading state
  if (sessionLoading || questionsLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  // Handle invalid session ID
  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <h2 className="text-xl font-semibold">Invalid session ID</h2>
        <p className="text-muted-foreground mt-2">The session ID in the URL is invalid or missing.</p>
        <Button onClick={() => navigate('/sessions')} className="mt-4">
          Back to Sessions
        </Button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <h2 className="text-xl font-semibold">Session not found</h2>
        <Button onClick={() => navigate('/sessions')} className="mt-4">
          Back to Sessions
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/sessions/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{session.title}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {session.candidateName}
              <Badge variant="outline" className="text-xs">
                {session.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        </div>

        <SessionControls
          sessionStatus={session.status}
          isConnected={isConnected}
          isRecording={isRecording}
          onStartSession={handleStartSession}
          onEndSession={handleEndSession}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-2 gap-4 p-4">
          {/* Left Column - Video & Monitoring */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            {/* Video Player with optional Gaze Overlay */}
            <div className="relative">
              <VideoPlayer
                sessionId={id!}
                className="aspect-video w-full rounded-lg"
              />
              {showGazeOverlay && (
                <div className="absolute inset-0">
                  <GazeHeatmap
                    sessionId={id!}
                    width={640}
                    height={360}
                    className="h-full w-full"
                  />
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="absolute bottom-2 right-2"
                onClick={() => setShowGazeOverlay(!showGazeOverlay)}
              >
                {showGazeOverlay ? 'Hide' : 'Show'} Gaze
              </Button>
            </div>

            {/* Security Events */}
            <LiveSecurityFeed events={sessionEvents} />

            {/* AI Detection - Compact */}
            {latestAIResult && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">AI Detection</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        latestAIResult.riskLevel === 'critical' || latestAIResult.riskLevel === 'high'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {latestAIResult.riskScore}% Risk
                    </Badge>
                    <Badge variant="outline">
                      {(latestAIResult.confidence * 100).toFixed(0)}% Confidence
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Questions & Chat */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            {/* Question Presenter */}
            <QuestionPresenter
              questions={questions}
              currentIndex={currentQuestionIndex}
              sentQuestionIds={sentQuestionIds}
              onPrevious={handlePreviousQuestion}
              onNext={handleNextQuestion}
              onSendQuestion={handleSendQuestion}
            />

            {/* Candidate Answer */}
            <CandidateAnswer
              question={currentQuestion}
              answer={currentAnswer}
              isWaitingForAnswer={isWaitingForAnswer}
              questionSentAt={questionSentAt}
            />

            {/* Chat */}
            <RealtimeChat
              sessionId={id!}
              className="flex-1 min-h-[200px]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
