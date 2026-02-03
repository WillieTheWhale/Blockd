import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, CheckCircle2, Shield } from 'lucide-react'
import { toast } from 'sonner'

type CallbackStatus = 'loading' | 'success' | 'terms_required' | 'error'

export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { handleOAuthCallback, isLoading } = useAuthStore()
  const [status, setStatus] = useState<CallbackStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')
      const errorDescription = searchParams.get('error_description')

      // Handle OAuth provider errors (e.g., user cancelled)
      if (error) {
        setStatus('error')
        setErrorMessage(errorDescription || `OAuth error: ${error}`)
        toast.error('Authentication cancelled', {
          description: errorDescription || 'Please try again',
        })
        return
      }

      // Validate required parameters
      if (!code || !state) {
        setStatus('error')
        setErrorMessage('Missing authorization code or state parameter')
        toast.error('Invalid callback', {
          description: 'Please try signing in again',
        })
        return
      }

      // Exchange code for tokens
      try {
        const result = await handleOAuthCallback(code, state)

        if (result.success) {
          // Check if user has accepted terms
          const currentUser = useAuthStore.getState().user
          const hasAcceptedTerms = currentUser?.termsAcceptedAt

          if (!hasAcceptedTerms) {
            // New user or user hasn't accepted terms - redirect to terms page
            setStatus('terms_required')
            toast.info('Almost there!', {
              description: 'Please review and accept our Terms of Service',
            })
            setTimeout(() => {
              navigate('/terms-agreement', {
                replace: true,
                state: {
                  fromOAuth: true,
                  isNewUser: true,
                },
              })
            }, 1500)
          } else {
            // Existing user with accepted terms
            setStatus('success')
            toast.success('Welcome back!', {
              description: 'Successfully signed in',
            })
            // Navigate to intended path or dashboard after brief success animation
            setTimeout(() => {
              navigate(result.redirectPath || '/dashboard', { replace: true })
            }, 1000)
          }
        } else {
          setStatus('error')
          setErrorMessage(result.error || 'Authentication failed')
          toast.error('Sign in failed', {
            description: result.error || 'Please try again',
          })
        }
      } catch (err) {
        setStatus('error')
        const message = err instanceof Error ? err.message : 'Unknown error occurred'
        setErrorMessage(message)
        toast.error('Sign in failed', {
          description: message,
        })
      }
    }

    processCallback()
  }, [searchParams, handleOAuthCallback, navigate])

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border/40">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className="h-8 w-8 text-primary/20" />
              </div>
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
            <p className="text-lg font-medium mt-6">Completing sign-in...</p>
            <p className="text-sm text-muted-foreground mt-2">
              Securely verifying your identity
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border/40">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Success!</CardTitle>
            <CardDescription>Redirecting to your dashboard...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (status === 'terms_required') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border/40">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
              <Shield className="h-10 w-10 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-2xl">Almost There!</CardTitle>
            <CardDescription>
              Please review and accept our Terms of Service to complete your registration.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Redirecting to Terms of Service...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/40">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Authentication Failed</CardTitle>
          <CardDescription className="mt-2">{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              If you continue to experience issues, please try a different sign-in method or
              contact support.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/login', { replace: true })}
              variant="outline"
              className="flex-1"
            >
              Back to Login
            </Button>
            <Button onClick={() => navigate('/login', { replace: true })} className="flex-1">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
