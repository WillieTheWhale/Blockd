import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'
import { QUERY_KEYS, API_ENDPOINTS } from '@/lib/constants'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/utils'
import { Plus, ArrowRight } from 'lucide-react'
import type { Session, PaginatedResponse } from '@/types'

import { StatsCards } from '@/components/dashboard/StatsCards'
import { SessionsChart } from '@/components/dashboard/SessionsChart'
import { RiskScoreChart } from '@/components/dashboard/RiskScoreChart'
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline'
import { QuickActions } from '@/components/dashboard/QuickActions'

export function DashboardPage() {
  const { user } = useAuthStore()

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS.LIST({ limit: 5 }),
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<Session>>(API_ENDPOINTS.SESSIONS.LIST, {
        params: { pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' },
      })
      return response.data
    },
  })

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'ended':
        return 'default'
      case 'active':
        return 'secondary'
      case 'scheduled':
        return 'outline'
      case 'cancelled':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ended':
        return 'Completed'
      case 'active':
        return 'In Progress'
      case 'scheduled':
        return 'Scheduled'
      case 'cancelled':
        return 'Cancelled'
      default:
        return status
    }
  }

  // Get first name from user data
  const firstName = user?.firstName || user?.name?.split(' ')[0] || 'there'

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {firstName}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's an overview of your interview platform activity.
          </p>
        </div>
        <Link to="/sessions/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </Link>
      </div>

      {/* Stats Cards - fetches its own data */}
      <StatsCards />

      {/* Charts Row - each chart fetches its own data */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <SessionsChart />
        <RiskScoreChart />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Sessions - 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>Your latest interview sessions</CardDescription>
            </div>
            <Link to="/sessions">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-lg border border-border/40 animate-pulse"
                  >
                    <div className="space-y-2">
                      <div className="h-4 w-40 bg-muted rounded" />
                      <div className="h-3 w-32 bg-muted rounded" />
                    </div>
                    <div className="h-6 w-20 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : !sessions?.data || sessions.data.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No sessions yet. Create your first session to get started!
                </p>
                <Link to="/sessions/create">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Session
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.data.map((session) => {
                  // Get candidate name from interviewee or email
                  const candidateName = session.interviewee
                    ? `${session.interviewee.firstName || ''} ${session.interviewee.lastName || ''}`.trim() || session.interviewee.email
                    : session.intervieweeEmail || 'Unknown Candidate'

                  return (
                    <Link
                      key={session.id}
                      to={`/sessions/${session.id}`}
                      className="block p-4 rounded-lg border border-border/40 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-medium group-hover:text-primary transition-colors">
                            Interview Session
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {candidateName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {session.scheduledStart ? formatDateTime(session.scheduledStart) : 'No date scheduled'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant={getStatusVariant(session.status)}>
                            {getStatusLabel(session.status)}
                          </Badge>
                          {session.riskScore !== undefined && session.riskScore !== null && Number(session.riskScore) >= 0.7 && (
                            <Badge variant="destructive" className="text-xs">
                              High Risk
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6">
          <QuickActions />
          {/* Activity Timeline - fetches its own data */}
          <ActivityTimeline />
        </div>
      </div>
    </div>
  )
}
