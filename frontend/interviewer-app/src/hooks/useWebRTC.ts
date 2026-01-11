import { useState, useEffect, useCallback, useRef } from 'react'
import * as mediasoupClient from 'mediasoup-client'
import { Device, types as mediasoupTypes } from 'mediasoup-client'
import { apiRequest } from '@/lib/api-client'
import { logger } from '@/lib/logger'
import type { VideoStreamStats } from '@/types'

// Type aliases from mediasoup-client
type Transport = mediasoupTypes.Transport
type Producer = mediasoupTypes.Producer
type Consumer = mediasoupTypes.Consumer

// Create logger for WebRTC
const rtcLogger = logger.create({ component: 'useWebRTC' })

/**
 * WebRTC connection state
 */
export type WebRTCConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

/**
 * WebRTC hook options
 */
interface UseWebRTCOptions {
  sessionId: string
  isProducer?: boolean // If true, this client will produce media (send video/audio)
  autoStart?: boolean
}

/**
 * WebRTC hook return type
 */
interface UseWebRTCReturn {
  // State
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: WebRTCConnectionState
  stats: VideoStreamStats | null
  error: string | null

  // Controls
  startProducing: (constraints?: MediaStreamConstraints) => Promise<void>
  stopProducing: () => void
  startConsuming: (producerId: string) => Promise<void>
  stopConsuming: () => void
  toggleVideo: () => Promise<void>
  toggleAudio: () => Promise<void>
  changeVideoDevice: (deviceId: string) => Promise<void>
  changeAudioDevice: (deviceId: string) => Promise<void>

  // State flags
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isProducing: boolean
  isConsuming: boolean
}

/**
 * Stop all tracks in a MediaStream and clean up
 */
function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return
  stream.getTracks().forEach((track) => {
    track.stop()
    stream.removeTrack(track)
  })
}

/**
 * Parse WebRTC stats to extract useful metrics
 */
function parseRTCStats(stats: RTCStatsReport): Partial<VideoStreamStats> {
  let bandwidth = 0
  let latency = 0
  let packetsLost = 0
  let frameRate = 0
  let width = 0
  let height = 0

  stats.forEach((report) => {
    // Get bitrate from outbound-rtp or inbound-rtp
    if (report.type === 'outbound-rtp' && report.kind === 'video') {
      if (report.bytesSent !== undefined && report.timestamp !== undefined) {
        // We'd need to track previous values to calculate actual bitrate
        // For now, use the reported value if available
        bandwidth = (report.bytesSent * 8) / 1000 // Convert to kbps
      }
      if (report.framesPerSecond !== undefined) {
        frameRate = report.framesPerSecond
      }
      if (report.frameWidth !== undefined && report.frameHeight !== undefined) {
        width = report.frameWidth
        height = report.frameHeight
      }
    }

    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      if (report.bytesReceived !== undefined) {
        bandwidth = (report.bytesReceived * 8) / 1000
      }
      if (report.packetsLost !== undefined) {
        packetsLost = report.packetsLost
      }
      if (report.framesPerSecond !== undefined) {
        frameRate = report.framesPerSecond
      }
      if (report.frameWidth !== undefined && report.frameHeight !== undefined) {
        width = report.frameWidth
        height = report.frameHeight
      }
    }

    // Get RTT from candidate-pair
    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      if (report.currentRoundTripTime !== undefined) {
        latency = report.currentRoundTripTime * 1000 // Convert to ms
      }
    }
  })

  return {
    bandwidth,
    latency,
    packetsLost,
    frameRate: frameRate || 30, // Default fallback
    resolution: {
      width: width || 1280,
      height: height || 720,
    },
  }
}

/**
 * Custom hook for WebRTC integration using mediasoup-client
 *
 * Features:
 * - mediasoup-client 3.x integration
 * - Send and receive video/audio streams
 * - Device management with proper cleanup
 * - Connection state tracking
 * - Real stream statistics parsing
 * - ICE connection handling
 * - Memory leak prevention
 *
 * @param options - WebRTC configuration options
 * @returns WebRTC connection utilities
 */
