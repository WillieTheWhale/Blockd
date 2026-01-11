import { useState } from 'react'
import { Play, Square, Video, VideoOff, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { SessionStatus } from '@/types'

interface SessionControlsProps {
  sessionStatus: SessionStatus
  isConnected: boolean
  isRecording: boolean
  onStartSession: () => Promise<void>
  onEndSession: () => Promise<void>
  className?: string
}

export function SessionControls({
  sessionStatus,
  isConnected,
  isRecording,
  onStartSession,
  onEndSession,
  className,
}: SessionControlsProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const isActive = sessionStatus === 'in_progress'
  const isPending = sessionStatus === 'pending'
  const isEnded = sessionStatus === 'completed' || sessionStatus === 'cancelled'

  const handleStart = async () => {
    setIsStarting(true)
    try {
      await onStartSession()
    } finally {
      setIsStarting(false)
    }
  }

  const handleEnd = async () => {
    setIsEnding(true)
    try {
      await onEndSession()
    } finally {
      setIsEnding(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Status Indicators */}
      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <Badge
          variant="outline"
          className={cn(
            'gap-1',
            isConnected
              ? 'border-green-500 text-green-600'
              : 'border-red-500 text-red-600'
          )}
        >
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3" />
              Connected
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              Disconnected
            </>
          )}
        </Badge>

        {/* Recording Status */}
        {isActive && (
          <Badge
            variant="outline"
            className={cn(
              'gap-1',
              isRecording
                ? 'border-red-500 text-red-600'
                : 'border-gray-500 text-gray-600'
            )}
          >
            {isRecording ? (
              <>
                <Video className="h-3 w-3" />
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                </span>
                Recording
              </>
            ) : (
              <>
                <VideoOff className="h-3 w-3" />
                Not Recording
              </>
            )}
          </Badge>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center gap-2">
        {isPending && (
          <Button
            onClick={handleStart}
            disabled={isStarting || !isConnected}
            className="gap-2"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Session
              </>
            )}
          </Button>
        )}

        {isActive && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2" disabled={isEnding}>
                {isEnding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ending...
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4" />
                    End Session
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End Interview Session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will end the interview session and disconnect the candidate.
                  All recorded data and answers will be saved. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleEnd} className="bg-red-600 hover:bg-red-700">
                  End Session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {isEnded && (
          <Badge variant="secondary" className="gap-1 text-sm">
            <Square className="h-3 w-3" />
            Session Ended
          </Badge>
        )}
      </div>
    </div>
  )
}
