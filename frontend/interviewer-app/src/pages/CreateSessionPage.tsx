import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { QUERY_KEYS, API_ENDPOINTS } from '@/lib/constants'
import apiClient from '@/lib/api-client'
import type { Session, CreateSessionData } from '@/types'

export function CreateSessionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<CreateSessionData>({
    title: '',
    description: '',
    candidateName: '',
    candidateEmail: '',
    scheduledAt: '',
    position: '',
    department: '',
  })

  const createSessionMutation = useMutation({
    mutationFn: async (data: CreateSessionData) => {
      const response = await apiClient.post<Session>(API_ENDPOINTS.SESSIONS.CREATE, data)
      return response.data
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.ALL })
      toast('Session created!', { description: 'Your interview session has been created.' })
      navigate(`/sessions/${session.id}`)
    },
    onError: (error) => {
      toast('Failed to create session', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createSessionMutation.mutate(formData)
  }

  const handleChange = (field: keyof CreateSessionData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Interview Session</h1>
        <p className="text-muted-foreground mt-2">Set up a new interview session</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session Details</CardTitle>
          <CardDescription>Enter the details for the new interview session</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Session Title *</Label>
              <Input
                id="title"
                placeholder="Frontend Developer Interview"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Technical interview for senior position"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="candidateName">Candidate Name *</Label>
                <Input
                  id="candidateName"
                  placeholder="John Doe"
                  value={formData.candidateName}
                  onChange={(e) => handleChange('candidateName', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="candidateEmail">Candidate Email *</Label>
                <Input
                  id="candidateEmail"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.candidateEmail}
                  onChange={(e) => handleChange('candidateEmail', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Scheduled Date & Time *</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) => handleChange('scheduledAt', e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  placeholder="Senior Frontend Developer"
                  value={formData.position}
                  onChange={(e) => handleChange('position', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  placeholder="Engineering"
                  value={formData.department}
                  onChange={(e) => handleChange('department', e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={createSessionMutation.isPending}>
                {createSessionMutation.isPending ? 'Creating...' : 'Create Session'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/sessions')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
