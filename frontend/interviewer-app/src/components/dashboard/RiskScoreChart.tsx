import { useMemo } from 'react'
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

interface RiskScoreChartProps {
  data?: { range: string; count: number; color: string }[]
  isLoading?: boolean
}

// Generate mock data
function generateMockData() {
  return [
    { range: '0-20%', count: 45, color: 'hsl(160, 84%, 39%)' }, // Green
    { range: '20-40%', count: 28, color: 'hsl(160, 84%, 45%)' }, // Light Green
    { range: '40-60%', count: 15, color: 'hsl(38, 92%, 50%)' }, // Amber
    { range: '60-80%', count: 8, color: 'hsl(0, 84%, 55%)' }, // Orange-Red
    { range: '80-100%', count: 4, color: 'hsl(0, 84%, 45%)' }, // Red
  ]
}

export function RiskScoreChart({ data, isLoading }: RiskScoreChartProps) {
  const chartData = useMemo(() => data || generateMockData(), [data])

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
