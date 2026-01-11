import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface AIDetectionLoadingSkeletonProps {
  count?: number
  showSummary?: boolean
  className?: string
}

/**
 * AIDetectionLoadingSkeleton Component
 *
 * Loading skeleton for AI detection results:
 * - Optional summary skeleton
 * - List item skeletons with pulse animation
 */
export function AIDetectionLoadingSkeleton({
  count = 3,
  showSummary = true,
  className,
}: AIDetectionLoadingSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)} aria-busy="true" aria-label="Loading AI detection results">
      {/* Summary Skeleton */}
      {showSummary && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Metrics Grid Skeleton */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <Skeleton className="mb-2 h-4 w-20" />
                  <Skeleton className="mb-2 h-8 w-16" />
                  <Skeleton className="h-1 w-full" />
                </div>
              ))}
            </div>
            {/* Chart Skeleton */}
            <div>
              <Skeleton className="mb-3 h-4 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar Skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-9" />
      </div>

      {/* List Items Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-3">
                  {/* Badge row */}
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  {/* Question text */}
                  <Skeleton className="h-4 w-3/4" />
                  {/* Score bar */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-1.5 w-full" />
                    </div>
                    <div className="text-right">
                      <Skeleton className="mb-1 h-3 w-16" />
                      <Skeleton className="h-4 w-10" />
                    </div>
                  </div>
                  {/* Timestamp */}
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
