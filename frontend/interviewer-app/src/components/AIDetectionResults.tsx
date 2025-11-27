import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Brain, TrendingUp, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import type { AIDetectionResult, SecurityEventSeverity } from '@/types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface AIDetectionResultsProps {
  result: AIDetectionResult
  className?: string
}

/**
 * Get risk level color
 */
const getRiskColor = (level: string): string => {
  switch (level) {
    case 'critical':
      return 'text-red-500'
    case 'high':
      return 'text-orange-500'
    case 'medium':
      return 'text-yellow-500'
    case 'low':
    default:
      return 'text-green-500'
  }
}

/**
 * Get risk level background color
 */
const getRiskBgColor = (level: string): string => {
  switch (level) {
    case 'critical':
      return 'bg-red-100 dark:bg-red-950'
    case 'high':
      return 'bg-orange-100 dark:bg-orange-950'
    case 'medium':
      return 'bg-yellow-100 dark:bg-yellow-950'
    case 'low':
    default:
      return 'bg-green-100 dark:bg-green-950'
  }
}

/**
 * Get badge variant for risk level
 */
const getRiskBadgeVariant = (level: string): 'default' | 'secondary' | 'destructive' => {
  switch (level) {
    case 'critical':
    case 'high':
      return 'destructive'
    case 'medium':
      return 'default'
    case 'low':
    default:
      return 'secondary'
  }
}

/**
 * Get severity badge variant
 */
const getSeverityBadgeVariant = (severity: SecurityEventSeverity): 'default' | 'secondary' | 'destructive' => {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'destructive'
    case 'medium':
      return 'default'
    case 'low':
    default:
      return 'secondary'
  }
}

/**
 * Get color for similarity score
 */
const getSimilarityColor = (score: number): string => {
  if (score >= 0.8) return '#ef4444' // red
  if (score >= 0.6) return '#f59e0b' // orange
  if (score >= 0.4) return '#eab308' // yellow
  return '#22c55e' // green
}

/**
 * AIDetectionResults Component
 *
 * Features:
 * - Risk score gauge (0-100% visualization)
 * - Risk level badge (Low/Medium/High/Critical)
 * - Similarity scores per LLM (GPT-4, Claude, Gemini) with progress bars
 * - Flags list with descriptions
 * - Perplexity score display
 * - N-gram overlap visualization
 * - Recommendation text
 * - Expand/collapse detailed analysis
 * - Color-coded based on risk level
 */
export function AIDetectionResults({ result, className }: AIDetectionResultsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Prepare similarity scores for chart
  const similarityData = [
    { name: 'GPT-4', score: result.similarityScores.gpt4 * 100 },
    { name: 'Claude', score: result.similarityScores.claude * 100 },
    { name: 'Gemini', score: result.similarityScores.gemini * 100 },
  ]

  // Calculate average similarity
  const avgSimilarity =
    (result.similarityScores.gpt4 + result.similarityScores.claude + result.similarityScores.gemini) / 3

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className={cn('pb-3', getRiskBgColor(result.riskLevel))}>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Detection Analysis
            </CardTitle>
            <CardDescription>Automated plagiarism and AI content detection</CardDescription>
          </div>
          <Badge variant={getRiskBadgeVariant(result.riskLevel)} className="text-sm">
            {result.riskLevel.toUpperCase()} RISK
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Risk Score Gauge */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn('h-5 w-5', getRiskColor(result.riskLevel))} />
              <span className="font-semibold">Risk Score</span>
            </div>
            <span className={cn('text-3xl font-bold', getRiskColor(result.riskLevel))}>
              {result.riskScore}%
            </span>
          </div>
          <Progress
            value={result.riskScore}
            className={cn(
              'h-3',
              result.riskScore >= 80 && '[&>*]:bg-red-500',
              result.riskScore >= 60 && result.riskScore < 80 && '[&>*]:bg-orange-500',
              result.riskScore >= 40 && result.riskScore < 60 && '[&>*]:bg-yellow-500',
              result.riskScore < 40 && '[&>*]:bg-green-500'
            )}
          />
        </div>

        {/* Recommendation Alert */}
        {result.recommendation && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{result.recommendation}</AlertDescription>
          </Alert>
        )}

        {/* LLM Similarity Scores */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="font-semibold">LLM Similarity Analysis</span>
          </div>

          {/* Progress Bars */}
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>GPT-4</span>
                <span className="font-semibold">{(result.similarityScores.gpt4 * 100).toFixed(1)}%</span>
              </div>
              <Progress
                value={result.similarityScores.gpt4 * 100}
                className="h-2"
                style={{
                  // @ts-ignore
                  '--progress-color': getSimilarityColor(result.similarityScores.gpt4),
                }}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Claude</span>
                <span className="font-semibold">
                  {(result.similarityScores.claude * 100).toFixed(1)}%
                </span>
              </div>
              <Progress
                value={result.similarityScores.claude * 100}
                className="h-2"
                style={{
                  // @ts-ignore
                  '--progress-color': getSimilarityColor(result.similarityScores.claude),
                }}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Gemini</span>
                <span className="font-semibold">
                  {(result.similarityScores.gemini * 100).toFixed(1)}%
                </span>
              </div>
              <Progress
                value={result.similarityScores.gemini * 100}
                className="h-2"
                style={{
                  // @ts-ignore
                  '--progress-color': getSimilarityColor(result.similarityScores.gemini),
                }}
              />
            </div>
          </div>

          {/* Chart */}
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={similarityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                />
                <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                  {similarityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getSimilarityColor(entry.score / 100)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
          <div>
            <div className="text-sm text-muted-foreground">Perplexity Score</div>
            <div className="mt-1 text-2xl font-bold">{result.perplexityScore.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">N-gram Overlap</div>
            <div className="mt-1 text-2xl font-bold">{(result.ngramOverlap * 100).toFixed(1)}%</div>
          </div>
        </div>

        {/* Flags */}
        {result.flags.length > 0 && (
          <div className="space-y-3">
            <div className="font-semibold">Detection Flags</div>
            <div className="space-y-2">
              {result.flags.map((flag, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                >
                  <AlertTriangle
                    className={cn(
                      'mt-0.5 h-4 w-4 flex-shrink-0',
                      flag.severity === 'critical' && 'text-red-500',
                      flag.severity === 'high' && 'text-orange-500',
                      flag.severity === 'medium' && 'text-yellow-500',
                      flag.severity === 'low' && 'text-blue-500'
                    )}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{flag.type.replace(/_/g, ' ')}</span>
                      <Badge variant={getSeverityBadgeVariant(flag.severity)} className="text-xs">
                        {flag.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{flag.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Analysis (Expandable) */}
        {result.detailedAnalysis && (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Hide Detailed Analysis
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Show Detailed Analysis
                </>
              )}
            </Button>

            {isExpanded && (
              <div className="rounded-lg border bg-muted p-4 text-sm">
                <pre className="whitespace-pre-wrap font-mono text-xs">
                  {result.detailedAnalysis}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-muted-foreground">
          Analysis completed at {new Date(result.createdAt).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  )
}
