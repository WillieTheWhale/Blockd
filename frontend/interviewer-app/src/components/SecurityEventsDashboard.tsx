import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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

/**
 * Event type categories for grouped filtering
 */
const EVENT_TYPE_CATEGORIES = {
  focus: {
    label: 'Focus',
    types: ['tab_switch', 'window_blur'] as SecurityEventType[],
  },
  clipboard: {
    label: 'Clipboard',
    types: ['copy_paste'] as SecurityEventType[],
  },
  faceDetection: {
    label: 'Face Detection',
    types: ['multiple_faces', 'no_face'] as SecurityEventType[],
  },
  deviceNetwork: {
    label: 'Device / Network',
    types: ['unauthorized_device', 'network_disconnect'] as SecurityEventType[],
  },
  other: {
    label: 'Other',
    types: ['suspicious_activity'] as SecurityEventType[],
  },
} as const

/**
 * All event types for default filter state
 */
const ALL_EVENT_TYPES: SecurityEventType[] = Object.values(EVENT_TYPE_CATEGORIES).flatMap(
  (category) => category.types
)

/**
 * Get human-readable label for event type
 */
const getEventTypeLabel = (type: SecurityEventType): string => {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

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
  const [filterTypes, setFilterTypes] = useState<Set<SecurityEventType>>(
    new Set(ALL_EVENT_TYPES)
  )
  const [autoScroll, setAutoScroll] = useState(true)

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { securityEvents, soundEnabled, toggleSound } = useRealtimeStore()
  const { subscribe, isConnected } = useWebSocket({ sessionId })

  /**
   * Subscribe to security alerts
   */
  useEffect(() => {
    const unsubscribe = subscribe<SecurityEvent>('security:alert', () => {
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
   * Toggle event type filter
   */
  const toggleTypeFilter = useCallback((type: SecurityEventType) => {
    setFilterTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  /**
   * Get session events (memoized)
   */
  const sessionEvents = useMemo(
    () => securityEvents.filter((event) => event.sessionId === sessionId),
    [securityEvents, sessionId]
  )

  /**
   * Filter events (memoized)
   */
  const filteredEvents = useMemo(
    () =>
      sessionEvents.filter((event) => {
        // Filter by severity
        if (!filterSeverities.has(event.severity)) return false

        // Filter by type
        if (!filterTypes.has(event.type)) return false

        return true
      }),
    [sessionEvents, filterSeverities, filterTypes]
  )

  /**
   * Get event counts by severity (memoized)
   */
  const severityCounts = useMemo(
    () => ({
      critical: sessionEvents.filter((e) => e.severity === 'critical').length,
      high: sessionEvents.filter((e) => e.severity === 'high').length,
      medium: sessionEvents.filter((e) => e.severity === 'medium').length,
      low: sessionEvents.filter((e) => e.severity === 'low').length,
    }),
    [sessionEvents]
  )

  /**
   * Get event counts by type (memoized)
   */
  const typeCounts = useMemo(
    () =>
      sessionEvents.reduce(
        (acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1
          return acc
        },
        {} as Record<SecurityEventType, number>
      ),
    [sessionEvents]
  )

  const getTypeCount = useCallback(
    (type: SecurityEventType): number => typeCounts[type] || 0,
    [typeCounts]
  )

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
                  Critical ({severityCounts.critical})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterSeverities.has('high')}
                  onCheckedChange={() => toggleSeverityFilter('high')}
                >
                  High ({severityCounts.high})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterSeverities.has('medium')}
                  onCheckedChange={() => toggleSeverityFilter('medium')}
                >
                  Medium ({severityCounts.medium})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterSeverities.has('low')}
                  onCheckedChange={() => toggleSeverityFilter('low')}
                >
                  Low ({severityCounts.low})
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator />

                {/* Event Type Filters - Grouped by Category */}
                {Object.entries(EVENT_TYPE_CATEGORIES).map(([key, category]) => (
                  <div key={key}>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {category.label}
                    </DropdownMenuLabel>
                    {category.types.map((type) => (
                      <DropdownMenuCheckboxItem
                        key={type}
                        checked={filterTypes.has(type)}
                        onCheckedChange={() => toggleTypeFilter(type)}
                      >
                        {getEventTypeLabel(type)} ({getTypeCount(type)})
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                ))}

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
          {severityCounts.critical > 0 && (
            <Badge variant="destructive">{severityCounts.critical} Critical</Badge>
          )}
          {severityCounts.high > 0 && <Badge variant="destructive">{severityCounts.high} High</Badge>}
          {severityCounts.medium > 0 && <Badge variant="default">{severityCounts.medium} Medium</Badge>}
          {severityCounts.low > 0 && <Badge variant="secondary">{severityCounts.low} Low</Badge>}
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
