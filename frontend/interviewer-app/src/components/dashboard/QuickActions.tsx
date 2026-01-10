import { useNavigate } from 'react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, FileText, Settings, Users } from 'lucide-react'

export function QuickActions() {
  const navigate = useNavigate()

  const actions = [
    {
      icon: Plus,
      label: 'New Session',
      description: 'Create a new interview',
      onClick: () => navigate('/sessions/create'),
      variant: 'default' as const,
    },
    {
      icon: FileText,
      label: 'View Reports',
      description: 'Browse all reports',
      onClick: () => navigate('/reports'),
      variant: 'outline' as const,
    },
    {
      icon: Users,
      label: 'Manage Team',
      description: 'Add team members',
      onClick: () => navigate('/settings'),
      variant: 'outline' as const,
    },
    {
      icon: Settings,
      label: 'Settings',
      description: 'Configure platform',
      onClick: () => navigate('/settings'),
      variant: 'outline' as const,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common tasks and shortcuts</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant}
              className="h-auto flex-col items-start p-4 gap-2"
              onClick={action.onClick}
            >
              <action.icon className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium text-sm">{action.label}</div>
                <div className="text-xs text-muted-foreground font-normal">
                  {action.description}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
