import { useRef, useEffect, useState, useCallback } from 'react'
import h337 from 'heatmap.js'
import { Play, Pause, RotateCcw, Download, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { GazeData, GazePoint } from '@/types'

interface GazeHeatmapProps {
  sessionId: string
  width?: number
  height?: number
  className?: string
  overlayVideo?: boolean
  isRecorded?: boolean
}

/**
 * GazeHeatmap Component
 *
 * Features:
 * - Canvas-based heatmap rendering using heatmap.js
 * - Real-time gaze point plotting
 * - Color gradient (blue to red for intensity)
 * - Overlay on video or static frame
 * - Playback controls for recorded sessions
 * - Export as PNG
 * - Off-screen indicators (arrows showing direction)
 */
export function GazeHeatmap({
  sessionId,
  width = 1280,
  height = 720,
  className,
  overlayVideo = false,
  isRecorded = false,
}: GazeHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const heatmapInstanceRef = useRef<h337.Heatmap<'value', 'x', 'y'> | null>(null)

  const [isPlaying, setIsPlaying] = useState(!isRecorded)
  const [playbackIndex, setPlaybackIndex] = useState(0)
  const [allGazePoints, setAllGazePoints] = useState<GazePoint[]>([])
  const [offScreenIndicators, setOffScreenIndicators] = useState<{
    top: number
    bottom: number
    left: number
    right: number
  }>({ top: 0, bottom: 0, left: 0, right: 0 })

  const { gazeData } = useRealtimeStore()
  const { subscribe } = useWebSocket({ sessionId })

  /**
   * Initialize heatmap
   */
  useEffect(() => {
    if (!containerRef.current) return

    // Create heatmap instance
    const heatmap = h337.create({
      container: containerRef.current,
      radius: 40,
      maxOpacity: 0.6,
      minOpacity: 0,
      blur: 0.75,
      gradient: {
        '0.0': 'blue',
        '0.25': 'cyan',
        '0.5': 'lime',
        '0.75': 'yellow',
        '1.0': 'red',
      },
    })

    heatmapInstanceRef.current = heatmap

    return () => {
      // Cleanup
      heatmapInstanceRef.current = null
    }
  }, [])

  /**
   * Subscribe to gaze updates (real-time mode)
   */
  useEffect(() => {
    if (isRecorded) return

    const unsubscribe = subscribe<GazeData>('gaze:update', (data) => {
      if (data.sessionId === sessionId && isPlaying) {
        addGazePoints(data.points)
      }
    })

    return unsubscribe
  }, [subscribe, sessionId, isPlaying, isRecorded])

  /**
   * Load gaze data for recorded sessions
   */
  useEffect(() => {
    if (!isRecorded) return

    // Get all gaze data for this session
    const sessionGazeData = gazeData.filter((data) => data.sessionId === sessionId)
    const points = sessionGazeData.flatMap((data) => data.points)

    // Sort by timestamp
    points.sort((a, b) => a.timestamp - b.timestamp)

    setAllGazePoints(points)
  }, [isRecorded, gazeData, sessionId])

  /**
   * Playback timer for recorded sessions
   */
  useEffect(() => {
    if (!isRecorded || !isPlaying || playbackIndex >= allGazePoints.length) {
      if (playbackIndex >= allGazePoints.length) {
        setIsPlaying(false)
      }
      return
    }

    const interval = setInterval(() => {
      const point = allGazePoints[playbackIndex]
      if (point) {
        addGazePoints([point])
        setPlaybackIndex((prev) => prev + 1)
      }
    }, 100) // 10 Hz playback

    return () => {
      clearInterval(interval)
    }
  }, [isRecorded, isPlaying, playbackIndex, allGazePoints])

  /**
   * Add gaze points to heatmap
   */
  const addGazePoints = useCallback(
    (points: GazePoint[]) => {
      if (!heatmapInstanceRef.current) return

      const dataPoints: { x: number; y: number; value: number }[] = []
      let offScreen = { top: 0, bottom: 0, left: 0, right: 0 }

      points.forEach((point) => {
        // Normalize coordinates to heatmap dimensions
        const x = Math.round(point.x * width)
        const y = Math.round(point.y * height)

        // Check if point is on-screen
        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          dataPoints.push({
            x,
            y,
            value: point.confidence || 1,
          })
        } else {
          // Count off-screen points by direction
          if (y < 0) offScreen.top++
          if (y > height) offScreen.bottom++
          if (x < 0) offScreen.left++
          if (x > width) offScreen.right++
        }
      })

      if (dataPoints.length > 0) {
        heatmapInstanceRef.current.addData(dataPoints)
      }

      setOffScreenIndicators(offScreen)
    },
    [width, height]
  )

  /**
   * Reset heatmap
   */
  const handleReset = useCallback(() => {
    if (!heatmapInstanceRef.current) return

    heatmapInstanceRef.current.setData({ data: [], max: 1, min: 0 })
    setPlaybackIndex(0)
    setOffScreenIndicators({ top: 0, bottom: 0, left: 0, right: 0 })
  }, [])

  /**
   * Toggle playback
   */
  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev)
  }, [])

  /**
   * Export heatmap as PNG
   */
  const handleExport = useCallback(() => {
    if (!containerRef.current) return

    const canvas = containerRef.current.querySelector('canvas')
    if (!canvas) return

    canvas.toBlob((blob) => {
      if (!blob) return

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gaze-heatmap-${sessionId}-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [sessionId])

  /**
   * Calculate playback progress
   */
  const playbackProgress = isRecorded
    ? allGazePoints.length > 0
      ? (playbackIndex / allGazePoints.length) * 100
      : 0
    : 0

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gaze Heatmap</CardTitle>
            <CardDescription>Eye tracking visualization</CardDescription>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {isRecorded && (
              <>
                <Button variant="outline" size="sm" onClick={handlePlayPause}>
                  {isPlaying ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Play
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </>
            )}
            {!isRecorded && (
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Playback Progress */}
        {isRecorded && (
          <div className="mt-4 space-y-2">
            <Progress value={playbackProgress} />
            <div className="text-xs text-muted-foreground">
              {playbackIndex} / {allGazePoints.length} points
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="relative" style={{ width, height }}>
          {/* Heatmap Container */}
          <div
            ref={containerRef}
            className={cn('absolute inset-0', overlayVideo && 'pointer-events-none')}
            style={{ width, height }}
          />

          {/* Off-screen Indicators */}
          {offScreenIndicators.top > 0 && (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-blue-500 px-3 py-1 text-xs text-white shadow-lg">
              <ArrowUp className="inline h-3 w-3" /> {offScreenIndicators.top}
            </div>
          )}
          {offScreenIndicators.bottom > 0 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-3 py-1 text-xs text-white shadow-lg">
              <ArrowDown className="inline h-3 w-3" /> {offScreenIndicators.bottom}
            </div>
          )}
          {offScreenIndicators.left > 0 && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-blue-500 px-3 py-1 text-xs text-white shadow-lg">
              <ArrowLeft className="inline h-3 w-3" /> {offScreenIndicators.left}
            </div>
          )}
          {offScreenIndicators.right > 0 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-blue-500 px-3 py-1 text-xs text-white shadow-lg">
              <ArrowRight className="inline h-3 w-3" /> {offScreenIndicators.right}
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 rounded-lg bg-white/90 p-3 shadow-lg dark:bg-gray-900/90">
            <div className="mb-2 text-xs font-semibold">Gaze Intensity</div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-32 rounded bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500" />
              <div className="flex justify-between text-xs">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
