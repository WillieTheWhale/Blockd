import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Eye,
  Copy,
  Users,
  Wifi,
  Monitor,
  Activity,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Filter,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { SecurityEvent, SecurityEventSeverity, SecurityEventType } from '@/types'
import { format } from 'date-fns'

interface SecurityEventsDashboardProps {
  sessionId: string
  className?: string
  maxHeight?: string
}

/**
 * Get icon for event type
 */
const getEventIcon = (type: SecurityEventType) => {
  switch (type) {
    case 'tab_switch':
    case 'window_blur':
      return Monitor
    case 'copy_paste':
      return Copy
    case 'multiple_faces':
    case 'no_face':
      return Users
    case 'network_disconnect':
      return Wifi
    case 'unauthorized_device':
      return Eye
    case 'suspicious_activity':
    default:
      return Activity
  }
}

/**
 * Get badge variant for severity
 */
const getSeverityVariant = (severity: SecurityEventSeverity): 'default' | 'secondary' | 'destructive' => {
  switch (severity) {
    case 'critical':
      return 'destructive'
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
 * Get color for severity
 */
const getSeverityColor = (severity: SecurityEventSeverity): string => {
  switch (severity) {
    case 'critical':
      return 'text-red-500'
    case 'high':
      return 'text-orange-500'
    case 'medium':
      return 'text-yellow-500'
    case 'low':
    default:
      return 'text-blue-500'
  }
}

/**
 * SecurityEventsDashboard Component
 *
 * Features:
 * - Real-time event list with WebSocket updates
 * - Event severity badges (low/medium/high/critical)
 * - Event type icons
 * - Timestamp display
 * - Event details expansion
 * - Filter by severity and type
 * - Auto-scroll to new events
 * - Sound notifications for critical events
 */
export function SecurityEventsDashboard({
  sessionId,
  className,
  maxHeight = '600px',
}: SecurityEventsDashboardProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [filterSeverities, setFilterSeverities] = useState<Set<SecurityEventSeverity>>(
    new Set(['low', 'medium', 'high', 'critical'])
  )
  const [filterTypes, _setFilterTypes] = useState<Set<SecurityEventType>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { securityEvents, soundEnabled, toggleSound } = useRealtimeStore()
  const { subscribe, isConnected } = useWebSocket({ sessionId })

  /**
   * Subscribe to security alerts
   */
  useEffect(() => {
    const unsubscribe = subscribe<SecurityEvent>('security:alert', (event) => {
      console.log('Security event received:', event)

      // Auto-scroll to new event if enabled
      if (autoScroll) {
        setTimeout(() => {
          scrollAreaRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        }, 100)
      }
    })

    return unsubscribe
  }, [subscribe, autoScroll])

  /**
   * Toggle event expansion
   */
  const toggleEventExpansion = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }, [])

  /**
   * Toggle severity filter
   */
  const toggleSeverityFilter = useCallback((severity: SecurityEventSeverity) => {
    setFilterSeverities((prev) => {
      const next = new Set(prev)
      if (next.has(severity)) {
        next.delete(severity)
      } else {
        next.add(severity)
      }
      return next
    })
  }, [])

  /**
   * Filter events
   */
  const filteredEvents = securityEvents.filter((event) => {
    // Filter by session
    if (event.sessionId !== sessionId) return false

    // Filter by severity
    if (!filterSeverities.has(event.severity)) return false

    // Filter by type (if any types are selected)
    if (filterTypes.size > 0 && !filterTypes.has(event.type)) return false

    return true
  })

  /**
   * Get event counts by severity
   */
  const eventCounts = {
    critical: filteredEvents.filter((e) => e.severity === 'critical').length,
    high: filteredEvents.filter((e) => e.severity === 'high').length,
    medium: filteredEvents.filter((e) => e.severity === 'medium').length,
    low: filteredEvents.filter((e) => e.severity === 'low').length,
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Security Events</CardTitle>
            <CardDescription>Real-time security monitoring</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Sound Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSound}
              title={soundEnabled ? 'Disable sound notifications' : 'Enable sound notifications'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>

            {/* Filters */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Severity</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filterSeverities.has('critical')}
                  onCheckedChange={() => toggleSeverityFilter('critical')}
                >
                  Critical ({eventCounts.critical})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterSeverities.has('high')}
                  onCheckedChange={() => toggleSeverityFilter('high')}
                >
                  High ({eventCounts.high})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterSeverities.has('medium')}
                  onCheckedChange={() => toggleSeverityFilter('medium')}
                >
                  Medium ({eventCounts.medium})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterSeverities.has('low')}
                  onCheckedChange={() => toggleSeverityFilter('low')}
                >
                  Low ({eventCounts.low})
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={autoScroll} onCheckedChange={setAutoScroll}>
                  Auto-scroll to new events
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Summary Badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          {eventCounts.critical > 0 && (
            <Badge variant="destructive">{eventCounts.critical} Critical</Badge>
          )}
          {eventCounts.high > 0 && <Badge variant="destructive">{eventCounts.high} High</Badge>}
          {eventCounts.medium > 0 && <Badge variant="default">{eventCounts.medium} Medium</Badge>}
          {eventCounts.low > 0 && <Badge variant="secondary">{eventCounts.low} Low</Badge>}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <ScrollArea ref={scrollAreaRef} className="px-6 pb-6" style={{ height: maxHeight }}>
          {filteredEvents.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              No security events
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((event) => {
                const Icon = getEventIcon(event.type)
                const isExpanded = expandedEvents.has(event.id)

                return (
                  <div
                    key={event.id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors hover:bg-accent',
                      event.severity === 'critical' && 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className={cn(
                          'mt-0.5 rounded-full p-2',
                          event.severity === 'critical'
                            ? 'bg-red-100 dark:bg-red-900'
                            : 'bg-accent'
                        )}
                      >
                        <Icon className={cn('h-4 w-4', getSeverityColor(event.severity))} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">
                                {event.type.replace(/_/g, ' ')}
                              </span>
                              <Badge variant={getSeverityVariant(event.severity)}>
                                {event.severity}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleEventExpansion(event.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm:ss')}
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && event.metadata && (
                          <div className="mt-2 rounded bg-muted p-2 text-xs">
                            <pre className="overflow-auto">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
