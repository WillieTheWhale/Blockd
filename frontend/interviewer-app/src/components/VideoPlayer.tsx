import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Maximize,
  Minimize,
  Download,
  Settings,
  Volume2,
  VolumeX,
  Circle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useWebRTC } from '@/hooks/useWebRTC'
import type { VideoStreamStats } from '@/types'

interface VideoPlayerProps {
  sessionId: string
  isProducer?: boolean
  producerId?: string
  className?: string
  showControls?: boolean
  showStats?: boolean
  isRecording?: boolean
  autoPlay?: boolean
}

/**
 * VideoPlayer Component
 *
 * Features:
 * - WebRTC video display using mediasoup-client
 * - Video controls (mute, volume, fullscreen)
 * - Connection status indicator
 * - Bandwidth and latency display
 * - Picture-in-picture support
 * - Recording indicator
 * - Screenshot capability
 * - Device selection (camera/microphone)
 */
export function VideoPlayer({
  sessionId,
  isProducer = false,
  producerId,
  className,
  showControls = true,
  showStats = true,
  isRecording = false,
  autoPlay = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isPipEnabled, setIsPipEnabled] = useState(false)
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([])
  const [localError, setLocalError] = useState<string | null>(null)

  const {
    localStream,
    remoteStream,
    connectionState,
    stats,
    error,
    startProducing,
    stopProducing,
    startConsuming,
    toggleVideo,
    toggleAudio,
    changeVideoDevice,
    changeAudioDevice,
    isVideoEnabled,
    isAudioEnabled,
  } = useWebRTC({
    sessionId,
    isProducer,
    autoStart: autoPlay,
  })

  /**
   * Set video stream to video element
   */
  useEffect(() => {
    if (!videoRef.current) return

    const stream = isProducer ? localStream : remoteStream
    if (stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch((err: Error) => {
        // AbortError is expected when stream changes rapidly - ignore it
        if (err.name === 'AbortError') return
        // NotAllowedError is expected if autoplay is blocked - user will click to play
        if (err.name === 'NotAllowedError') {
          setLocalError('Click to start video playback')
          return
        }
        setLocalError(`Video playback failed: ${err.message}`)
      })
    }
  }, [localStream, remoteStream, isProducer])

  /**
   * Start consuming if producerId is provided
   */
  useEffect(() => {
    if (!isProducer && producerId) {
      startConsuming(producerId).catch((err: Error) => {
        setLocalError(`Failed to connect to video stream: ${err.message}`)
      })
    }
  }, [isProducer, producerId, startConsuming])

  /**
   * Load available media devices
   */
  useEffect(() => {
    loadMediaDevices()
  }, [])

  /**
   * Load available media devices
   */
  const loadMediaDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAvailableDevices(devices)
    } catch (error) {
      console.error('Failed to load media devices:', error)
    }
  }

  /**
   * Handle fullscreen toggle
   */
  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
        .then(() => {
          setIsFullscreen(true)
        })
        .catch((err: Error) => {
          // Fullscreen may fail due to browser restrictions or user settings
          if (process.env.NODE_ENV === 'development') {
            console.debug('Fullscreen request failed:', err.message)
          }
        })
    } else {
      document.exitFullscreen()
        .then(() => {
          setIsFullscreen(false)
        })
        .catch((err: Error) => {
          // Exit fullscreen failure is rare but possible
          if (process.env.NODE_ENV === 'development') {
            console.debug('Exit fullscreen failed:', err.message)
          }
        })
    }
  }, [])

  /**
   * Handle screenshot
   */
  const handleScreenshot = useCallback(() => {
    if (!videoRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) return

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `screenshot-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [])

  /**
   * Handle picture-in-picture toggle
   */
  const handlePictureInPicture = useCallback(async () => {
    if (!videoRef.current) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        setIsPipEnabled(false)
      } else {
        await videoRef.current.requestPictureInPicture()
        setIsPipEnabled(true)
      }
    } catch (error) {
      console.error('Picture-in-picture error:', error)
    }
  }, [])

  /**
   * Handle mute toggle
   */
  const handleMuteToggle = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }, [isMuted])

  /**
   * Handle volume change
   */
  const handleVolumeChange = useCallback((newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume
      setVolume(newVolume)
      setIsMuted(newVolume === 0)
    }
  }, [])

  /**
   * Get connection status badge variant
   */
  const getConnectionBadgeVariant = () => {
    switch (connectionState) {
      case 'connected':
        return 'default'
      case 'connecting':
      case 'new':
        return 'secondary'
      case 'failed':
      case 'closed':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  /**
   * Format bandwidth for display
   */
  const formatBandwidth = (bandwidth: number): string => {
    if (bandwidth < 1000) return `${bandwidth} Kbps`
    return `${(bandwidth / 1000).toFixed(1)} Mbps`
  }

  /**
   * Get video and audio devices
   */
  const videoDevices = availableDevices.filter((d) => d.kind === 'videoinput')
  const audioDevices = availableDevices.filter((d) => d.kind === 'audioinput')

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-lg bg-black',
        className
      )}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        muted={isProducer || isMuted}
      />

      {/* Connection Status Overlay */}
      {(connectionState !== 'connected' || localError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            {connectionState !== 'connected' && (
              <div className="mb-2 text-lg font-semibold capitalize">{connectionState}</div>
            )}
            {(error || localError) && (
              <div className="text-sm text-red-300">{error || localError}</div>
            )}
            {localError && connectionState === 'connected' && (
              <button
                className="mt-2 rounded bg-white/20 px-4 py-2 text-sm hover:bg-white/30"
                onClick={() => {
                  setLocalError(null)
                  videoRef.current?.play().catch(() => {})
                }}
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Bar - Status Indicators */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="flex items-center gap-2">
          <Badge variant={getConnectionBadgeVariant()}>{connectionState}</Badge>
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse">
              <Circle className="mr-1 h-2 w-2 fill-current" />
              Recording
            </Badge>
          )}
        </div>

        {/* Stream Stats */}
        {showStats && stats && (
          <div className="flex items-center gap-4 text-xs text-white">
            <div>
              <span className="opacity-70">Bandwidth:</span> {formatBandwidth(stats.bandwidth)}
            </div>
            <div>
              <span className="opacity-70">Latency:</span> {stats.latency}ms
            </div>
            <div>
              <span className="opacity-70">FPS:</span> {stats.frameRate}
            </div>
            <div>
              <span className="opacity-70">Resolution:</span> {stats.resolution.width}x
              {stats.resolution.height}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar - Controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <div className="flex items-center justify-between">
            {/* Left Controls */}
            <div className="flex items-center gap-2">
              {isProducer && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleVideo}
                    className="text-white hover:bg-white/20"
                    title={isVideoEnabled ? 'Disable video' : 'Enable video'}
                  >
                    {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleAudio}
                    className="text-white hover:bg-white/20"
                    title={isAudioEnabled ? 'Mute audio' : 'Unmute audio'}
                  >
                    {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </Button>
                </>
              )}

              {!isProducer && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleMuteToggle}
                  className="text-white hover:bg-white/20"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleScreenshot}
                className="text-white hover:bg-white/20"
                title="Take screenshot"
              >
                <Download className="h-5 w-5" />
              </Button>

              {/* Device Settings */}
              {isProducer && (videoDevices.length > 0 || audioDevices.length > 0) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      title="Device settings"
                    >
                      <Settings className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {videoDevices.length > 0 && (
                      <>
                        <DropdownMenuLabel>Camera</DropdownMenuLabel>
                        {videoDevices.map((device) => (
                          <DropdownMenuItem
                            key={device.deviceId}
                            onClick={() => changeVideoDevice(device.deviceId)}
                          >
                            {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {audioDevices.length > 0 && (
                      <>
                        <DropdownMenuLabel>Microphone</DropdownMenuLabel>
                        {audioDevices.map((device) => (
                          <DropdownMenuItem
                            key={device.deviceId}
                            onClick={() => changeAudioDevice(device.deviceId)}
                          >
                            {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleFullscreen}
                className="text-white hover:bg-white/20"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
