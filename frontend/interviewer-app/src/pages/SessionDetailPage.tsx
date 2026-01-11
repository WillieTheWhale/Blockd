import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QUERY_KEYS, API_ENDPOINTS } from '@/lib/constants'
import apiClient from '@/lib/api-client'
import {
  ArrowLeft,
  FileText,
  Play,
  Square,
  Eye,
  Download,
  Clock,
  User,
  Calendar,
  Video,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { VideoPlayer } from '@/components/VideoPlayer'
import { SecurityEventsDashboard } from '@/components/SecurityEventsDashboard'
import { GazeHeatmap } from '@/components/GazeHeatmap'
import { AIDetectionResults } from '@/components/AIDetectionResults'
import { RealtimeChat } from '@/components/RealtimeChat'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useRealtimeStore } from '@/stores/realtime-store'
import { toast } from 'sonner'
import type { Session, Question, AIDetectionResult } from '@/types'
import { format } from 'date-fns'

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const [showGazeHeatmap, setShowGazeHeatmap] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const { connectionStatus: _connectionStatus } = useRealtimeStore()
  const { subscribe, isConnected } = useWebSocket({ sessionId: id ?? '' })

  // Fetch session data
  const { data: session, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS.DETAIL(id!),
    queryFn: async () => {
      const response = await apiClient.get<Session>(API_ENDPOINTS.SESSIONS.GET(id!))
      return response.data
    },
    enabled: !!id,
  })

  // Fetch questions
  const { data: questions = [] } = useQuery({
    queryKey: QUERY_KEYS.QUESTIONS.LIST(id!),
    queryFn: async () => {
      const response = await apiClient.get<Question[]>(API_ENDPOINTS.QUESTIONS.LIST(id!))
      return response.data
    },
    enabled: !!id,
  })

  // Fetch AI detection results
  const {
    data: aiDetectionResults = [],
    isLoading: isLoadingAIResults,
    error: aiResultsError,
  } = useQuery({
    queryKey: QUERY_KEYS.AI_DETECTION.LIST(id!),
    queryFn: async () => {
      const response = await apiClient.get<AIDetectionResult[]>(
        API_ENDPOINTS.AI_DETECTION.LIST(id!)
      )
      return response.data
    },
    enabled: !!id,
  })

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(API_ENDPOINTS.SESSIONS.START(id!))
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.DETAIL(id!) })
      toast.success('Session started successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start session')
    },
  })

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(API_ENDPOINTS.SESSIONS.END(id!))
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.DETAIL(id!) })
      toast.success('Session ended successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to end session')
    },
  })

  // Subscribe to real-time session updates
  useEffect(() => {
    if (!id) return

    const unsubscribeStarted = subscribe('session:started', () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.DETAIL(id) })
      toast.info('Session has started')
    })

    const unsubscribeEnded = subscribe('session:ended', () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.DETAIL(id) })
      toast.info('Session has ended')
    })

    const unsubscribeQuestion = subscribe('question:asked', () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.QUESTIONS.LIST(id) })
    })

    const unsubscribeAnswer = subscribe('answer:received', () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.QUESTIONS.LIST(id) })
    })

    const unsubscribeAIDetection = subscribe('ai:detection:complete', () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.AI_DETECTION.LIST(id) })
    })

    return () => {
      unsubscribeStarted()
      unsubscribeEnded()
      unsubscribeQuestion()
      unsubscribeAnswer()
      unsubscribeAIDetection()
    }
  }, [id, subscribe, queryClient])

  // Handle export report
  const handleExportReport = async () => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.REPORTS.DOWNLOAD(id!), {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `session-${id}-report.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Report downloaded successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download report'
      toast.error(message)
    }
  }

  // Calculate session duration
  const getSessionDuration = (): string => {
    if (!session?.startedAt) return 'Not started'
    const start = new Date(session.startedAt)
    const end = session.endedAt ? new Date(session.endedAt) : new Date()
    const diff = end.getTime() - start.getTime()
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Session not found</p>
        <Link to="/sessions">
          <Button className="mt-4">Back to Sessions</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/sessions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{session.title}</h1>
            <Badge
              variant={
                session.status === 'completed'
                  ? 'default'
                  : session.status === 'in_progress'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {session.status}
            </Badge>
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
          {session.description && (
            <p className="text-muted-foreground mt-2">{session.description}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {session.status === 'pending' && (
            <>
              <Link to={`/sessions/${session.id}/live`}>
                <Button variant="outline">
                  <Video className="mr-2 h-4 w-4" />
                  Go Live
                </Button>
              </Link>
              <Button onClick={() => startSessionMutation.mutate()} disabled={startSessionMutation.isPending}>
                <Play className="mr-2 h-4 w-4" />
                Start Session
              </Button>
            </>
          )}
          {session.status === 'in_progress' && (
            <>
              <Link to={`/sessions/${session.id}/live`}>
                <Button>
                  <Video className="mr-2 h-4 w-4" />
                  Go Live
                </Button>
              </Link>
              <Button
                variant="destructive"
                onClick={() => endSessionMutation.mutate()}
                disabled={endSessionMutation.isPending}
              >
                <Square className="mr-2 h-4 w-4" />
                End Session
              </Button>
            </>
          )}
          {session.status === 'completed' && (
            <>
              <Button onClick={handleExportReport}>
                <Download className="mr-2 h-4 w-4" />
                Export Report
              </Button>
              <Link to={`/reports/${session.id}`}>
                <Button variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  View Report
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="recording">Recording</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-12 gap-6">
            {/* Left Column - Metadata */}
            <div className="col-span-3 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Session Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground">Candidate</p>
                        <p className="text-sm font-medium">{session.candidateName}</p>
                        <p className="text-xs text-muted-foreground">{session.candidateEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground">Scheduled</p>
                        <p className="text-sm">{format(new Date(session.scheduledAt), 'PPp')}</p>
                      </div>
                    </div>
                    {session.startedAt && (
                      <div className="flex items-start gap-3">
                        <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-muted-foreground">Duration</p>
                          <p className="text-sm">{getSessionDuration()}</p>
                        </div>
                      </div>
                    )}
                    {session.position && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Position</p>
                        <p className="text-sm">{session.position}</p>
                      </div>
                    )}
                    {session.department && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Department</p>
                        <p className="text-sm">{session.department}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Chat */}
              <RealtimeChat sessionId={id!} maxHeight="400px" />
            </div>

            {/* Center Column - Video */}
            <div className="col-span-6 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Live Video</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowGazeHeatmap(!showGazeHeatmap)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {showGazeHeatmap ? 'Hide' : 'Show'} Gaze Heatmap
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <VideoPlayer
                      sessionId={id!}
                      isProducer={false}
                      showControls
                      showStats
                      isRecording={session.status === 'in_progress'}
                    />
                    {showGazeHeatmap && (
                      <div className="absolute inset-0 pointer-events-none">
                        <GazeHeatmap
                          sessionId={id!}
                          overlayVideo
                          isRecorded={session.status === 'completed'}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Questions Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle>Questions & Answers</CardTitle>
                  <CardDescription>Interview timeline</CardDescription>
                </CardHeader>
                <CardContent>
                  {questions.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      No questions yet
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {questions.map((question, index) => (
                        <div key={question.id} className="border-l-2 border-primary pl-4">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline">{index + 1}</Badge>
                            <div className="flex-1">
                              <p className="font-medium">{question.content}</p>
                              <div className="mt-1 flex items-center gap-2">
                                <Badge variant="secondary">{question.type}</Badge>
                                <Badge variant="outline">{question.difficulty}</Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Security Events */}
            <div className="col-span-3">
              <SecurityEventsDashboard sessionId={id!} maxHeight="800px" />
            </div>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <SecurityEventsDashboard sessionId={id!} maxHeight="600px" className="w-full" />
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          {isLoadingAIResults ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">Loading AI analysis results...</p>
                </div>
              </CardContent>
            </Card>
          ) : aiResultsError ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center gap-3 text-destructive">
                  <AlertCircle className="h-8 w-8" />
                  <p>Failed to load AI analysis results</p>
                  <p className="text-sm text-muted-foreground">
                    {aiResultsError instanceof Error ? aiResultsError.message : 'Unknown error'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : aiDetectionResults.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">
                  AI analysis results will appear here after answers are submitted
                </p>
              </CardContent>
            </Card>
          ) : (
            aiDetectionResults.map((result) => (
              <AIDetectionResults key={result.id} result={result} />
            ))
          )}
        </TabsContent>

        {/* Recording Tab */}
        <TabsContent value="recording">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Video Recording</CardTitle>
              </CardHeader>
              <CardContent>
                <VideoPlayer
                  sessionId={id!}
                  isProducer={false}
                  showControls
                  isRecording={false}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Gaze Tracking Playback</CardTitle>
              </CardHeader>
              <CardContent>
                <GazeHeatmap sessionId={id!} isRecorded />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
