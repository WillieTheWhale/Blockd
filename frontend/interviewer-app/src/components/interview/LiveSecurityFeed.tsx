import { useEffect, useRef } from 'react'
import { Shield, AlertTriangle, Eye, Monitor, Clipboard, Wifi, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { SecurityEvent, SecurityEventSeverity, SecurityEventType } from '@/types'

interface LiveSecurityFeedProps {
  events: SecurityEvent[]
  className?: string
}

const getEventIcon = (type: SecurityEventType) => {
  switch (type) {
    case 'tab_switch':
    case 'window_blur':
      return Monitor
    case 'copy_paste':
      return Clipboard
    case 'multiple_faces':
    case 'no_face':
      return Users
    case 'network_disconnect':
      return Wifi
    case 'unauthorized_device':
      return Shield
    case 'suspicious_activity':
    default:
      return AlertTriangle
  }
}

const getSeverityColor = (severity: SecurityEventSeverity): string => {
  switch (severity) {
    case 'critical':
      return 'text-red-600 bg-red-100 dark:bg-red-950'
    case 'high':
      return 'text-orange-600 bg-orange-100 dark:bg-orange-950'
    case 'medium':
      return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-950'
    case 'low':
    default:
      return 'text-blue-600 bg-blue-100 dark:bg-blue-950'
  }
}

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

const formatEventType = (type: SecurityEventType): string => {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

const formatTime = (timestamp: string): string => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function LiveSecurityFeed({ events, className }: LiveSecurityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  const criticalCount = events.filter((e) => e.severity === 'critical').length
  const highCount = events.filter((e) => e.severity === 'high').length

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4" />
            Security Events
          </CardTitle>
          <div className="flex items-center gap-1">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                {criticalCount}
              </Badge>
            )}
            {highCount > 0 && (
              <Badge className="h-5 bg-orange-500 px-1.5 text-xs">
                {highCount}
              </Badge>
            )}
            <Badge variant="outline" className="h-5 px-1.5 text-xs">
              {events.length}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <Eye className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              No security events detected
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[200px]" ref={scrollRef}>
            <div className="space-y-1 p-2">
              {events.map((event) => {
                const Icon = getEventIcon(event.type)
                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex items-start gap-2 rounded-md p-2 text-xs transition-colors',
                      getSeverityColor(event.severity)
                    )}
                  >
                    <Icon className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {formatEventType(event.type)}
                        </span>
                        <span className="flex-shrink-0 text-[10px] opacity-70">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>
                      {event.description && (
                        <p className="mt-0.5 truncate opacity-80">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={getSeverityBadgeVariant(event.severity)}
                      className="h-4 flex-shrink-0 px-1 text-[10px]"
                    >
                      {event.severity}
                    </Badge>
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
