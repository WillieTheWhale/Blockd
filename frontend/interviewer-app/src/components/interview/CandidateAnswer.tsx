import { useState, useEffect } from 'react'
import { Clock, MessageSquare, Code, CheckCircle2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Question, Answer } from '@/types'

interface CandidateAnswerProps {
  question: Question | null
  answer: Answer | null
  isWaitingForAnswer: boolean
  questionSentAt: number | null
  className?: string
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function CandidateAnswer({
  question,
  answer,
  isWaitingForAnswer,
  questionSentAt,
  className,
}: CandidateAnswerProps) {
  const [elapsedTime, setElapsedTime] = useState(0)

  // Timer effect
  useEffect(() => {
    if (!questionSentAt || answer) {
      setElapsedTime(0)
      return
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - questionSentAt) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [questionSentAt, answer])

  if (!question) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-8">
          <p className="text-muted-foreground">Select a question to view answers</p>
        </CardContent>
      </Card>
    )
  }

  const isCodeQuestion = question.type === 'coding'
  const isMultipleChoice = question.type === 'multiple_choice'

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <MessageSquare className="h-4 w-4" />
            Candidate Answer
          </CardTitle>
          {questionSentAt && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(elapsedTime)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!isWaitingForAnswer && !answer ? (
          // Question not sent yet
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Send the question to the candidate to receive their answer
            </p>
          </div>
        ) : isWaitingForAnswer && !answer ? (
          // Waiting for answer
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-8 text-center">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="font-medium">Waiting for candidate response...</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Question sent {formatTime(elapsedTime)} ago
            </p>
          </div>
        ) : answer ? (
          // Answer received
          <div className="space-y-3">
            {/* Answer Status */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Answer Received
              </Badge>
              {answer.score !== undefined && (
                <Badge
                  className={cn(
                    'text-xs',
                    answer.score >= 80
                      ? 'bg-green-100 text-green-800'
                      : answer.score >= 50
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  )}
                >
                  Score: {answer.score}%
                </Badge>
              )}
            </div>

            {/* Answer Content */}
            {isCodeQuestion ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Code className="h-3 w-3" />
                  Code Response
                </div>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-50">
                  <code>{answer.content}</code>
                </pre>
              </div>
            ) : isMultipleChoice && question.options ? (
              <div className="space-y-2">
                {question.options.map((option, idx) => {
                  const isSelected = answer.content === option
                  const isCorrect = question.correctAnswer === option
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'rounded border px-3 py-2 text-sm',
                        isSelected && isCorrect
                          ? 'border-green-500 bg-green-50 dark:bg-green-950'
                          : isSelected && !isCorrect
                            ? 'border-red-500 bg-red-50 dark:bg-red-950'
                            : isCorrect
                              ? 'border-green-300 bg-green-50/50'
                              : 'border-border'
                      )}
                    >
                      <span className="mr-2 font-medium">{String.fromCharCode(65 + idx)}.</span>
                      {option}
                      {isSelected && (
                        <Badge className="ml-2 text-xs" variant={isCorrect ? 'default' : 'destructive'}>
                          Selected
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="whitespace-pre-wrap text-sm">{answer.content}</p>
              </div>
            )}

            {/* Feedback if available */}
            {answer.feedback && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">AI Feedback</p>
                <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">{answer.feedback}</p>
              </div>
            )}

            {/* Timing info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Response time: {formatTime(elapsedTime)}
              </span>
              <span>
                Submitted at {new Date(answer.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
