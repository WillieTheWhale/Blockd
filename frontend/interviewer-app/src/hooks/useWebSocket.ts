import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { WS_URL } from '@/lib/constants'
import { useRealtimeStore } from '@/stores/realtime-store'
import { getAccessToken } from '@/lib/auth'
import { logger } from '@/lib/logger'
import type { SecurityEvent, GazeData, ChatMessage } from '@/types'

/**
 * WebSocket event types
 */
export type WebSocketEventType =
  | 'session:started'
  | 'session:ended'
  | 'participant:joined'
  | 'participant:left'
  | 'security:alert'
  | 'gaze:update'
  | 'question:asked'
  | 'answer:received'
  | 'chat:message'
  | 'chat:typing'
  | 'ai:detection:complete'

/**
 * WebSocket event handler type
 */
export type WebSocketEventHandler<T = unknown> = (data: T) => void

/**
 * WebSocket hook options
 */
interface UseWebSocketOptions {
  autoConnect?: boolean
  reconnectionAttempts?: number
  reconnectionDelay?: number
  sessionId?: string
}

/**
 * Queued message for offline sending
 */
interface QueuedMessage {
  event: string
  data: unknown
  timestamp: number
}

/**
 * WebSocket hook return type
 */
interface UseWebSocketReturn {
  socket: Socket | null
  isConnected: boolean
  emit: (event: string, data?: unknown) => void
  subscribe: <T = unknown>(event: WebSocketEventType, handler: WebSocketEventHandler<T>) => () => void
  connect: () => void
  disconnect: () => void
  queueLength: number
}

// Create logger for WebSocket
const wsLogger = logger.create({ component: 'useWebSocket' })

// Message queue TTL (5 minutes)
const MESSAGE_QUEUE_TTL = 5 * 60 * 1000

