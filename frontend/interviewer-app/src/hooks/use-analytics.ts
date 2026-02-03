/**
 * Analytics Data Hooks
 * React Query hooks for fetching dashboard analytics data
 */

import { useQuery } from '@tanstack/react-query'
import { QUERY_KEYS, API_ENDPOINTS } from '@/lib/constants'
import { apiRequest } from '@/lib/api-client'

// Types for analytics data
export interface OverviewStat {
  value: number
  description: string
  trend?: {
    value: number
    isPositive: boolean
  }
}

export interface OverviewData {
  totalSessions: OverviewStat
  activeSessions: OverviewStat
  completedToday: OverviewStat
  highRiskAlerts: OverviewStat
}

export interface SessionsChartData {
  date: string
  sessions: number
}

export interface RiskScoreData {
  range: string
  count: number
  color: string
}

export interface ActivityItem {
  id: string
  type: 'session_started' | 'session_ended' | 'alert' | 'candidate_joined' | 'session_cancelled'
  title: string
  description: string
  timestamp: string
  status?: 'success' | 'warning' | 'error' | 'info'
}

export interface DetectionMethod {
  method: string
  count: number
  type: string
}

export interface WeeklyTrend {
  week: string
  total: number
  completed: number
  highRisk: number
}

export interface CandidateSource {
  source: string
  count: number
}

/**
 * Hook to fetch dashboard overview statistics
 */
export function useAnalyticsOverview() {
  return useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.OVERVIEW,
    queryFn: () => apiRequest<OverviewData>('GET', API_ENDPOINTS.ANALYTICS.OVERVIEW),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })
}

/**
 * Hook to fetch sessions over time chart data
 */
export function useAnalyticsSessions(days = 30) {
  return useQuery({
    queryKey: [...QUERY_KEYS.ANALYTICS.SESSIONS, { days }],
    queryFn: () => apiRequest<SessionsChartData[]>('GET', `${API_ENDPOINTS.ANALYTICS.SESSIONS}?days=${days}`),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch risk score distribution
 */
export function useAnalyticsRiskScores() {
  return useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.RISK_SCORES,
    queryFn: () => apiRequest<RiskScoreData[]>('GET', API_ENDPOINTS.ANALYTICS.RISK_SCORES),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch recent activity
 */
export function useAnalyticsActivity() {
  return useQuery({
    queryKey: ['analytics', 'activity'],
    queryFn: () => apiRequest<ActivityItem[]>('GET', '/api/v1/analytics/activity'),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })
}

/**
 * Hook to fetch detection methods breakdown
 */
export function useAnalyticsDetectionMethods() {
  return useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.DETECTION_METHODS,
    queryFn: () => apiRequest<DetectionMethod[]>('GET', API_ENDPOINTS.ANALYTICS.DETECTION_METHODS),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch weekly trends
 */
export function useAnalyticsWeeklyTrends() {
  return useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.WEEKLY_TRENDS,
    queryFn: () => apiRequest<WeeklyTrend[]>('GET', API_ENDPOINTS.ANALYTICS.WEEKLY_TRENDS),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch candidate sources
 */
export function useAnalyticsCandidateSources() {
  return useQuery({
    queryKey: QUERY_KEYS.ANALYTICS.CANDIDATE_SOURCES,
    queryFn: () => apiRequest<CandidateSource[]>('GET', API_ENDPOINTS.ANALYTICS.CANDIDATE_SOURCES),
    staleTime: 60000, // 1 minute
  })
}
