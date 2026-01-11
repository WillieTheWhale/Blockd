import { useState, useMemo, useCallback } from 'react'
import type {
  AIDetectionResult,
  AIDetectionFilterState,
  AIDetectionSortConfig,
  RiskLevel,
} from '@/types'

const ALL_RISK_LEVELS: RiskLevel[] = ['minimal', 'low', 'medium', 'high', 'critical']

const DEFAULT_FILTER_STATE: AIDetectionFilterState = {
  riskLevels: new Set(ALL_RISK_LEVELS),
  minRiskScore: 0,
  maxRiskScore: 100,
  hasFlags: null, // null means "all"
}

const DEFAULT_SORT_CONFIG: AIDetectionSortConfig = {
  field: 'createdAt',
  direction: 'desc',
}

interface UseAIDetectionFiltersParams {
  results: AIDetectionResult[]
}

interface UseAIDetectionFiltersReturn {
  filteredResults: AIDetectionResult[]
  filters: AIDetectionFilterState
  sort: AIDetectionSortConfig
  setRiskLevelFilter: (level: RiskLevel, enabled: boolean) => void
  toggleRiskLevel: (level: RiskLevel) => void
  setAllRiskLevels: (enabled: boolean) => void
  setRiskScoreRange: (min: number, max: number) => void
  setFlagsFilter: (value: boolean | null) => void
  setSortConfig: (config: AIDetectionSortConfig) => void
  setSortField: (field: AIDetectionSortConfig['field']) => void
  toggleSortDirection: () => void
  resetFilters: () => void
  activeFilterCount: number
  isFiltered: boolean
}

/**
 * Hook for managing AI detection filter and sort state
 *
 * @param params - Results to filter
 * @returns Filter state, filtered results, and filter management functions
 */
export function useAIDetectionFilters({
  results,
}: UseAIDetectionFiltersParams): UseAIDetectionFiltersReturn {
  const [filters, setFilters] = useState<AIDetectionFilterState>(DEFAULT_FILTER_STATE)
  const [sort, setSort] = useState<AIDetectionSortConfig>(DEFAULT_SORT_CONFIG)

  // Set individual risk level filter
  const setRiskLevelFilter = useCallback((level: RiskLevel, enabled: boolean) => {
    setFilters((prev) => {
      const newLevels = new Set(prev.riskLevels)
      if (enabled) {
        newLevels.add(level)
      } else {
        newLevels.delete(level)
      }
      return { ...prev, riskLevels: newLevels }
    })
  }, [])

  // Toggle risk level
  const toggleRiskLevel = useCallback((level: RiskLevel) => {
    setFilters((prev) => {
      const newLevels = new Set(prev.riskLevels)
      if (newLevels.has(level)) {
        newLevels.delete(level)
      } else {
        newLevels.add(level)
      }
      return { ...prev, riskLevels: newLevels }
    })
  }, [])

  // Set all risk levels on/off
  const setAllRiskLevels = useCallback((enabled: boolean) => {
    setFilters((prev) => ({
      ...prev,
      riskLevels: enabled ? new Set(ALL_RISK_LEVELS) : new Set(),
    }))
  }, [])

  // Set risk score range
  const setRiskScoreRange = useCallback((min: number, max: number) => {
    setFilters((prev) => ({
      ...prev,
      minRiskScore: min,
      maxRiskScore: max,
    }))
  }, [])

  // Set flags filter
  const setFlagsFilter = useCallback((value: boolean | null) => {
    setFilters((prev) => ({
      ...prev,
      hasFlags: value,
    }))
  }, [])

  // Set full sort config
  const setSortConfig = useCallback((config: AIDetectionSortConfig) => {
    setSort(config)
  }, [])

  // Set sort field (keeps direction)
  const setSortField = useCallback((field: AIDetectionSortConfig['field']) => {
    setSort((prev) => ({ ...prev, field }))
  }, [])

  // Toggle sort direction
  const toggleSortDirection = useCallback(() => {
    setSort((prev) => ({
      ...prev,
      direction: prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }, [])

  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTER_STATE)
    setSort(DEFAULT_SORT_CONFIG)
  }, [])

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0

    // Risk level filter
    if (filters.riskLevels.size < ALL_RISK_LEVELS.length) {
      count++
    }

    // Risk score range filter
    if (filters.minRiskScore > 0 || filters.maxRiskScore < 100) {
      count++
    }

    // Flags filter
    if (filters.hasFlags !== null) {
      count++
    }

    return count
  }, [filters])

  // Check if any filter is active
  const isFiltered = activeFilterCount > 0

  // Apply filters and sort
  const filteredResults = useMemo(() => {
    let filtered = results

    // Filter by risk level
    if (filters.riskLevels.size < ALL_RISK_LEVELS.length) {
      filtered = filtered.filter((r) => filters.riskLevels.has(r.riskLevel))
    }

    // Filter by risk score range
    if (filters.minRiskScore > 0 || filters.maxRiskScore < 100) {
      filtered = filtered.filter(
        (r) =>
          r.riskScore >= filters.minRiskScore &&
          r.riskScore <= filters.maxRiskScore
      )
    }

    // Filter by flags
    if (filters.hasFlags !== null) {
      filtered = filtered.filter((r) =>
        filters.hasFlags ? r.flags.length > 0 : r.flags.length === 0
      )
    }

    // Sort results
    const sorted = [...filtered].sort((a, b) => {
      const multiplier = sort.direction === 'asc' ? 1 : -1

      switch (sort.field) {
        case 'riskScore':
          return (a.riskScore - b.riskScore) * multiplier
        case 'confidence':
          return (a.confidence - b.confidence) * multiplier
        case 'createdAt':
        default:
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
            multiplier
          )
      }
    })

    return sorted
  }, [results, filters, sort])

  return {
    filteredResults,
    filters,
    sort,
    setRiskLevelFilter,
    toggleRiskLevel,
    setAllRiskLevels,
    setRiskScoreRange,
    setFlagsFilter,
    setSortConfig,
    setSortField,
    toggleSortDirection,
    resetFilters,
    activeFilterCount,
    isFiltered,
  }
}
