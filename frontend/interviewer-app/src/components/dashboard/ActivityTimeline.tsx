import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Video,
  AlertTriangle,
  CheckCircle,
  Clock,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAnalyticsActivity, type ActivityItem } from '@/hooks/use-analytics'

interface ActivityTimelineProps {
  activities?: ActivityItem[]
  isLoading?: boolean
}

const iconMap = {
  session_started: Video,
  session_ended: CheckCircle,
  alert: AlertTriangle,
  candidate_joined: UserPlus,
  session_cancelled: XCircle,
}

const statusColors = {
  success: 'text-green-500 bg-green-500/10',
  warning: 'text-amber-500 bg-amber-500/10',
  error: 'text-red-500 bg-red-500/10',
  info: 'text-blue-500 bg-blue-500/10',
}

export function ActivityTimeline({ activities: externalActivities, isLoading: externalLoading }: ActivityTimelineProps) {
  const { data: apiActivities, isLoading: apiLoading } = useAnalyticsActivity()

  const isLoading = externalLoading || apiLoading
  const items = externalActivities || apiActivities || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest events across your interviews</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">No activity yet</p>
            <p className="text-sm">Events will appear here as sessions are created and conducted</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {items.map((item, index) => {
                const Icon = iconMap[item.type] || Clock
                return (
                  <div key={item.id} className="flex gap-4 group">
                    {/* Icon */}
                    <div className="relative">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center',
                          item.status ? statusColors[item.status] : 'bg-muted'
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      {/* Connector line */}
                      {index < items.length - 1 && (
                        <div className="absolute top-10 left-1/2 w-px h-4 bg-border -translate-x-1/2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{item.title}</p>
                        {item.status === 'warning' && (
                          <Badge variant="outline" className="text-amber-500 border-amber-500/20 text-xs">
                            Alert
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.timestamp}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
