import { useState, useCallback, useMemo } from 'react'
import { AlertCircle, FileQuestion } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAIDetectionAnalysis } from '@/hooks/useAIDetectionAnalysis'
import { useAIDetectionFilters } from '@/hooks/useAIDetectionFilters'
import { AIDetectionSummary } from './AIDetectionSummary'
import { AIDetectionFilters } from './AIDetectionFilters'
import { AIDetectionListItem } from './AIDetectionListItem'
import { AIDetectionLoadingSkeleton } from './AIDetectionLoadingSkeleton'
import { AIDetectionProgress } from './AIDetectionProgress'
import type { AIDetectionResult, Question, AIDetectionProgressEvent } from '@/types'

interface AIDetectionContainerProps {
  results: AIDetectionResult[]
  questions?: Question[]
  isLoading?: boolean
  error?: Error | null
  progressEvent?: AIDetectionProgressEvent | null
  onResultSelect?: (result: AIDetectionResult) => void
  selectedResultId?: string | null
  showSummary?: boolean
  maxHeight?: string | number
  className?: string
}

/**
 * AIDetectionContainer Component
 *
 * Main container that orchestrates AI detection display:
 * - Summary dashboard (optional)
 * - Filter and sort controls
 * - Progress indicator for active analyses
 * - Scrollable list of results
 * - Empty and error states
 *
 * Uses the clean architecture hooks for state management:
 * - useAIDetectionAnalysis for computed stats
 * - useAIDetectionFilters for filtering/sorting
 */
export function AIDetectionContainer({
  results,
  questions = [],
  isLoading = false,
  error = null,
  progressEvent = null,
  onResultSelect,
  selectedResultId = null,
  showSummary = true,
  maxHeight = '600px',
  className,
}: AIDetectionContainerProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)

  // Use external or internal selection state
  const effectiveSelectedId = selectedResultId ?? internalSelectedId

  // Analysis hook for stats and mappings
  const { stats, questionMap, getQuestionContext } = useAIDetectionAnalysis({
    results,
    questions,
  })

  // Filter hook for filtering/sorting
  const {
    filteredResults,
    filters,
    sort,
    toggleRiskLevel,
    setAllRiskLevels,
    setRiskScoreRange,
    setFlagsFilter,
    setSortField,
    toggleSortDirection,
    resetFilters,
    activeFilterCount,
    isFiltered,
  } = useAIDetectionFilters({ results })

  // Handle result selection
  const handleResultClick = useCallback(
    (result: AIDetectionResult) => {
      if (onResultSelect) {
        onResultSelect(result)
      } else {
        setInternalSelectedId((prev) =>
          prev === result.id ? null : result.id
        )
      }
    },
    [onResultSelect]
  )

  // Show progress indicator
  const showProgress = useMemo(
    () =>
      progressEvent &&
      (progressEvent.status === 'started' || progressEvent.status === 'processing'),
    [progressEvent]
  )

  // Loading state
  if (isLoading) {
    return (
      <AIDetectionLoadingSkeleton
        count={3}
        showSummary={showSummary}
        className={className}
      />
    )
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Results</AlertTitle>
        <AlertDescription>
          {error.message || 'Failed to load AI detection results. Please try again.'}
        </AlertDescription>
      </Alert>
    )
  }

  // Empty state
  if (results.length === 0 && !showProgress) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center',
          className
        )}
      >
        <FileQuestion
          className="mb-4 h-12 w-12 text-muted-foreground"
          aria-hidden="true"
        />
        <h3 className="mb-2 text-lg font-medium">No AI Detection Results</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          AI detection results will appear here once the candidate submits answers
          and the analysis is complete.
        </p>
      </div>
    )
  }

  // Filtered empty state
  const showFilteredEmpty = filteredResults.length === 0 && results.length > 0

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress Indicator */}
      {showProgress && progressEvent && (
        <AIDetectionProgress
          event={progressEvent}
          questionText={
            progressEvent.questionId
              ? questionMap.get(progressEvent.questionId)?.content
              : undefined
          }
        />
      )}

      {/* Summary Dashboard */}
      {showSummary && stats && results.length > 0 && (
        <AIDetectionSummary results={results} questions={questions} />
      )}

      {/* Filter Controls */}
      {results.length > 0 && (
        <AIDetectionFilters
          filters={filters}
          sort={sort}
          onToggleRiskLevel={toggleRiskLevel}
          onSetAllRiskLevels={setAllRiskLevels}
          onSetRiskScoreRange={setRiskScoreRange}
          onSetFlagsFilter={setFlagsFilter}
          onSetSortField={setSortField}
          onToggleSortDirection={toggleSortDirection}
          onReset={resetFilters}
          activeFilterCount={activeFilterCount}
        />
      )}

      {/* Results List */}
      {showFilteredEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <FileQuestion
            className="mb-4 h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
          <h3 className="mb-2 font-medium">No Matching Results</h3>
          <p className="mb-4 max-w-sm text-sm text-muted-foreground">
            No results match your current filters. Try adjusting the filter criteria.
          </p>
          <button
            onClick={resetFilters}
            className="text-sm text-primary hover:underline"
          >
            Reset all filters
          </button>
        </div>
      ) : (
        <ScrollArea
          className="rounded-lg border"
          style={{ maxHeight }}
        >
          <div
            className="space-y-2 p-2"
            role="list"
            aria-label={`AI detection results${isFiltered ? ' (filtered)' : ''}`}
          >
            {/* Results count */}
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {isFiltered
                ? `Showing ${filteredResults.length} of ${results.length} results`
                : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
            </div>

            {/* Result items */}
            {filteredResults.map((result) => (
              <AIDetectionListItem
                key={result.id}
                result={result}
                question={getQuestionContext(result)}
                isSelected={effectiveSelectedId === result.id}
                onClick={() => handleResultClick(result)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
