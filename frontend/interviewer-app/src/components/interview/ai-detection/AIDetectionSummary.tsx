import { useMemo } from 'react'
import { AlertTriangle, CheckCircle, TrendingUp, Clock, Flag, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useAIDetectionAnalysis, getRiskConfig } from '@/hooks/useAIDetectionAnalysis'
import type { AIDetectionResult, Question, RiskLevel } from '@/types'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from 'recharts'

interface AIDetectionSummaryProps {
  results: AIDetectionResult[]
  questions?: Question[]
  className?: string
}

/**
 * AIDetectionSummary Component
 *
 * Displays aggregate statistics for AI detection results including:
 * - Total analyses and averages
 * - Risk distribution chart
 * - High-risk alerts
 * - Processing time stats
 */
export function AIDetectionSummary({
  results,
  questions = [],
  className,
}: AIDetectionSummaryProps) {
  const { stats, highRiskResults, flaggedResults } = useAIDetectionAnalysis({
    results,
    questions,
  })

  // Prepare risk distribution data for chart
  const distributionData = useMemo(() => {
    if (!stats) return []
    return (['minimal', 'low', 'medium', 'high', 'critical'] as RiskLevel[]).map(
      (level) => ({
        level,
        count: stats.riskDistribution[level],
        color: getRiskConfig(level).color.replace('text-', ''),
      })
    )
  }, [stats])

  if (!stats) {
    return null
  }

  const getRiskProgressColor = (score: number): string => {
    if (score >= 80) return '[&>*]:bg-red-500'
    if (score >= 60) return '[&>*]:bg-orange-500'
    if (score >= 40) return '[&>*]:bg-yellow-500'
    return '[&>*]:bg-green-500'
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Analysis Summary
            </CardTitle>
            <CardDescription>
              Overview of {stats.totalResults} AI detection{' '}
              {stats.totalResults === 1 ? 'result' : 'results'}
            </CardDescription>
          </div>
          {highRiskResults.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {highRiskResults.length} High Risk
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Average Risk Score */}
          <div
            className="rounded-lg border p-3"
            role="group"
            aria-label="Average risk score"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              Avg Risk
            </div>
            <div className="mt-1 text-2xl font-bold">
              {stats.averageRiskScore.toFixed(1)}%
            </div>
            <Progress
              value={stats.averageRiskScore}
              className={cn('mt-2 h-1', getRiskProgressColor(stats.averageRiskScore))}
              aria-label={`Average risk score: ${stats.averageRiskScore.toFixed(1)} percent`}
            />
          </div>

          {/* Average Confidence */}
          <div
            className="rounded-lg border p-3"
            role="group"
            aria-label="Average confidence"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              Avg Confidence
            </div>
            <div className="mt-1 text-2xl font-bold">
              {(stats.averageConfidence * 100).toFixed(0)}%
            </div>
            <Progress
              value={stats.averageConfidence * 100}
              className="mt-2 h-1 [&>*]:bg-blue-500"
              aria-label={`Average confidence: ${(stats.averageConfidence * 100).toFixed(0)} percent`}
            />
          </div>

          {/* Flagged Count */}
          <div
            className="rounded-lg border p-3"
            role="group"
            aria-label="Flagged results"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Flag className="h-4 w-4" aria-hidden="true" />
              Flagged
            </div>
            <div className="mt-1 text-2xl font-bold">
              {stats.flaggedCount}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {stats.totalResults}
              </span>
            </div>
          </div>

          {/* Processing Time */}
          <div
            className="rounded-lg border p-3"
            role="group"
            aria-label="Average processing time"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Avg Time
            </div>
            <div className="mt-1 text-2xl font-bold">
              {stats.processingStats.avgTimeMs > 0
                ? `${(stats.processingStats.avgTimeMs / 1000).toFixed(1)}s`
                : 'N/A'}
            </div>
          </div>
        </div>

        {/* Risk Distribution Chart */}
        <div>
          <h4 className="mb-3 text-sm font-medium text-muted-foreground">
            Risk Distribution
          </h4>
          <div className="h-32" role="img" aria-label="Risk distribution bar chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="level"
                  width={60}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: string) =>
                    value.charAt(0).toUpperCase() + value.slice(1)
                  }
                />
                <Tooltip
                  formatter={(value: number) => [`${value} results`, 'Count']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {distributionData.map((entry, index) => {
                    const config = getRiskConfig(entry.level)
                    const colorMap: Record<string, string> = {
                      'text-red-500': '#ef4444',
                      'text-orange-500': '#f97316',
                      'text-yellow-500': '#eab308',
                      'text-green-500': '#22c55e',
                      'text-emerald-500': '#10b981',
                    }
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={colorMap[config.color] || '#6b7280'}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* High Risk Alert */}
        {highRiskResults.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 text-red-500"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                  {highRiskResults.length} high-risk{' '}
                  {highRiskResults.length === 1 ? 'result' : 'results'} detected
                </p>
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                  Review answers with high or critical risk levels for potential AI
                  assistance.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Score Range */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Score range: {stats.lowestRiskScore.toFixed(0)}% -{' '}
            {stats.highestRiskScore.toFixed(0)}%
          </span>
          {flaggedResults.length > 0 && (
            <span>
              {flaggedResults.length} {flaggedResults.length === 1 ? 'answer' : 'answers'}{' '}
              flagged
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