/**
 * Custom hook for WebSocket integration with Socket.io
 *
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Mutex flags to prevent race conditions
 * - Message queue for offline messages
 * - Event subscription management
 * - Type-safe event handlers
 * - Connection status tracking
 * - Integration with realtime store
 * - Proper cleanup to prevent memory leaks
 *
 * @param options - WebSocket configuration options
 * @returns WebSocket connection utilities
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    reconnectionAttempts = 5,
    reconnectionDelay = 1000,
    sessionId,
  } = options

  const socketRef = useRef<Socket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const messageQueueRef = useRef<QueuedMessage[]>([])
  const isConnectingRef = useRef(false)
  const isDisconnectingRef = useRef(false)
  const mountedRef = useRef(true)

  // Get stable references to store functions
  const setConnectionStatus = useRealtimeStore((state) => state.setConnectionStatus)
  const setConnectionError = useRealtimeStore((state) => state.setConnectionError)
  const setLastConnectedAt = useRealtimeStore((state) => state.setLastConnectedAt)
  const addSecurityEvent = useRealtimeStore((state) => state.addSecurityEvent)
  const addGazeData = useRealtimeStore((state) => state.addGazeData)
  const addChatMessage = useRealtimeStore((state) => state.addChatMessage)
  const soundEnabled = useRealtimeStore((state) => state.soundEnabled)
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus)

  /**
   * Play notification sound for critical events
   */
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return

    try {
      const audio = new Audio('/sounds/notification.mp3')
      audio.volume = 0.5
      audio.play().catch((error: Error) => {
        wsLogger.debug('Audio playback failed (expected if no user interaction)', { error: error.message })
      })
    } catch (error) {
      wsLogger.debug('Audio notification unavailable', { error: error instanceof Error ? error.message : 'Unknown' })
    }
  }, [soundEnabled])

  /**
   * Flush queued messages after reconnection
   */
  const flushMessageQueue = useCallback((socket: Socket) => {
    const now = Date.now()
    const validMessages = messageQueueRef.current.filter(
      (msg) => now - msg.timestamp < MESSAGE_QUEUE_TTL
    )

    wsLogger.info(`Flushing ${validMessages.length} queued messages`)

    for (const msg of validMessages) {
      socket.emit(msg.event, msg.data)
    }

    messageQueueRef.current = []
  }, [])

  /**
   * Handle reconnection with exponential backoff
   */
  const handleReconnection = useCallback(() => {
    if (!mountedRef.current) return
    if (isConnectingRef.current || isDisconnectingRef.current) return

    if (reconnectAttemptsRef.current >= reconnectionAttempts) {
      setConnectionStatus('error')
      setConnectionError(`Failed to reconnect after ${reconnectionAttempts} attempts`)
      return
    }

    setConnectionStatus('reconnecting')
    reconnectAttemptsRef.current += 1

    const delay = reconnectionDelay * Math.pow(2, reconnectAttemptsRef.current - 1)
    wsLogger.info(`Reconnecting in ${delay}ms`, {
      attempt: reconnectAttemptsRef.current,
      maxAttempts: reconnectionAttempts,
    })

    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && !isConnectingRef.current) {
        connectInternal()
      }
    }, delay)
  }, [reconnectionAttempts, reconnectionDelay, setConnectionStatus, setConnectionError])

  /**
   * Internal connect function
   */
  const connectInternal = useCallback(() => {
    // Mutex: prevent multiple simultaneous connections
    if (isConnectingRef.current) {
      wsLogger.debug('Connection already in progress, skipping')
      return
    }

    if (socketRef.current?.connected) {
      wsLogger.debug('Already connected, skipping')
      return
    }

    isConnectingRef.current = true
    setConnectionStatus('connecting')

    try {
      const token = getAccessToken()
      if (!token) {
        setConnectionError('No authentication token available')
        isConnectingRef.current = false
        return
      }

      // Clean up existing socket if any
      if (socketRef.current) {
        socketRef.current.removeAllListeners()
        socketRef.current.disconnect()
        socketRef.current = null
      }

      // Create socket connection
      const socket = io(WS_URL, {
        auth: { token },
        reconnection: false, // We handle reconnection manually
        transports: ['websocket', 'polling'],
        timeout: 10000,
      })

      // Connection established
      socket.on('connect', () => {
        if (!mountedRef.current) {
          socket.disconnect()
          return
        }

        wsLogger.info('WebSocket connected', { socketId: socket.id })
        setConnectionStatus('connected')
        setLastConnectedAt(Date.now())
        setConnectionError(null)
        reconnectAttemptsRef.current = 0
        isConnectingRef.current = false

        // Join session room if sessionId is provided
        if (sessionId) {
          socket.emit('join', { sessionId })
        }

        // Flush queued messages
        flushMessageQueue(socket)
      })

      // Connection error
      socket.on('connect_error', (error) => {
        wsLogger.error('WebSocket connection error', error)
        setConnectionError(error.message)
        isConnectingRef.current = false
        handleReconnection()
      })

      // Disconnected
      socket.on('disconnect', (reason) => {
        wsLogger.info('WebSocket disconnected', { reason })
        setConnectionStatus('disconnected')
        isConnectingRef.current = false

        // Auto-reconnect for certain disconnect reasons
        if (reason === 'io server disconnect' ||
            reason === 'transport close' ||
            reason === 'ping timeout') {
          handleReconnection()
        }
      })

      // Pong response (heartbeat)
      socket.on('pong', () => {
        setLastConnectedAt(Date.now())
      })

      socketRef.current = socket
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect'
      wsLogger.error('Failed to create socket connection', error)
      setConnectionError(message)
      isConnectingRef.current = false
      handleReconnection()
    }
  }, [sessionId, setConnectionStatus, setConnectionError, setLastConnectedAt, flushMessageQueue, handleReconnection])

  /**
   * Public connect function
   */
  const connect = useCallback(() => {
    if (isDisconnectingRef.current) {
      wsLogger.debug('Disconnect in progress, deferring connect')
      return
    }
    connectInternal()
  }, [connectInternal])

  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    isDisconnectingRef.current = true

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (socketRef.current) {
      if (sessionId) {
        socketRef.current.emit('leave', { sessionId })
      }
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setConnectionStatus('disconnected')
    reconnectAttemptsRef.current = 0
    isConnectingRef.current = false
    isDisconnectingRef.current = false
  }, [sessionId, setConnectionStatus])

  /**
   * Emit event to server (with offline queuing)
   */
  const emit = useCallback((event: string, data?: unknown) => {
    if (!socketRef.current?.connected) {
      // Queue message for later if we're reconnecting
      if (connectionStatus === 'reconnecting' || connectionStatus === 'connecting') {
        messageQueueRef.current.push({
          event,
          data,
          timestamp: Date.now(),
        })
        wsLogger.debug('Message queued for later', { event, queueLength: messageQueueRef.current.length })
        return
      }

      wsLogger.warn('Cannot emit event: WebSocket not connected', { event })
      return
    }

    socketRef.current.emit(event, data)
  }, [connectionStatus])

  /**
   * Subscribe to WebSocket event
   */
  const subscribe = useCallback(
    <T = unknown>(event: WebSocketEventType, handler: WebSocketEventHandler<T>) => {
      if (!socketRef.current) {
        wsLogger.warn('Cannot subscribe: WebSocket not initialized', { event })
        return () => {}
      }

      // Create wrapped handler to integrate with store
      const wrappedHandler = (data: T) => {
        // Call user handler
        handler(data)

        // Update store based on event type
        switch (event) {
          case 'security:alert':
            addSecurityEvent(data as SecurityEvent)
            if ((data as SecurityEvent).severity === 'critical') {
              playNotificationSound()
            }
            break
          case 'gaze:update':
            addGazeData(data as GazeData)
            break
          case 'chat:message':
            addChatMessage(data as ChatMessage)
            break
        }
      }

      socketRef.current.on(event, wrappedHandler)

      // Return unsubscribe function
      return () => {
        socketRef.current?.off(event, wrappedHandler)
      }
    },
    [addSecurityEvent, addGazeData, addChatMessage, playNotificationSound]
  )

  /**
   * Auto-connect on mount
   */
  useEffect(() => {
    mountedRef.current = true

    if (autoConnect) {
      connect()
    }

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Send heartbeat ping every 30 seconds
   */
  useEffect(() => {
    if (connectionStatus !== 'connected') return

    const interval = setInterval(() => {
      emit('ping')
    }, 30000)

    return () => {
      clearInterval(interval)
    }
  }, [connectionStatus, emit])

  return {
    socket: socketRef.current,
    isConnected: connectionStatus === 'connected',
    emit,
    subscribe,
    connect,
    disconnect,
    queueLength: messageQueueRef.current.length,
  }
}