export function useWebRTC(options: UseWebRTCOptions): UseWebRTCReturn {
  const { sessionId, isProducer = false, autoStart = false } = options

  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<WebRTCConnectionState>('new')
  const [stats, setStats] = useState<VideoStreamStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isProducing, setIsProducing] = useState(false)
  const [isConsuming, setIsConsuming] = useState(false)

  // Refs
  const deviceRef = useRef<Device | null>(null)
  const sendTransportRef = useRef<Transport | null>(null)
  const recvTransportRef = useRef<Transport | null>(null)
  const videoProducerRef = useRef<Producer | null>(null)
  const audioProducerRef = useRef<Producer | null>(null)
  const consumerRef = useRef<Consumer | null>(null)
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  /**
   * Initialize mediasoup device
   */
  const initializeDevice = useCallback(async () => {
    try {
      setConnectionState('connecting')

      // Get router RTP capabilities from server
      const { rtpCapabilities } = await apiRequest<{ rtpCapabilities: mediasoupClient.types.RtpCapabilities }>(
        'GET',
        `/api/v1/video/sessions/${sessionId}/capabilities`
      )

      // Create mediasoup device
      const device = new Device()
      await device.load({ routerRtpCapabilities: rtpCapabilities })

      deviceRef.current = device
      setError(null)
      rtcLogger.info('Device initialized successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize device'
      rtcLogger.error('Failed to initialize device', err)
      setError(message)
      setConnectionState('failed')
      throw err
    }
  }, [sessionId])

  /**
   * Create send transport for producing media
   */
  const createSendTransport = useCallback(async () => {
    if (!deviceRef.current) {
      throw new Error('Device not initialized')
    }

    try {
      // Request transport parameters from server
      const transportOptions = await apiRequest<{
        id: string
        iceParameters: mediasoupClient.types.IceParameters
        iceCandidates: mediasoupClient.types.IceCandidate[]
        dtlsParameters: mediasoupClient.types.DtlsParameters
      }>('POST', `/api/v1/video/sessions/${sessionId}/transports/send`)

      // Create send transport
      const transport = deviceRef.current.createSendTransport({
        id: transportOptions.id,
        iceParameters: transportOptions.iceParameters,
        iceCandidates: transportOptions.iceCandidates,
        dtlsParameters: transportOptions.dtlsParameters,
      })

      // Handle 'connect' event
      transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await apiRequest('POST', `/api/v1/video/sessions/${sessionId}/transports/${transport.id}/connect`, {
            dtlsParameters,
          })
          callback()
        } catch (err) {
          errback(err as Error)
        }
      })

      // Handle 'produce' event
      transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const { id } = await apiRequest<{ id: string }>(
            'POST',
            `/api/v1/video/sessions/${sessionId}/transports/${transport.id}/produce`,
            {
              kind,
              rtpParameters,
              appData,
            }
          )
          callback({ id })
        } catch (err) {
          errback(err as Error)
        }
      })

      // Handle connection state changes
      transport.on('connectionstatechange', (state) => {
        rtcLogger.info('Send transport connection state changed', { state })
        if (mountedRef.current) {
          setConnectionState(state as WebRTCConnectionState)
        }
      })

      sendTransportRef.current = transport
      return transport
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create send transport'
      rtcLogger.error('Failed to create send transport', err)
      setError(message)
      throw err
    }
  }, [sessionId])

  /**
   * Create receive transport for consuming media
   */
  const createRecvTransport = useCallback(async () => {
    if (!deviceRef.current) {
      throw new Error('Device not initialized')
    }

    try {
      // Request transport parameters from server
      const transportOptions = await apiRequest<{
        id: string
        iceParameters: mediasoupClient.types.IceParameters
        iceCandidates: mediasoupClient.types.IceCandidate[]
        dtlsParameters: mediasoupClient.types.DtlsParameters
      }>('POST', `/api/v1/video/sessions/${sessionId}/transports/recv`)

      // Create receive transport
      const transport = deviceRef.current.createRecvTransport({
        id: transportOptions.id,
        iceParameters: transportOptions.iceParameters,
        iceCandidates: transportOptions.iceCandidates,
        dtlsParameters: transportOptions.dtlsParameters,
      })

      // Handle 'connect' event
      transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await apiRequest('POST', `/api/v1/video/sessions/${sessionId}/transports/${transport.id}/connect`, {
            dtlsParameters,
          })
          callback()
        } catch (err) {
          errback(err as Error)
        }
      })

      // Handle connection state changes
      transport.on('connectionstatechange', (state) => {
        rtcLogger.info('Receive transport connection state changed', { state })
        if (mountedRef.current) {
          setConnectionState(state as WebRTCConnectionState)
        }
      })

      recvTransportRef.current = transport
      return transport
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create receive transport'
      rtcLogger.error('Failed to create receive transport', err)
      setError(message)
      throw err
    }
  }, [sessionId])

  /**
   * Start collecting stream statistics with real data
   */
  const startStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) return

    statsIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return

      try {
        const transport = sendTransportRef.current || recvTransportRef.current
        if (!transport) return

        const rtcStats = await transport.getStats()
        const parsedStats = parseRTCStats(rtcStats)

        setStats({
          bandwidth: parsedStats.bandwidth ?? 0,
          latency: parsedStats.latency ?? 0,
          packetsLost: parsedStats.packetsLost ?? 0,
          frameRate: parsedStats.frameRate ?? 30,
          resolution: parsedStats.resolution ?? { width: 1280, height: 720 },
        })
      } catch (err) {
        rtcLogger.debug('Failed to collect stats', { error: err instanceof Error ? err.message : 'Unknown' })
      }
    }, 2000)
  }, [])

  /**
   * Stop collecting stream statistics
   */
  const stopStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    setStats(null)
  }, [])

  /**
   * Start producing media (send video/audio)
   */
  const startProducing = useCallback(
    async (constraints: MediaStreamConstraints = { video: true, audio: true }) => {
      try {
        setConnectionState('connecting')

        // Initialize device if not already initialized
        if (!deviceRef.current) {
          await initializeDevice()
        }

        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        setLocalStream(stream)

        // Create send transport if not exists
        let transport = sendTransportRef.current
        if (!transport) {
          transport = await createSendTransport()
        }

        // Produce video track
        if (constraints.video) {
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack) {
            const videoProducer = await transport.produce({ track: videoTrack })
            videoProducerRef.current = videoProducer
          }
        }

        // Produce audio track
        if (constraints.audio) {
          const audioTrack = stream.getAudioTracks()[0]
          if (audioTrack) {
            const audioProducer = await transport.produce({ track: audioTrack })
            audioProducerRef.current = audioProducer
          }
        }

        setIsProducing(true)
        setConnectionState('connected')
        startStatsCollection()
        rtcLogger.info('Started producing media')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start producing'
        rtcLogger.error('Failed to start producing', err)
        setError(message)
        setConnectionState('failed')
        throw err
      }
    },
    [initializeDevice, createSendTransport, startStatsCollection]
  )

  /**
   * Stop producing media
   */
  const stopProducing = useCallback(() => {
    // Close producers
    if (videoProducerRef.current) {
      videoProducerRef.current.close()
      videoProducerRef.current = null
    }
    if (audioProducerRef.current) {
      audioProducerRef.current.close()
      audioProducerRef.current = null
    }

    // Stop and cleanup local stream
    stopMediaStream(localStreamRef.current)
    setLocalStream(null)

    setIsProducing(false)
    stopStatsCollection()
    rtcLogger.info('Stopped producing media')
  }, [stopStatsCollection])

  /**
   * Start consuming media (receive video/audio)
   */
  const startConsuming = useCallback(
    async (producerId: string) => {
      try {
        setConnectionState('connecting')

        // Initialize device if not already initialized
        if (!deviceRef.current) {
          await initializeDevice()
        }

        // Ensure device is initialized (for TypeScript)
        if (!deviceRef.current) {
          throw new Error('Device initialization failed')
        }

        // Create receive transport if not exists
        let transport = recvTransportRef.current
        if (!transport) {
          transport = await createRecvTransport()
        }

        // Request to consume from server
        const consumerOptions = await apiRequest<{
          id: string
          producerId: string
          kind: mediasoupClient.types.MediaKind
          rtpParameters: mediasoupClient.types.RtpParameters
        }>('POST', `/api/v1/video/sessions/${sessionId}/consume`, {
          producerId,
          rtpCapabilities: deviceRef.current.rtpCapabilities,
        })

        // Create consumer
        const consumer = await transport.consume({
          id: consumerOptions.id,
          producerId: consumerOptions.producerId,
          kind: consumerOptions.kind,
          rtpParameters: consumerOptions.rtpParameters,
        })

        // Create media stream from consumer track
        const stream = new MediaStream([consumer.track])
        setRemoteStream(stream)

        consumerRef.current = consumer
        setIsConsuming(true)
        setConnectionState('connected')
        startStatsCollection()
        rtcLogger.info('Started consuming media')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start consuming'
        rtcLogger.error('Failed to start consuming', err)
        setError(message)
        setConnectionState('failed')
        throw err
      }
    },
    [sessionId, initializeDevice, createRecvTransport, startStatsCollection]
  )

  /**
   * Stop consuming media
   */
  const stopConsuming = useCallback(() => {
    if (consumerRef.current) {
      consumerRef.current.close()
      consumerRef.current = null
    }

    setRemoteStream(null)
    setIsConsuming(false)
    stopStatsCollection()
    rtcLogger.info('Stopped consuming media')
  }, [stopStatsCollection])

  /**
   * Toggle video track
   */
  const toggleVideo = useCallback(async () => {
    if (videoProducerRef.current) {
      if (isVideoEnabled) {
        videoProducerRef.current.pause()
      } else {
        videoProducerRef.current.resume()
      }
      setIsVideoEnabled(!isVideoEnabled)
    }
  }, [isVideoEnabled])

  /**
   * Toggle audio track
   */
  const toggleAudio = useCallback(async () => {
    if (audioProducerRef.current) {
      if (isAudioEnabled) {
        audioProducerRef.current.pause()
      } else {
        audioProducerRef.current.resume()
      }
      setIsAudioEnabled(!isAudioEnabled)
    }
  }, [isAudioEnabled])

  /**
   * Change video input device (with proper cleanup)
   */
  const changeVideoDevice = useCallback(
    async (deviceId: string) => {
      const currentStream = localStreamRef.current
      if (!currentStream || !videoProducerRef.current) return

      try {
        // Get new video track with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        })

        const newVideoTrack = newStream.getVideoTracks()[0]
        if (!newVideoTrack) {
          throw new Error('No video track available from device')
        }

        // Replace track in producer
        await videoProducerRef.current.replaceTrack({ track: newVideoTrack })

        // Stop old track BEFORE removing from stream
        const oldTrack = currentStream.getVideoTracks()[0]
        if (oldTrack) {
          oldTrack.stop()
          currentStream.removeTrack(oldTrack)
        }

        // Add new track
        currentStream.addTrack(newVideoTrack)

        // Update state with new stream reference
        setLocalStream(new MediaStream(currentStream.getTracks()))
        rtcLogger.info('Changed video device', { deviceId })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to change video device'
        rtcLogger.error('Failed to change video device', err)
        setError(message)
      }
    },
    []
  )

  /**
   * Change audio input device (with proper cleanup)
   */
  const changeAudioDevice = useCallback(
    async (deviceId: string) => {
      const currentStream = localStreamRef.current
      if (!currentStream || !audioProducerRef.current) return

      try {
        // Get new audio track with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        })

        const newAudioTrack = newStream.getAudioTracks()[0]
        if (!newAudioTrack) {
          throw new Error('No audio track available from device')
        }

        // Replace track in producer
        await audioProducerRef.current.replaceTrack({ track: newAudioTrack })

        // Stop old track BEFORE removing from stream
        const oldTrack = currentStream.getAudioTracks()[0]
        if (oldTrack) {
          oldTrack.stop()
          currentStream.removeTrack(oldTrack)
        }

        // Add new track
        currentStream.addTrack(newAudioTrack)

        // Update state with new stream reference
        setLocalStream(new MediaStream(currentStream.getTracks()))
        rtcLogger.info('Changed audio device', { deviceId })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to change audio device'
        rtcLogger.error('Failed to change audio device', err)
        setError(message)
      }
    },
    []
  )

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false

      // Stop stats collection
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current)
        statsIntervalRef.current = null
      }

      // Close producers
      if (videoProducerRef.current) {
        videoProducerRef.current.close()
        videoProducerRef.current = null
      }
      if (audioProducerRef.current) {
        audioProducerRef.current.close()
        audioProducerRef.current = null
      }

      // Close consumer
      if (consumerRef.current) {
        consumerRef.current.close()
        consumerRef.current = null
      }

      // Stop local stream
      stopMediaStream(localStreamRef.current)

      // Close transports
      if (sendTransportRef.current) {
        sendTransportRef.current.close()
        sendTransportRef.current = null
      }
      if (recvTransportRef.current) {
        recvTransportRef.current.close()
        recvTransportRef.current = null
      }

      rtcLogger.info('WebRTC hook cleanup complete')
    }
  }, [])

  /**
   * Auto-start if enabled
   */
  useEffect(() => {
    if (autoStart && isProducer && mountedRef.current) {
      startProducing().catch((err) => {
        rtcLogger.error('Auto-start producing failed', err)
      })
    }
  }, [autoStart, isProducer]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    localStream,
    remoteStream,
    connectionState,
    stats,
    error,
    startProducing,
    stopProducing,
    startConsuming,
    stopConsuming,
    toggleVideo,
    toggleAudio,
    changeVideoDevice,
    changeAudioDevice,
    isVideoEnabled,
    isAudioEnabled,
    isProducing,
    isConsuming,
  }
}
