import { useState } from 'react'
import { ChevronLeft, ChevronRight, Send, Check, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Question } from '@/types'

interface QuestionPresenterProps {
  questions: Question[]
  currentIndex: number
  sentQuestionIds: Set<string>
  onPrevious: () => void
  onNext: () => void
  onSendQuestion: (question: Question) => void
  className?: string
}

const getTypeColor = (type: string): string => {
  switch (type) {
    case 'coding':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    case 'behavioral':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'multiple_choice':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'free_text':
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

const getDifficultyColor = (difficulty: string): string => {
  switch (difficulty) {
    case 'hard':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'easy':
    default:
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  }
}

const formatQuestionType = (type: string): string => {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

export function QuestionPresenter({
  questions,
  currentIndex,
  sentQuestionIds,
  onPrevious,
  onNext,
  onSendQuestion,
  className,
}: QuestionPresenterProps) {
  const [isSending, setIsSending] = useState(false)
  const currentQuestion = questions[currentIndex]
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === questions.length - 1
  const isQuestionSent = currentQuestion ? sentQuestionIds.has(currentQuestion.id) : false

  const handleSendQuestion = async () => {
    if (!currentQuestion || isQuestionSent) return
    setIsSending(true)
    try {
      await onSendQuestion(currentQuestion)
    } finally {
      setIsSending(false)
    }
  }

  if (!currentQuestion) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-8">
          <p className="text-muted-foreground">No questions available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            Question {currentIndex + 1} of {questions.length}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs', getTypeColor(currentQuestion.type))}>
              {formatQuestionType(currentQuestion.type)}
            </Badge>
            <Badge className={cn('text-xs', getDifficultyColor(currentQuestion.difficulty))}>
              {currentQuestion.difficulty}
            </Badge>
            {isQuestionSent && (
              <Badge variant="outline" className="gap-1 text-xs text-green-600">
                <Check className="h-3 w-3" />
                Sent
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Question Content */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="whitespace-pre-wrap text-sm">{currentQuestion.content}</p>
        </div>

        {/* Multiple Choice Options */}
        {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Options:</p>
            <div className="space-y-1">
              {currentQuestion.options.map((option, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'rounded border px-3 py-2 text-sm',
                    currentQuestion.correctAnswer === option
                      ? 'border-green-500 bg-green-50 dark:bg-green-950'
                      : 'border-border'
                  )}
                >
                  <span className="mr-2 font-medium">{String.fromCharCode(65 + idx)}.</span>
                  {option}
                  {currentQuestion.correctAnswer === option && (
                    <Check className="ml-2 inline h-4 w-4 text-green-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation and Send */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrevious}
              disabled={isFirstQuestion}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={isLastQuestion}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <Button
            onClick={handleSendQuestion}
            disabled={isQuestionSent || isSending}
            className={cn(
              isQuestionSent && 'bg-green-600 hover:bg-green-600'
            )}
          >
            {isSending ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : isQuestionSent ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Sent to Candidate
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send to Candidate
              </>
            )}
          </Button>
        </div>

        {/* Question Progress */}
        <div className="flex gap-1 pt-2">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                idx === currentIndex
                  ? 'bg-primary'
                  : sentQuestionIds.has(q.id)
                    ? 'bg-green-500'
                    : 'bg-muted'
              )}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
