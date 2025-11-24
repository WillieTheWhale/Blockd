import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QUERY_KEYS, API_ENDPOINTS } from '@/lib/constants'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/utils'
import { ArrowLeft, FileText } from 'lucide-react'
import type { Session } from '@/types'

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: session, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS.DETAIL(id!),
    queryFn: async () => {
      const response = await apiClient.get<Session>(API_ENDPOINTS.SESSIONS.GET(id!))
      return response.data
    },
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Session not found</p>
        <Link to="/sessions">
          <Button className="mt-4">Back to Sessions</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/sessions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{session.title}</h1>
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
            <p className="text-muted-foreground mt-2">{session.description}</p>
          )}
        </div>
        {session.status === 'completed' && (
          <Link to={`/reports/${session.id}`}>
            <Button>
              <FileText className="mr-2 h-4 w-4" />
              View Report
            </Button>
          </Link>
        )}
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Session Information</CardTitle>
              <CardDescription>Details about this interview session</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Candidate Name</p>
                  <p className="text-sm">{session.candidateName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Candidate Email</p>
                  <p className="text-sm">{session.candidateEmail}</p>
                </div>
                {session.position && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Position</p>
                    <p className="text-sm">{session.position}</p>
                  </div>
                )}
                {session.department && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Department</p>
                    <p className="text-sm">{session.department}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Scheduled At</p>
                  <p className="text-sm">{formatDateTime(session.scheduledAt)}</p>
                </div>
                {session.startedAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Started At</p>
                    <p className="text-sm">{formatDateTime(session.startedAt)}</p>
                  </div>
                )}
                {session.endedAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Ended At</p>
                    <p className="text-sm">{formatDateTime(session.endedAt)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions">
          <Card>
            <CardHeader>
              <CardTitle>Interview Questions</CardTitle>
              <CardDescription>Questions asked during this session</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Questions will appear here during the interview
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
