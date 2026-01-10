import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Calendar, CheckCircle, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Stat {
  title: string
  value: string | number
  description: string
  icon: React.ComponentType<{ className?: string }>
  trend?: {
    value: number
    isPositive: boolean
  }
}

interface StatsCardsProps {
  stats?: Stat[]
  isLoading?: boolean
}

function generateMockStats(): Stat[] {
  return [
    {
      title: 'Total Sessions',
      value: 156,
      description: 'All time interviews',
      icon: Users,
      trend: { value: 12, isPositive: true },
    },
    {
      title: 'Active Sessions',
      value: 3,
      description: 'Currently running',
      icon: Calendar,
    },
    {
      title: 'Completed Today',
      value: 8,
      description: 'Finished interviews',
      icon: CheckCircle,
      trend: { value: 4, isPositive: true },
    },
    {
      title: 'High Risk Alerts',
      value: 2,
      description: 'Requires attention',
      icon: AlertTriangle,
      trend: { value: 1, isPositive: false },
    },
  ]
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const data = stats || generateMockStats()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {data.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.trend && (
                <div
                  className={cn(
                    'flex items-center text-xs font-medium',
                    stat.trend.isPositive ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {stat.trend.isPositive ? (
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                  )}
                  {stat.trend.value}%
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
          {/* Decorative gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Card>
      ))}
    </div>
  )
}
