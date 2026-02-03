import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAnalyticsRiskScores } from '@/hooks/use-analytics'

interface RiskScoreChartProps {
  data?: { range: string; count: number; color: string }[]
  isLoading?: boolean
}

// Default empty data with proper colors
const emptyData = [
  { range: '0-20%', count: 0, color: 'hsl(160, 84%, 39%)' },
  { range: '20-40%', count: 0, color: 'hsl(160, 84%, 45%)' },
  { range: '40-60%', count: 0, color: 'hsl(38, 92%, 50%)' },
  { range: '60-80%', count: 0, color: 'hsl(0, 84%, 55%)' },
  { range: '80-100%', count: 0, color: 'hsl(0, 84%, 45%)' },
]

export function RiskScoreChart({ data: externalData, isLoading: externalLoading }: RiskScoreChartProps) {
  const { data: apiData, isLoading: apiLoading } = useAnalyticsRiskScores()

  const isLoading = externalLoading || apiLoading
  const chartData = externalData || apiData || emptyData

  // Check if there's any data to show
  const hasData = chartData.some(d => d.count > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Score Distribution</CardTitle>
        <CardDescription>Distribution of AI risk scores across all sessions</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        ) : !hasData ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="mb-2">No risk score data yet</p>
              <p className="text-sm">Complete interviews to see risk distributions</p>
            </div>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="range"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickMargin={8}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
