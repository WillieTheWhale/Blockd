import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Error reporting utility
 * Sends errors to monitoring service (Sentry, custom endpoint, etc.)
 *
 * In production, configure Sentry by installing @sentry/react and calling:
 * Sentry.init({ dsn: 'YOUR_DSN' }) in your app entry point
 */
function reportError(error: Error, errorInfo: ErrorInfo): void {
  // Check if Sentry is available (dynamically, to avoid hard dependency)
  const Sentry = (window as unknown as { Sentry?: { captureException: (e: Error, context: object) => void } }).Sentry

  if (Sentry && typeof Sentry.captureException === 'function') {
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      },
    })
    return
  }

  // Fallback: Send to custom error endpoint if configured
  const errorEndpoint = import.meta.env['VITE_ERROR_REPORTING_URL']
  if (errorEndpoint && import.meta.env['MODE'] === 'production') {
    fetch(errorEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {
      // Silently fail - we don't want error reporting to cause more errors
    })
  }
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child component tree and displays fallback UI.
 *
 * Usage:
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * With custom fallback:
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    // Report error to monitoring service
    reportError(error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  handleGoHome = (): void => {
    window.location.href = '/dashboard'
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. We apologize for the inconvenience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error details (development only) */}
              {import.meta.env.DEV && this.state.error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-4">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                    Error Details
                  </h4>
                  <pre className="text-xs text-red-700 dark:text-red-300 overflow-auto max-h-32">
                    {this.state.error.message}
                  </pre>
                  {this.state.errorInfo && (
                    <pre className="text-xs text-red-600 dark:text-red-400 overflow-auto max-h-32 mt-2">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={this.handleReset}
                  className="flex-1"
                  variant="default"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  className="flex-1"
                  variant="outline"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Go to Dashboard
                </Button>
              </div>

              {/* Support info */}
              <p className="text-center text-xs text-muted-foreground">
                If this problem persists, please contact{' '}
                <a href="mailto:support@blockd.io" className="underline hover:text-primary">
                  support@blockd.io
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Inline Error Fallback Component
 * For smaller, inline error displays within components.
 */
interface ErrorFallbackProps {
  error?: Error | null
  resetErrorBoundary?: () => void
  variant?: 'page' | 'inline' | 'minimal'
}

export function ErrorFallback({
  error,
  resetErrorBoundary,
  variant = 'inline',
}: ErrorFallbackProps) {
  if (variant === 'minimal') {
    return (
      <div className="flex items-center gap-2 text-red-500 p-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm">Error loading content</span>
        {resetErrorBoundary && (
          <Button size="sm" variant="ghost" onClick={resetErrorBoundary}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
              Error loading component
            </h4>
            {error && (
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {error.message}
              </p>
            )}
            {resetErrorBoundary && (
              <Button
                size="sm"
                variant="outline"
                onClick={resetErrorBoundary}
                className="mt-3"
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // variant === 'page' - full page error (similar to main ErrorBoundary)
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-2" />
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            {error?.message || 'An unexpected error occurred'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetErrorBoundary && (
            <Button onClick={resetErrorBoundary} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ErrorBoundary
