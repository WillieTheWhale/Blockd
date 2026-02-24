import { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isApiError } from '@/lib/api-client'
import { Toaster } from '@/components/ui/toast'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ErrorBoundary, ErrorFallback } from '@/components/ErrorBoundary'
import { MainLayout } from '@/layouts/MainLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { LandingPage } from '@/pages/LandingPage'
import { DownloadPage } from '@/pages/DownloadPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { TermsOfServicePage } from '@/pages/TermsOfServicePage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { SessionDetailPage } from '@/pages/SessionDetailPage'
import { CreateSessionPage } from '@/pages/CreateSessionPage'
import { InterviewSessionPage } from '@/pages/InterviewSessionPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { OAuthCallbackPage } from '@/pages/OAuthCallbackPage'

/**
 * Page-level error boundary wrapper
 * Provides granular error isolation so one page error doesn't crash the app
 */
function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={<ErrorFallback variant="page" />}>
      {children}
    </ErrorBoundary>
  )
}

// Create a client with production-ready configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry failed requests with exponential backoff
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (client errors)
        if (isApiError(error)) {
          if (error.status >= 400 && error.status < 500) {
            return false
          }
        }
        // Retry up to 3 times for server errors
        return failureCount < 3
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    },
    mutations: {
      // Retry mutations once for network errors
      retry: 1,
      retryDelay: 1000,
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Landing page - standalone with its own dark theme layout */}
            <Route path="/" element={<LandingPage />} />

            {/* Other public pages with light theme layout */}
            <Route element={<PublicLayout />}>
              <Route path="/download" element={<DownloadPage />} />
            </Route>

            {/* Auth routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>

            {/* Terms of Service - standalone pages without layout wrapper */}
            <Route path="/terms-agreement" element={<TermsOfServicePage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />

            {/* OAuth callback - standalone page without layout */}
            <Route path="/auth/callback" element={<OAuthCallbackPage />} />

            {/* Protected routes with page-level error boundaries */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<PageErrorBoundary><DashboardPage /></PageErrorBoundary>} />
              <Route path="/sessions" element={<PageErrorBoundary><SessionsPage /></PageErrorBoundary>} />
              <Route path="/sessions/create" element={<PageErrorBoundary><CreateSessionPage /></PageErrorBoundary>} />
              <Route path="/sessions/:id" element={<PageErrorBoundary><SessionDetailPage /></PageErrorBoundary>} />
              <Route path="/sessions/:id/live" element={<PageErrorBoundary><InterviewSessionPage /></PageErrorBoundary>} />
              <Route path="/analytics" element={<PageErrorBoundary><AnalyticsPage /></PageErrorBoundary>} />
              <Route path="/reports" element={<PageErrorBoundary><ReportsPage /></PageErrorBoundary>} />
              <Route path="/settings" element={<PageErrorBoundary><SettingsPage /></PageErrorBoundary>} />
            </Route>

            {/* Catch all - 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>

        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
