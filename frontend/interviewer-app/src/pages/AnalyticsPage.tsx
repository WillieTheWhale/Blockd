import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
  CheckCircle,
  Eye,
  Brain,
} from 'lucide-react'

// Mock data for various analytics
const detectionMethodData = [
  { name: 'AI Detection', value: 45, color: 'hsl(217.2, 91.2%, 59.8%)' },
  { name: 'Eye Tracking', value: 28, color: 'hsl(160, 84%, 39%)' },
  { name: 'Tab Switch', value: 15, color: 'hsl(38, 92%, 50%)' },
  { name: 'Response Time', value: 12, color: 'hsl(0, 84%, 55%)' },
]

const weeklyTrendsData = [
  { week: 'Week 1', sessions: 24, alerts: 3, completionRate: 95 },
  { week: 'Week 2', sessions: 32, alerts: 5, completionRate: 91 },
  { week: 'Week 3', sessions: 28, alerts: 2, completionRate: 97 },
  { week: 'Week 4', sessions: 35, alerts: 4, completionRate: 94 },
]

const candidateSourceData = [
  { source: 'LinkedIn', count: 45 },
  { source: 'Indeed', count: 32 },
  { source: 'Referral', count: 28 },
  { source: 'Company Site', count: 22 },
  { source: 'Other', count: 15 },
]

const averageScoresData = [
  { month: 'Jan', aiScore: 0.25, eyeScore: 0.18, timingScore: 0.22 },
  { month: 'Feb', aiScore: 0.28, eyeScore: 0.20, timingScore: 0.19 },
  { month: 'Mar', aiScore: 0.22, eyeScore: 0.15, timingScore: 0.21 },
  { month: 'Apr', aiScore: 0.30, eyeScore: 0.22, timingScore: 0.25 },
  { month: 'May', aiScore: 0.27, eyeScore: 0.19, timingScore: 0.23 },
  { month: 'Jun', aiScore: 0.24, eyeScore: 0.17, timingScore: 0.20 },
]

export function AnalyticsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Comprehensive insights into your interview security metrics.
        </p>
      </div>

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
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">1,284</div>
              <div className="flex items-center text-xs font-medium text-green-500">
                <TrendingUp className="h-3 w-3 mr-0.5" />
                12%
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
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
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">42m</div>
              <div className="flex items-center text-xs font-medium text-green-500">
                <TrendingDown className="h-3 w-3 mr-0.5" />
                3%
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Faster than last month</p>
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
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">99.2%</div>
              <Badge variant="secondary" className="text-xs">
                Industry Leading
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">AI detection accuracy</p>
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
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">23</div>
              <div className="flex items-center text-xs font-medium text-red-500">
                <TrendingUp className="h-3 w-3 mr-0.5" />
                8%
              </div>
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
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
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={detectionMethodData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {detectionMethodData.map((entry, index) => (
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
                  {detectionMethodData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
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
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={averageScoresData}>
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
                        tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
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
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyTrendsData}>
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
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={candidateSourceData}
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
