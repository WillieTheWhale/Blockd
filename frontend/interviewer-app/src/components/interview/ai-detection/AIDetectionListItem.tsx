import { useMemo } from 'react'
import { AlertTriangle, Flag, Clock, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getRiskConfig, getConfidenceColor } from '@/hooks/useAIDetectionAnalysis'
import type { AIDetectionResult, Question } from '@/types'

interface AIDetectionListItemProps {
  result: AIDetectionResult
  question?: Question
  isSelected?: boolean
  onClick?: () => void
  className?: string
}

/**
 * AIDetectionListItem Component
 *
 * Compact list item for AI detection results showing:
 * - Risk level badge with color
 * - Risk score progress bar
 * - Question context (if provided)
 * - Flags indicator
 * - Timestamp
 */
export function AIDetectionListItem({
  result,
  question,
  isSelected = false,
  onClick,
  className,
}: AIDetectionListItemProps) {
  const riskConfig = useMemo(() => getRiskConfig(result.riskLevel), [result.riskLevel])
  const confidenceColorClass = useMemo(
    () => getConfidenceColor(result.confidence),
    [result.confidence]
  )

  const formattedDate = useMemo(() => {
    const date = new Date(result.createdAt)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [result.createdAt])

  const getRiskProgressColor = (score: number): string => {
    if (score >= 80) return '[&>*]:bg-red-500'
    if (score >= 60) return '[&>*]:bg-orange-500'
    if (score >= 40) return '[&>*]:bg-yellow-500'
    return '[&>*]:bg-green-500'
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isSelected && 'ring-2 ring-primary',
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      aria-selected={isSelected}
      aria-label={`AI detection result: ${riskConfig.label} risk, ${result.riskScore.toFixed(0)}% score`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left side - Main content */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Risk badge and flags */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={riskConfig.badgeVariant} className="gap-1">
                {(result.riskLevel === 'high' || result.riskLevel === 'critical') && (
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                )}
                {riskConfig.label}
              </Badge>
              {result.flags.length > 0 && (
                <Badge variant="outline" className="gap-1 text-orange-500">
                  <Flag className="h-3 w-3" aria-hidden="true" />
                  {result.flags.length} {result.flags.length === 1 ? 'flag' : 'flags'}
                </Badge>
              )}
            </div>

            {/* Question context */}
            {question && (
              <p
                className="line-clamp-2 text-sm text-muted-foreground"
                title={question.content}
              >
                Q: {question.content}
              </p>
            )}
            {!question && result.questionText && (
              <p
                className="line-clamp-2 text-sm text-muted-foreground"
                title={result.questionText}
              >
                Q: {result.questionText}
              </p>
            )}

            {/* Score and confidence */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Risk Score</span>
                  <span className="font-medium">{result.riskScore.toFixed(1)}%</span>
                </div>
                <Progress
                  value={result.riskScore}
                  className={cn('h-1.5', getRiskProgressColor(result.riskScore))}
                  aria-label={`Risk score: ${result.riskScore.toFixed(1)} percent`}
                />
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Confidence</div>
                <div className={cn('text-sm font-medium', confidenceColorClass)}>
                  {(result.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <time dateTime={result.createdAt}>{formattedDate}</time>
              {result.processingTimeMs !== undefined && (
                <span className="ml-2">
                  ({(result.processingTimeMs / 1000).toFixed(1)}s processing)
                </span>
              )}
            </div>
          </div>

          {/* Right side - Arrow indicator */}
          <div className="flex h-full items-center">
            <ChevronRight
              className={cn(
                'h-5 w-5 text-muted-foreground transition-transform',
                isSelected && 'rotate-90'
              )}
              aria-hidden="true"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
