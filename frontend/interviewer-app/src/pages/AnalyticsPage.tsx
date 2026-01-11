import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SessionsChart } from '@/components/dashboard/SessionsChart'
import { RiskScoreChart } from '@/components/dashboard/RiskScoreChart'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  AlertTriangle,
  Brain,
} from 'lucide-react'
import { apiRequest, getErrorMessage } from '@/lib/api-client'
import { API_ENDPOINTS, QUERY_KEYS } from '@/lib/constants'

interface OverviewStats {
  totalInterviews: number
  interviewsChange: number
  avgSessionDuration: number
  durationChange: number
  detectionRate: number
  securityAlerts: number
  alertsChange: number
}

interface DetectionMethod {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface WeeklyTrend {
  week: string
  sessions: number
  alerts: number
  completionRate: number
}

interface CandidateSource {
  source: string
  count: number
}

interface RiskScore {
  month: string
  aiScore: number
  eyeScore: number
  timingScore: number
}

export function AnalyticsPage() {
  // Fetch overview stats
  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.OVERVIEW,
    queryFn: () => apiRequest<OverviewStats>('GET', API_ENDPOINTS.ANALYTICS.OVERVIEW),
    staleTime: 60 * 1000, // 1 minute
  })

  // Fetch detection methods
  const { data: detectionData, isLoading: detectionLoading } = useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.DETECTION_METHODS,
    queryFn: () => apiRequest<DetectionMethod[]>('GET', API_ENDPOINTS.ANALYTICS.DETECTION_METHODS),
    staleTime: 60 * 1000,
  })

  // Fetch weekly trends
  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.WEEKLY_TRENDS,
    queryFn: () => apiRequest<WeeklyTrend[]>('GET', API_ENDPOINTS.ANALYTICS.WEEKLY_TRENDS),
    staleTime: 60 * 1000,
  })

  // Fetch candidate sources
  const { data: sourcesData, isLoading: sourcesLoading } = useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.CANDIDATE_SOURCES,
    queryFn: () => apiRequest<CandidateSource[]>('GET', API_ENDPOINTS.ANALYTICS.CANDIDATE_SOURCES),
    staleTime: 60 * 1000,
  })

  // Fetch risk scores over time
  const { data: riskScoresData, isLoading: riskScoresLoading } = useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.RISK_SCORES,
    queryFn: () => apiRequest<RiskScore[]>('GET', API_ENDPOINTS.ANALYTICS.RISK_SCORES),
    staleTime: 60 * 1000,
  })

  const overview = overviewData ?? {
    totalInterviews: 0,
    interviewsChange: 0,
    avgSessionDuration: 0,
    durationChange: 0,
    detectionRate: 0,
    securityAlerts: 0,
    alertsChange: 0,
  }

  const detectionMethods = detectionData ?? []
  const weeklyTrends = trendsData ?? []
  const candidateSources = sourcesData ?? []
  const riskScores = riskScoresData ?? []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Comprehensive insights into your interview security metrics.
        </p>
      </div>

      {/* Error State */}
      {overviewError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load analytics: {getErrorMessage(overviewError)}</p>
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Interviews
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">{overview.totalInterviews.toLocaleString()}</div>
                  {overview.interviewsChange !== 0 && (
                    <div className={`flex items-center text-xs font-medium ${overview.interviewsChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {overview.interviewsChange > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                      {Math.abs(overview.interviewsChange)}%
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Session Duration
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">{overview.avgSessionDuration}m</div>
                  {overview.durationChange !== 0 && (
                    <div className={`flex items-center text-xs font-medium ${overview.durationChange < 0 ? 'text-green-500' : 'text-red-500'}`}>
                      <TrendingDown className="h-3 w-3 mr-0.5" />
                      {Math.abs(overview.durationChange)}%
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Faster than last month</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Detection Rate
            </CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">{overview.detectionRate.toFixed(1)}%</div>
                  <Badge variant="secondary" className="text-xs">
                    Industry Leading
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">AI detection accuracy</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Security Alerts
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">{overview.securityAlerts}</div>
                  {overview.alertsChange !== 0 && (
                    <div className={`flex items-center text-xs font-medium ${overview.alertsChange > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {overview.alertsChange > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                      {Math.abs(overview.alertsChange)}%
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">This month</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different analytics views */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="detection">Detection Methods</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="sources">Candidate Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <SessionsChart />
            <RiskScoreChart />
          </div>
        </TabsContent>

        <TabsContent value="detection" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Detection Method Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Detection Methods</CardTitle>
                <CardDescription>
                  Breakdown of alerts by detection method
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detectionLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Skeleton className="h-48 w-48 rounded-full" />
                  </div>
                ) : detectionMethods.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No detection data available
                  </div>
                ) : (
                  <>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={detectionMethods}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {detectionMethods.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-4 mt-4">
                      {detectionMethods.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-muted-foreground">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Average Scores Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>Average Risk Scores</CardTitle>
                <CardDescription>
                  Monthly average scores by detection type
                </CardDescription>
              </CardHeader>
              <CardContent>
                {riskScoresLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Skeleton className="h-full w-full" />
                  </div>
                ) : riskScores.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No risk score data available
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={riskScores}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="aiScore"
                          name="AI Score"
                          stroke="hsl(217.2, 91.2%, 59.8%)"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(217.2, 91.2%, 59.8%)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="eyeScore"
                          name="Eye Tracking"
                          stroke="hsl(160, 84%, 39%)"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(160, 84%, 39%)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="timingScore"
                          name="Timing"
                          stroke="hsl(38, 92%, 50%)"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(38, 92%, 50%)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Trends</CardTitle>
              <CardDescription>
                Session volume and alert trends over the past 4 weeks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendsLoading ? (
                <div className="h-[400px] flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : weeklyTrends.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  No trend data available
                </div>
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyTrends}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="week"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="sessions"
                        name="Sessions"
                        fill="hsl(217.2, 91.2%, 59.8%)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="alerts"
                        name="Alerts"
                        fill="hsl(0, 84%, 55%)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Candidate Sources</CardTitle>
              <CardDescription>
                Where your interview candidates are coming from
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourcesLoading ? (
                <div className="h-[400px] flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : candidateSources.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  No source data available
                </div>
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={candidateSources}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="source"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Candidates"
                        fill="hsl(217.2, 91.2%, 59.8%)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
