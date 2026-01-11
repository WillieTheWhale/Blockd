import { useMemo } from 'react'
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { AIDetectionProgressEvent } from '@/types'

interface AIDetectionProgressProps {
  event: AIDetectionProgressEvent
  questionText?: string
  className?: string
}

/**
 * AIDetectionProgress Component
 *
 * Shows real-time progress for AI detection analysis:
 * - Processing status with icon
 * - Progress bar (if available)
 * - Estimated time remaining
 * - Question context
 */
export function AIDetectionProgress({
  event,
  questionText,
  className,
}: AIDetectionProgressProps) {
  const statusConfig = useMemo(() => {
    switch (event.status) {
      case 'started':
        return {
          icon: Clock,
          label: 'Starting analysis...',
          color: 'text-blue-500',
          bgColor: 'bg-blue-50 dark:bg-blue-950',
          borderColor: 'border-blue-200 dark:border-blue-800',
        }
      case 'processing':
        return {
          icon: Loader2,
          label: 'Analyzing response...',
          color: 'text-amber-500',
          bgColor: 'bg-amber-50 dark:bg-amber-950',
          borderColor: 'border-amber-200 dark:border-amber-800',
          animate: true,
        }
      case 'completed':
        return {
          icon: CheckCircle,
          label: 'Analysis complete',
          color: 'text-green-500',
          bgColor: 'bg-green-50 dark:bg-green-950',
          borderColor: 'border-green-200 dark:border-green-800',
        }
      case 'failed':
        return {
          icon: XCircle,
          label: 'Analysis failed',
          color: 'text-red-500',
          bgColor: 'bg-red-50 dark:bg-red-950',
          borderColor: 'border-red-200 dark:border-red-800',
        }
      default:
        return {
          icon: Loader2,
          label: 'Processing...',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          borderColor: 'border-border',
        }
    }
  }, [event.status])

  const estimatedTimeText = useMemo(() => {
    if (!event.estimatedTimeMs) return null
    const seconds = Math.ceil(event.estimatedTimeMs / 1000)
    if (seconds < 60) return `~${seconds}s remaining`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `~${minutes}m ${remainingSeconds}s remaining`
  }, [event.estimatedTimeMs])

  const Icon = statusConfig.icon

  return (
    <Card
      className={cn(
        'overflow-hidden border transition-colors',
        statusConfig.borderColor,
        statusConfig.bgColor,
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`AI detection ${statusConfig.label}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div className={cn('mt-0.5', statusConfig.color)}>
            <Icon
              className={cn('h-5 w-5', statusConfig.animate && 'animate-spin')}
              aria-hidden="true"
            />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Status Label */}
            <div className="flex items-center justify-between">
              <span className={cn('font-medium', statusConfig.color)}>
                {statusConfig.label}
              </span>
              {estimatedTimeText && event.status === 'processing' && (
                <span className="text-xs text-muted-foreground">
                  {estimatedTimeText}
                </span>
              )}
            </div>

            {/* Question Context */}
            {questionText && (
              <p className="line-clamp-1 text-sm text-muted-foreground">
                Q: {questionText}
              </p>
            )}

            {/* Progress Bar */}
            {event.progress !== undefined && event.status === 'processing' && (
              <div className="space-y-1">
                <Progress
                  value={event.progress}
                  className="h-2"
                  aria-label={`Analysis progress: ${event.progress} percent`}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Processing</span>
                  <span>{event.progress}%</span>
                </div>
              </div>
            )}

            {/* Completed/Failed Message */}
            {event.status === 'completed' && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Results are now available below.
              </p>
            )}
            {event.status === 'failed' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Analysis could not be completed. Please try again.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
