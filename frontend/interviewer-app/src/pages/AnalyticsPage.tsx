import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Legend,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'
import { getErrorMessage } from '@/lib/api-client'
import {
  useAnalyticsOverview,
  useAnalyticsDetectionMethods,
  useAnalyticsWeeklyTrends,
  useAnalyticsCandidateSources,
} from '@/hooks/use-analytics'

// Colors for pie chart
const COLORS = [
  'hsl(217.2, 91.2%, 59.8%)',
  'hsl(160, 84%, 39%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 55%)',
  'hsl(280, 65%, 60%)',
  'hsl(200, 70%, 50%)',
]

export function AnalyticsPage() {
  // Fetch overview stats using the hook
  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useAnalyticsOverview()

  // Fetch detection methods
  const { data: detectionData, isLoading: detectionLoading } = useAnalyticsDetectionMethods()

  // Fetch weekly trends
  const { data: trendsData, isLoading: trendsLoading } = useAnalyticsWeeklyTrends()

  // Fetch candidate sources
  const { data: sourcesData, isLoading: sourcesLoading } = useAnalyticsCandidateSources()

  // Transform detection methods data for pie chart
  const detectionMethods = (detectionData || []).map((item, index) => ({
    name: item.method,
    value: item.count,
    color: COLORS[index % COLORS.length],
  }))

  // Transform weekly trends for bar chart
  const weeklyTrends = (trendsData || []).map((item) => ({
    week: item.week,
    sessions: item.total,
    completed: item.completed,
    highRisk: item.highRisk,
  }))

  const candidateSources = sourcesData || []

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
              Total Sessions
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">
                    {(overviewData?.totalSessions.value || 0).toLocaleString()}
                  </div>
                  {overviewData?.totalSessions.trend && (
                    <div className={`flex items-center text-xs font-medium ${overviewData.totalSessions.trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {overviewData.totalSessions.trend.isPositive ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                      {overviewData.totalSessions.trend.value}%
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{overviewData?.totalSessions.description || 'All time interviews'}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Sessions
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {overviewData?.activeSessions.value || 0}
                </div>
                <p className="text-xs text-muted-foreground">{overviewData?.activeSessions.description || 'Currently running'}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed Today
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">
                    {overviewData?.completedToday.value || 0}
                  </div>
                  {overviewData?.completedToday.trend && (
                    <div className={`flex items-center text-xs font-medium ${overviewData.completedToday.trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {overviewData.completedToday.trend.isPositive ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                      {overviewData.completedToday.trend.value}%
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{overviewData?.completedToday.description || 'Finished interviews'}</p>
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
                  <div className="text-2xl font-bold">
                    {overviewData?.highRiskAlerts.value || 0}
                  </div>
                  {overviewData?.highRiskAlerts.trend && (
                    <div className={`flex items-center text-xs font-medium ${overviewData.highRiskAlerts.trend.isPositive ? 'text-red-500' : 'text-green-500'}`}>
                      {!overviewData.highRiskAlerts.trend.isPositive ? <TrendingDown className="h-3 w-3 mr-0.5" /> : <TrendingUp className="h-3 w-3 mr-0.5" />}
                      {overviewData.highRiskAlerts.trend.value}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{overviewData?.highRiskAlerts.description || 'Requires attention'}</p>
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
                  Breakdown of security alerts by detection method
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detectionLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Skeleton className="h-48 w-48 rounded-full" />
                  </div>
                ) : detectionMethods.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p className="mb-2">No detection data yet</p>
                      <p className="text-sm">Security events will be tracked as interviews are conducted</p>
                    </div>
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
                            nameKey="name"
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
                          <span className="text-sm text-muted-foreground">{item.name} ({item.value})</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Detection Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Detection Summary</CardTitle>
                <CardDescription>
                  Overview of detected security events
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detectionLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : detectionMethods.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                      <p>No security events detected</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {detectionMethods.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <span className="text-lg font-bold">{item.value}</span>
                      </div>
                    ))}
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
                Session volume and completion trends over the past 12 weeks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendsLoading ? (
                <div className="h-[400px] flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : weeklyTrends.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p className="mb-2">No trend data yet</p>
                    <p className="text-sm">Weekly trends will appear as you conduct interviews</p>
                  </div>
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
                        allowDecimals={false}
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
                        name="Total Sessions"
                        fill="hsl(217.2, 91.2%, 59.8%)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="completed"
                        name="Completed"
                        fill="hsl(160, 84%, 39%)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="highRisk"
                        name="High Risk"
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
                How candidates are being invited to interviews
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourcesLoading ? (
                <div className="h-[400px] flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : candidateSources.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p className="mb-2">No source data yet</p>
                    <p className="text-sm">Candidate source data will appear as you create sessions</p>
                  </div>
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
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="source"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        width={120}
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
