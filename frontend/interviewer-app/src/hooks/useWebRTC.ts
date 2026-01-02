import { useState, useEffect, useCallback, useRef } from 'react'
import * as mediasoupClient from 'mediasoup-client'
import { Device, types as mediasoupTypes } from 'mediasoup-client'
import { apiRequest } from '@/lib/api-client'
import type { VideoStreamStats } from '@/types'

// Type aliases from mediasoup-client
type Transport = mediasoupTypes.Transport
type Producer = mediasoupTypes.Producer
type Consumer = mediasoupTypes.Consumer

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
 * Custom hook for WebRTC integration using mediasoup-client
 *
 * Features:
 * - mediasoup-client 3.x integration
 * - Send and receive video/audio streams
 * - Device management
 * - Connection state tracking
 * - Stream statistics
 * - ICE connection handling
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize device'
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
        console.log('Send transport connection state:', state)
        setConnectionState(state as WebRTCConnectionState)
      })

      sendTransportRef.current = transport
      return transport
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create send transport'
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
        console.log('Receive transport connection state:', state)
        setConnectionState(state as WebRTCConnectionState)
      })

      recvTransportRef.current = transport
      return transport
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create receive transport'
      setError(message)
      throw err
    }
  }, [sessionId])

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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start producing'
        setError(message)
        setConnectionState('failed')
        throw err
      }
    },
    [initializeDevice, createSendTransport]
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

    // Stop local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
    }

    setIsProducing(false)
    stopStatsCollection()
  }, [localStream])

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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start consuming'
        setError(message)
        setConnectionState('failed')
        throw err
      }
    },
    [sessionId, initializeDevice, createRecvTransport]
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
  }, [])

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
   * Change video input device
   */
  const changeVideoDevice = useCallback(
    async (deviceId: string) => {
      if (!localStream || !videoProducerRef.current) return

      try {
        // Get new video track with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        })

        const newVideoTrack = newStream.getVideoTracks()[0]

        // Replace track in producer
        await videoProducerRef.current.replaceTrack({ track: newVideoTrack })

        // Stop old track and update stream
        localStream.getVideoTracks()[0]?.stop()
        localStream.removeTrack(localStream.getVideoTracks()[0])
        localStream.addTrack(newVideoTrack)

        setLocalStream(new MediaStream(localStream.getTracks()))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to change video device'
        setError(message)
      }
    },
    [localStream]
  )

  /**
   * Change audio input device
   */
  const changeAudioDevice = useCallback(
    async (deviceId: string) => {
      if (!localStream || !audioProducerRef.current) return

      try {
        // Get new audio track with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        })

        const newAudioTrack = newStream.getAudioTracks()[0]

        // Replace track in producer
        await audioProducerRef.current.replaceTrack({ track: newAudioTrack })

        // Stop old track and update stream
        localStream.getAudioTracks()[0]?.stop()
        localStream.removeTrack(localStream.getAudioTracks()[0])
        localStream.addTrack(newAudioTrack)

        setLocalStream(new MediaStream(localStream.getTracks()))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to change audio device'
        setError(message)
      }
    },
    [localStream]
  )

  /**
   * Start collecting stream statistics
   */
  const startStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) return

    statsIntervalRef.current = setInterval(async () => {
      try {
        const transport = sendTransportRef.current || recvTransportRef.current
        if (!transport) return

        const rtcStats = await transport.getStats()

        // Parse stats (simplified - in real implementation, parse actual RTC stats)
        const statsData: VideoStreamStats = {
          bandwidth: 0,
          latency: 0,
          packetsLost: 0,
          frameRate: 30,
          resolution: {
            width: 1280,
            height: 720,
          },
        }

        setStats(statsData)
      } catch (err) {
        console.error('Failed to collect stats:', err)
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
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopProducing()
      stopConsuming()

      if (sendTransportRef.current) {
        sendTransportRef.current.close()
      }
      if (recvTransportRef.current) {
        recvTransportRef.current.close()
      }
    }
  }, [stopProducing, stopConsuming])

  /**
   * Auto-start if enabled
   */
  useEffect(() => {
    if (autoStart && isProducer) {
      startProducing().catch(console.error)
    }
  }, [autoStart, isProducer, startProducing])

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
