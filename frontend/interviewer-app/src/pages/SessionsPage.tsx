import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSessionStore } from '@/stores/session-store'
import { formatDateTime } from '@/lib/utils'
import { SESSION_STATUS } from '@/lib/constants'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Play,
  StopCircle,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { SessionStatus } from '@/types'

export function SessionsPage() {
  const navigate = useNavigate()
  const {
    sessions,
    filters,
    pagination,
    isLoading,
    fetchSessions,
    setFilters,
    setPagination,
    startSessionById,
    endSessionById,
    deleteSession,
  } = useSessionStore()

  const [searchQuery, setSearchQuery] = useState(filters.search || '')

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions, filters, pagination.page])

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    // Debounce search
    const timeoutId = setTimeout(() => {
      setFilters({ search: value })
    }, 500)
    return () => clearTimeout(timeoutId)
  }

  const handleStatusFilter = (status: SessionStatus | 'all') => {
    setFilters({ status: status === 'all' ? undefined : status })
  }

  const handleStartSession = async (id: string) => {
    const result = await startSessionById(id)
    if (result.success) {
      toast.success('Session started', {
        description: 'The interview session has been started successfully.',
      })
      navigate(`/sessions/${id}`)
    } else {
      toast.error('Failed to start session', {
        description: 'Please try again.',
      })
    }
  }

  const handleEndSession = async (id: string) => {
    const result = await endSessionById(id)
    if (result.success) {
      toast.success('Session ended', {
        description: 'The interview session has been ended successfully.',
      })
    } else {
      toast.error('Failed to end session', {
        description: 'Please try again.',
      })
    }
  }

  const handleDeleteSession = async (id: string) => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return
    }

    const result = await deleteSession(id)
    if (result.success) {
      toast.success('Session deleted', {
        description: 'The interview session has been deleted successfully.',
      })
    } else {
      toast.error('Failed to delete session', {
        description: 'Please try again.',
      })
    }
  }

  const getStatusBadgeVariant = (status: SessionStatus) => {
    switch (status) {
      case SESSION_STATUS.COMPLETED:
        return 'default'
      case SESSION_STATUS.IN_PROGRESS:
        return 'secondary'
      case SESSION_STATUS.CANCELLED:
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const getStatusLabel = (status: SessionStatus) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Sessions</h1>
          <p className="text-muted-foreground mt-2">Manage and monitor all your interview sessions</p>
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
          <CardDescription>
            View and manage your interview sessions with real-time updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by candidate name or email..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={filters.status || 'all'}
                onValueChange={handleStatusFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value={SESSION_STATUS.PENDING}>Pending</SelectItem>
                  <SelectItem value={SESSION_STATUS.IN_PROGRESS}>In Progress</SelectItem>
                  <SelectItem value={SESSION_STATUS.COMPLETED}>Completed</SelectItem>
                  <SelectItem value={SESSION_STATUS.CANCELLED}>Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {filters.search || filters.status
                  ? 'No sessions found matching your filters'
                  : 'No sessions yet'}
              </p>
              <Link to="/sessions/create">
                <Button>Create your first session</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Risk Score</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{session.candidateName}</div>
                            <div className="text-sm text-muted-foreground">{session.candidateEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {session.position || (
                            <span className="text-muted-foreground">Not specified</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDateTime(session.scheduledAt)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(session.status)}>
                            {getStatusLabel(session.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium">--</div>
                            <span className="text-xs text-muted-foreground">(pending)</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/sessions/${session.id}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {session.status === SESSION_STATUS.PENDING && (
                                <DropdownMenuItem onClick={() => handleStartSession(session.id)}>
                                  <Play className="mr-2 h-4 w-4" />
                                  Start Session
                                </DropdownMenuItem>
                              )}
                              {session.status === SESSION_STATUS.IN_PROGRESS && (
                                <DropdownMenuItem onClick={() => handleEndSession(session.id)}>
                                  <StopCircle className="mr-2 h-4 w-4" />
                                  End Session
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteSession(session.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
                    {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                    {pagination.total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagination({ page: pagination.page - 1 })}
                      disabled={pagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          // Show first, last, current, and adjacent pages
                          return (
                            page === 1 ||
                            page === pagination.totalPages ||
                            Math.abs(page - pagination.page) <= 1
                          )
                        })
                        .map((page, idx, arr) => {
                          // Add ellipsis
                          const showEllipsis = idx > 0 && page - arr[idx - 1] > 1
                          return (
                            <div key={page} className="flex items-center">
                              {showEllipsis && <span className="px-2">...</span>}
                              <Button
                                variant={page === pagination.page ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setPagination({ page })}
                              >
                                {page}
                              </Button>
                            </div>
                          )
                        })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagination({ page: pagination.page + 1 })}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
