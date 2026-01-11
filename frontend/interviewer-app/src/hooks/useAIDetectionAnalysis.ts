import { useMemo } from 'react'
import type {
  AIDetectionResult,
  AIDetectionAggregateStats,
  RiskLevel,
  Question,
} from '@/types'

/**
 * Risk level configuration with colors and labels
 */
export const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  {
    label: string
    color: string
    bgColor: string
    badgeVariant: 'default' | 'secondary' | 'destructive'
    description: string
  }
> = {
  critical: {
    label: 'Critical',
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-950',
    badgeVariant: 'destructive',
    description: 'Strong indicators of AI-generated content',
  },
  high: {
    label: 'High',
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-950',
    badgeVariant: 'destructive',
    description: 'Significant similarity to AI patterns',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-950',
    badgeVariant: 'default',
    description: 'Some AI-like patterns detected',
  },
  low: {
    label: 'Low',
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-950',
    badgeVariant: 'secondary',
    description: 'Minor similarity to AI content',
  },
  minimal: {
    label: 'Minimal',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950',
    badgeVariant: 'secondary',
    description: 'Very low AI detection indicators',
  },
}

/**
 * Get configuration for a risk level
 */
export function getRiskConfig(level: RiskLevel) {
  return RISK_LEVEL_CONFIG[level] || RISK_LEVEL_CONFIG.minimal
}

/**
 * Get similarity score color based on value
 */
export function getSimilarityColor(score: number): string {
  if (score >= 0.8) return '#ef4444' // red
  if (score >= 0.6) return '#f59e0b' // orange
  if (score >= 0.4) return '#eab308' // yellow
  return '#22c55e' // green
}

/**
 * Get confidence color based on value
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-emerald-500'
  if (confidence >= 0.7) return 'text-green-500'
  if (confidence >= 0.5) return 'text-yellow-500'
  return 'text-orange-500'
}

interface UseAIDetectionAnalysisParams {
  results: AIDetectionResult[]
  questions?: Question[]
}

interface UseAIDetectionAnalysisReturn {
  stats: AIDetectionAggregateStats | null
  resultsByQuestion: Map<string, AIDetectionResult[]>
  questionMap: Map<string, Question>
  getQuestionContext: (result: AIDetectionResult) => Question | undefined
  highRiskResults: AIDetectionResult[]
  flaggedResults: AIDetectionResult[]
}

/**
 * Hook for computing AI detection aggregate statistics and mappings
 *
 * @param params - Results and questions to analyze
 * @returns Computed statistics, question mappings, and filtered result sets
 */
export function useAIDetectionAnalysis({
  results,
  questions = [],
}: UseAIDetectionAnalysisParams): UseAIDetectionAnalysisReturn {
  // Build question lookup map
  const questionMap = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions]
  )

  // Group results by question
  const resultsByQuestion = useMemo(() => {
    const map = new Map<string, AIDetectionResult[]>()
    for (const result of results) {
      const existing = map.get(result.questionId) || []
      existing.push(result)
      map.set(result.questionId, existing)
    }
    return map
  }, [results])

  // Calculate aggregate statistics
  const stats = useMemo<AIDetectionAggregateStats | null>(() => {
    if (results.length === 0) return null

    const riskScores = results.map((r) => r.riskScore)
    const confidences = results.map((r) => r.confidence)
    const processingTimes = results
      .map((r) => r.processingTimeMs)
      .filter((t): t is number => t !== undefined)

    const riskDistribution: Record<RiskLevel, number> = {
      minimal: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    }

    for (const result of results) {
      riskDistribution[result.riskLevel]++
    }

    return {
      totalResults: results.length,
      averageRiskScore:
        riskScores.reduce((a, b) => a + b, 0) / riskScores.length,
      averageConfidence:
        confidences.reduce((a, b) => a + b, 0) / confidences.length,
      riskDistribution,
      flaggedCount: results.filter((r) => r.flags.length > 0).length,
      highestRiskScore: Math.max(...riskScores),
      lowestRiskScore: Math.min(...riskScores),
      processingStats: {
        avgTimeMs:
          processingTimes.length > 0
            ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
            : 0,
        totalTimeMs: processingTimes.reduce((a, b) => a + b, 0),
      },
    }
  }, [results])

  // Get question context for a result
  const getQuestionContext = useMemo(
    () => (result: AIDetectionResult) => questionMap.get(result.questionId),
    [questionMap]
  )

  // Filter high risk results
  const highRiskResults = useMemo(
    () =>
      results.filter(
        (r) => r.riskLevel === 'high' || r.riskLevel === 'critical'
      ),
    [results]
  )

  // Filter flagged results
  const flaggedResults = useMemo(
    () => results.filter((r) => r.flags.length > 0),
    [results]
  )

  return {
    stats,
    resultsByQuestion,
    questionMap,
    getQuestionContext,
    highRiskResults,
    flaggedResults,
  }
}
