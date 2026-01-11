import { useMemo } from 'react'
import {
  Filter,
  SortAsc,
  SortDesc,
  X,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { RISK_LEVEL_CONFIG } from '@/hooks/useAIDetectionAnalysis'
import type {
  RiskLevel,
  AIDetectionFilterState,
  AIDetectionSortConfig,
} from '@/types'

interface AIDetectionFiltersProps {
  filters: AIDetectionFilterState
  sort: AIDetectionSortConfig
  onToggleRiskLevel: (level: RiskLevel) => void
  onSetAllRiskLevels: (enabled: boolean) => void
  onSetRiskScoreRange: (min: number, max: number) => void
  onSetFlagsFilter: (value: boolean | null) => void
  onSetSortField: (field: AIDetectionSortConfig['field']) => void
  onToggleSortDirection: () => void
  onReset: () => void
  activeFilterCount: number
  className?: string
}

const RISK_LEVELS: RiskLevel[] = ['minimal', 'low', 'medium', 'high', 'critical']

/**
 * AIDetectionFilters Component
 *
 * Provides filter and sort controls for AI detection results:
 * - Risk level checkboxes with color indicators
 * - Risk score range slider
 * - Flags filter (all/flagged/clean)
 * - Sort options (field + direction)
 * - Reset button
 */
export function AIDetectionFilters({
  filters,
  sort,
  onToggleRiskLevel,
  onSetAllRiskLevels,
  onSetRiskScoreRange,
  onSetFlagsFilter,
  onSetSortField,
  onToggleSortDirection,
  onReset,
  activeFilterCount,
  className,
}: AIDetectionFiltersProps) {
  // Check if all risk levels are selected
  const allRiskLevelsSelected = useMemo(
    () => filters.riskLevels.size === RISK_LEVELS.length,
    [filters.riskLevels]
  )

  // Get flags filter value as string for RadioGroup
  const flagsFilterValue = useMemo(() => {
    if (filters.hasFlags === null) return 'all'
    return filters.hasFlags ? 'flagged' : 'clean'
  }, [filters.hasFlags])

  const handleFlagsChange = (value: string) => {
    if (value === 'all') onSetFlagsFilter(null)
    else if (value === 'flagged') onSetFlagsFilter(true)
    else onSetFlagsFilter(false)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* Filter Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 w-5 rounded-full p-0 text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filter Results</h4>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReset}
                  className="h-8 gap-1 text-xs"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Reset
                </Button>
              )}
            </div>

            <Separator />

            {/* Risk Level Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Risk Level</Label>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => onSetAllRiskLevels(!allRiskLevelsSelected)}
                  className="h-auto p-0 text-xs"
                >
                  {allRiskLevelsSelected ? 'Clear all' : 'Select all'}
                </Button>
              </div>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label="Filter by risk level"
              >
                {RISK_LEVELS.map((level) => {
                  const config = RISK_LEVEL_CONFIG[level]
                  const isChecked = filters.riskLevels.has(level)
                  return (
                    <div key={level} className="flex items-center space-x-2">
                      <Checkbox
                        id={`risk-${level}`}
                        checked={isChecked}
                        onCheckedChange={() => onToggleRiskLevel(level)}
                        aria-label={`Filter by ${config.label} risk`}
                      />
                      <Label
                        htmlFor={`risk-${level}`}
                        className={cn(
                          'cursor-pointer text-sm',
                          config.color
                        )}
                      >
                        {config.label}
                      </Label>
                    </div>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Risk Score Range */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Risk Score Range: {filters.minRiskScore}% - {filters.maxRiskScore}%
              </Label>
              <Slider
                value={[filters.minRiskScore, filters.maxRiskScore]}
                onValueChange={(values: number[]) => onSetRiskScoreRange(values[0] ?? 0, values[1] ?? 100)}
                min={0}
                max={100}
                step={5}
                className="py-2"
                aria-label="Risk score range"
              />
            </div>

            <Separator />

            {/* Flags Filter */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Flags</Label>
              <RadioGroup
                value={flagsFilterValue}
                onValueChange={handleFlagsChange}
                className="flex gap-4"
                aria-label="Filter by flags"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="flags-all" />
                  <Label htmlFor="flags-all" className="cursor-pointer text-sm">
                    All
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="flagged" id="flags-flagged" />
                  <Label htmlFor="flags-flagged" className="cursor-pointer text-sm">
                    Flagged
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="clean" id="flags-clean" />
                  <Label htmlFor="flags-clean" className="cursor-pointer text-sm">
                    Clean
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Sort Controls */}
      <div className="flex items-center gap-1">
        <Select
          value={sort.field}
          onValueChange={(value) =>
            onSetSortField(value as AIDetectionSortConfig['field'])
          }
        >
          <SelectTrigger
            className="h-9 w-[140px]"
            aria-label="Sort by field"
          >
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Date</SelectItem>
            <SelectItem value="riskScore">Risk Score</SelectItem>
            <SelectItem value="confidence">Confidence</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={onToggleSortDirection}
          aria-label={`Sort ${sort.direction === 'asc' ? 'ascending' : 'descending'}`}
        >
          {sort.direction === 'asc' ? (
            <SortAsc className="h-4 w-4" />
          ) : (
            <SortDesc className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1">
          {filters.riskLevels.size < RISK_LEVELS.length && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {filters.riskLevels.size} risk levels
              <button
                onClick={() => onSetAllRiskLevels(true)}
                className="ml-1 hover:text-foreground"
                aria-label="Clear risk level filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {(filters.minRiskScore > 0 || filters.maxRiskScore < 100) && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {filters.minRiskScore}-{filters.maxRiskScore}%
              <button
                onClick={() => onSetRiskScoreRange(0, 100)}
                className="ml-1 hover:text-foreground"
                aria-label="Clear score range filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.hasFlags !== null && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {filters.hasFlags ? 'Flagged only' : 'Clean only'}
              <button
                onClick={() => onSetFlagsFilter(null)}
                className="ml-1 hover:text-foreground"
                aria-label="Clear flags filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
