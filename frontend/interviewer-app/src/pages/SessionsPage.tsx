import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { QUERY_KEYS, API_ENDPOINTS } from '@/lib/constants'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/utils'
import { Plus } from 'lucide-react'
import type { Session, PaginatedResponse } from '@/types'

export function SessionsPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS.LIST(),
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<Session>>(API_ENDPOINTS.SESSIONS.LIST)
      return response.data
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Sessions</h1>
          <p className="text-muted-foreground mt-2">Manage and view all your interview sessions</p>
        </div>
        <Link to="/sessions/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Sessions</CardTitle>
          <CardDescription>A list of all your interview sessions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : sessions?.data.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No sessions yet</p>
              <Link to="/sessions/create">
                <Button>Create your first session</Button>
              </Link>
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
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{session.title}</h3>
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
                      {session.description && (
                        <p className="text-sm text-muted-foreground">{session.description}</p>
                      )}
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Candidate: {session.candidateName}</span>
                        {session.position && <span>Position: {session.position}</span>}
                        <span>Scheduled: {formatDateTime(session.scheduledAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
