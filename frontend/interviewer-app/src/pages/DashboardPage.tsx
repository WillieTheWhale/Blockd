import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'
import { QUERY_KEYS, API_ENDPOINTS } from '@/lib/constants'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/utils'
import { Calendar, Users, FileText, Plus } from 'lucide-react'
import type { Session, PaginatedResponse } from '@/types'

export function DashboardPage() {
  const { user } = useAuthStore()

  const { data: sessions, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS.LIST({ limit: 5 }),
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<Session>>(API_ENDPOINTS.SESSIONS.LIST, {
        params: { limit: 5, sortBy: 'createdAt', sortOrder: 'desc' },
      })
      return response.data
    },
  })

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user?.name}!</h1>
        <p className="text-muted-foreground mt-2">
          Here's what's happening with your interviews today.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions?.total || 0}</div>
            <p className="text-xs text-muted-foreground">All time interviews</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sessions?.data.filter((s) => s.status === 'pending').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Scheduled interviews</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sessions?.data.filter((s) => s.status === 'completed').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight">Recent Sessions</h2>
          <Link to="/sessions/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Latest Interview Sessions</CardTitle>
            <CardDescription>Your most recent interview sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : sessions?.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No sessions yet. Create your first session to get started!
              </div>
            ) : (
              <div className="space-y-4">
                {sessions?.data.map((session) => (
                  <Link
                    key={session.id}
                    to={`/sessions/${session.id}`}
                    className="block p-4 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold">{session.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          Candidate: {session.candidateName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Scheduled: {formatDateTime(session.scheduledAt)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          session.status === 'completed'
                            ? 'default'
                            : session.status === 'in_progress'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {session.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
