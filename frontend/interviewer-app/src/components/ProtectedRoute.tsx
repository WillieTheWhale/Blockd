import { Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { getAccessToken, isTokenExpired } from '@/lib/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, logout } = useAuthStore()

  // Check both store state and actual token validity
  const accessToken = getAccessToken()
  const tokenValid = accessToken && !isTokenExpired(accessToken)

  if (!isAuthenticated || !tokenValid) {
    // If token is expired but store thinks we're authenticated, clean up
    if (isAuthenticated && !tokenValid) {
      // Trigger logout to clean up stale state
      void logout()
    }
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
