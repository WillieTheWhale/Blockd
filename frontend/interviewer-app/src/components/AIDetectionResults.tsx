import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Brain, TrendingUp, AlertCircle, Clock, Target, FileText, BarChart3, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { AIDetectionResult, SecurityEventSeverity } from '@/types'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'

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
      return 'text-green-500'
    case 'minimal':
    default:
      return 'text-emerald-500'
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
      return 'bg-green-100 dark:bg-green-950'
    case 'minimal':
    default:
      return 'bg-emerald-100 dark:bg-emerald-950'
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
    case 'minimal':
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
 * Get confidence color
 */
const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.9) return 'text-emerald-500'
  if (confidence >= 0.7) return 'text-green-500'
  if (confidence >= 0.5) return 'text-yellow-500'
  return 'text-orange-500'
}

/**
 * AIDetectionResults Component
 *
 * Enhanced component with tabs for:
 * - Overview: Risk score, confidence, recommendation, flags
 * - Similarity: LLM similarity scores with bar chart
 * - Stylometry: Writing pattern analysis with radar chart
 * - Comparison: Side-by-side answer comparison (candidate vs AI-generated)
 */
export function AIDetectionResults({ result, className }: AIDetectionResultsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Prepare similarity scores for chart
  const similarityData = [
    { name: 'GPT-4', score: result.similarityScores.gpt4 * 100 },
    { name: 'Claude', score: result.similarityScores.claude * 100 },
    { name: 'Gemini', score: result.similarityScores.gemini * 100 },
    ...(result.similarityScores.llama ? [{ name: 'Llama', score: result.similarityScores.llama * 100 }] : []),
  ]

  // Prepare stylometric data for radar chart
  const stylometricData = result.stylometricAnalysis ? [
    {
      metric: 'Vocabulary',
      value: Math.min(result.stylometricAnalysis.vocabularyRichness * 100, 100),
      fullMark: 100,
    },
    {
      metric: 'Sentence Length',
      value: Math.min((result.stylometricAnalysis.avgSentenceLength / 30) * 100, 100),
      fullMark: 100,
    },
    {
      metric: 'Punctuation',
      value: Math.min(result.stylometricAnalysis.punctuationDensity * 100, 100),
      fullMark: 100,
    },
    ...(result.stylometricAnalysis.capitalizationRatio !== undefined ? [{
      metric: 'Capitalization',
      value: Math.min(result.stylometricAnalysis.capitalizationRatio * 100, 100),
      fullMark: 100,
    }] : []),
    ...(result.stylometricAnalysis.fillerWordRatio !== undefined ? [{
      metric: 'Filler Words',
      value: Math.min(result.stylometricAnalysis.fillerWordRatio * 1000, 100),
      fullMark: 100,
    }] : []),
  ] : []

  const hasAnswerComparison = result.candidateAnswer && result.aiGeneratedAnswers

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
          <div className="flex items-center gap-2">
            <Badge variant={getRiskBadgeVariant(result.riskLevel)} className="text-sm">
              {result.riskLevel.toUpperCase()} RISK
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="similarity" className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              <span className="hidden sm:inline">Similarity</span>
            </TabsTrigger>
            <TabsTrigger value="stylometry" className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span className="hidden sm:inline">Style</span>
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex items-center gap-1" disabled={!hasAnswerComparison}>
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">Compare</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 pt-4">
            {/* Risk Score and Confidence */}
            <div className="grid grid-cols-2 gap-4">
              {/* Risk Score */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={cn('h-4 w-4', getRiskColor(result.riskLevel))} />
                    <span className="text-sm font-medium">Risk Score</span>
                  </div>
                  <span className={cn('text-2xl font-bold', getRiskColor(result.riskLevel))}>
                    {result.riskScore}%
                  </span>
                </div>
                <Progress
                  value={result.riskScore}
                  className={cn(
                    'h-2',
                    result.riskScore >= 80 && '[&>*]:bg-red-500',
                    result.riskScore >= 60 && result.riskScore < 80 && '[&>*]:bg-orange-500',
                    result.riskScore >= 40 && result.riskScore < 60 && '[&>*]:bg-yellow-500',
                    result.riskScore < 40 && '[&>*]:bg-green-500'
                  )}
                />
              </div>

              {/* Confidence */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className={cn('h-4 w-4', getConfidenceColor(result.confidence))} />
                    <span className="text-sm font-medium">Confidence</span>
                  </div>
                  <span className={cn('text-2xl font-bold', getConfidenceColor(result.confidence))}>
                    {(result.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress
                  value={result.confidence * 100}
                  className="h-2 [&>*]:bg-blue-500"
                />
              </div>
            </div>

            {/* Recommendation Alert */}
            {result.recommendation && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{result.recommendation}</AlertDescription>
              </Alert>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 rounded-lg border p-4">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Max Similarity</div>
                <div className={cn('mt-1 text-lg font-bold', getSimilarityColor(result.similarityScores.max) === '#ef4444' ? 'text-red-500' : getSimilarityColor(result.similarityScores.max) === '#f59e0b' ? 'text-orange-500' : 'text-green-500')}>
                  {(result.similarityScores.max * 100).toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Perplexity</div>
                <div className="mt-1 text-lg font-bold">{result.perplexityScore.toFixed(1)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">N-gram Match</div>
                <div className="mt-1 text-lg font-bold">
                  {((result.ngramOverlap.trigram + result.ngramOverlap.fourgram) / 2 * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Flags */}
            {result.flags.length > 0 && (
              <div className="space-y-3">
                <div className="font-semibold">Detection Flags ({result.flags.length})</div>
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

            {/* Processing Time */}
            {result.processingTimeMs && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Processed in {result.processingTimeMs}ms
              </div>
            )}
          </TabsContent>

          {/* Similarity Tab */}
          <TabsContent value="similarity" className="space-y-6 pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="font-semibold">LLM Similarity Analysis</span>
            </div>

            {/* Similarity Summary */}
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
              <div>
                <div className="text-sm text-muted-foreground">Maximum Similarity</div>
                <div className={cn('mt-1 text-2xl font-bold', getRiskColor(result.riskLevel))}>
                  {(result.similarityScores.max * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Average Similarity</div>
                <div className="mt-1 text-2xl font-bold">
                  {(result.similarityScores.avg * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-3">
              {[
                { name: 'GPT-4', score: result.similarityScores.gpt4 },
                { name: 'Claude', score: result.similarityScores.claude },
                { name: 'Gemini', score: result.similarityScores.gemini },
                ...(result.similarityScores.llama ? [{ name: 'Llama', score: result.similarityScores.llama }] : []),
              ].map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{item.name}</span>
                    <span className="font-semibold">{(item.score * 100).toFixed(1)}%</span>
                  </div>
                  <Progress
                    value={item.score * 100}
                    className="h-2"
                    style={{
                      // @ts-expect-error CSS custom property for progress color
                      '--progress-color': getSimilarityColor(item.score),
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="h-48">
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

            {/* N-gram Analysis */}
            <div className="space-y-3">
              <div className="font-semibold">N-gram Overlap Analysis</div>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                <div>
                  <div className="text-sm text-muted-foreground">Trigram Overlap</div>
                  <div className="mt-1 text-xl font-bold">
                    {(result.ngramOverlap.trigram * 100).toFixed(1)}%
                  </div>
                  <Progress value={result.ngramOverlap.trigram * 100} className="mt-2 h-1" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">4-gram Overlap</div>
                  <div className="mt-1 text-xl font-bold">
                    {(result.ngramOverlap.fourgram * 100).toFixed(1)}%
                  </div>
                  <Progress value={result.ngramOverlap.fourgram * 100} className="mt-2 h-1" />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Stylometry Tab */}
          <TabsContent value="stylometry" className="space-y-6 pt-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold">Writing Style Analysis</span>
            </div>

            {result.stylometricAnalysis ? (
              <>
                {/* Radar Chart */}
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={stylometricData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" className="text-xs" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} />
                      <Radar
                        name="Style Metrics"
                        dataKey="value"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                      />
                      <Tooltip
                        formatter={(value: number) => `${value.toFixed(1)}`}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Metric Details */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <div className="text-sm text-muted-foreground">Vocabulary Richness</div>
                      <div className="mt-1 text-lg font-bold">
                        {(result.stylometricAnalysis.vocabularyRichness * 100).toFixed(1)}%
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Measures unique word usage. Higher values suggest diverse vocabulary.
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-sm text-muted-foreground">Avg. Sentence Length</div>
                      <div className="mt-1 text-lg font-bold">
                        {result.stylometricAnalysis.avgSentenceLength.toFixed(1)} words
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Average words per sentence. AI tends toward consistent lengths.
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-sm text-muted-foreground">Punctuation Density</div>
                      <div className="mt-1 text-lg font-bold">
                        {(result.stylometricAnalysis.punctuationDensity * 100).toFixed(1)}%
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ratio of punctuation marks. AI often over-punctuates.
                      </p>
                    </div>
                    {result.stylometricAnalysis.capitalizationRatio !== undefined && (
                      <div className="rounded-lg border p-3">
                        <div className="text-sm text-muted-foreground">Capitalization Ratio</div>
                        <div className="mt-1 text-lg font-bold">
                          {(result.stylometricAnalysis.capitalizationRatio * 100).toFixed(1)}%
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Uppercase letter usage pattern.
                        </p>
                      </div>
                    )}
                    {result.stylometricAnalysis.fillerWordRatio !== undefined && (
                      <div className="rounded-lg border p-3">
                        <div className="text-sm text-muted-foreground">Filler Word Ratio</div>
                        <div className="mt-1 text-lg font-bold">
                          {(result.stylometricAnalysis.fillerWordRatio * 100).toFixed(2)}%
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Use of filler words (um, uh, like). Human speech typically has more.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                Stylometric analysis not available for this response.
              </div>
            )}
          </TabsContent>

          {/* Comparison Tab */}
          <TabsContent value="comparison" className="space-y-6 pt-4">
            {hasAnswerComparison ? (
              <>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-semibold">Answer Comparison</span>
                </div>

                {result.questionText && (
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground">Question</div>
                    <p className="mt-1">{result.questionText}</p>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Candidate Answer */}
                  <div className="rounded-lg border p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline">Candidate Answer</Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{result.candidateAnswer}</p>
                  </div>

                  {/* AI-Generated Answers */}
                  {result.aiGeneratedAnswers && (
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">AI-Generated Comparisons</div>

                      {result.aiGeneratedAnswers.gpt4 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                          <div className="mb-2 flex items-center justify-between">
                            <Badge variant="destructive" className="bg-red-500">GPT-4</Badge>
                            <span className="text-sm font-medium">
                              {(result.similarityScores.gpt4 * 100).toFixed(1)}% similar
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{result.aiGeneratedAnswers.gpt4}</p>
                        </div>
                      )}

                      {result.aiGeneratedAnswers.claude && (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950">
                          <div className="mb-2 flex items-center justify-between">
                            <Badge className="bg-orange-500">Claude</Badge>
                            <span className="text-sm font-medium">
                              {(result.similarityScores.claude * 100).toFixed(1)}% similar
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{result.aiGeneratedAnswers.claude}</p>
                        </div>
                      )}

                      {result.aiGeneratedAnswers.gemini && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                          <div className="mb-2 flex items-center justify-between">
                            <Badge className="bg-blue-500">Gemini</Badge>
                            <span className="text-sm font-medium">
                              {(result.similarityScores.gemini * 100).toFixed(1)}% similar
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{result.aiGeneratedAnswers.gemini}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                Answer comparison not available. Enable answer caching to compare responses.
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Detailed Analysis (Expandable) - Outside tabs */}
        {result.detailedAnalysis && (
          <div className="mt-6 space-y-2">
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
        <div className="mt-4 text-xs text-muted-foreground">
          Analysis completed at {new Date(result.createdAt).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  )
}
