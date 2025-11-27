import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { WS_URL } from '@/lib/constants'
import { useRealtimeStore } from '@/stores/realtime-store'
import { getAccessToken } from '@/lib/auth'
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
 * WebSocket hook return type
 */
interface UseWebSocketReturn {
  socket: Socket | null
  isConnected: boolean
  emit: (event: string, data?: unknown) => void
  subscribe: <T = unknown>(event: WebSocketEventType, handler: WebSocketEventHandler<T>) => () => void
  connect: () => void
  disconnect: () => void
}

/**
 * Custom hook for WebSocket integration with Socket.io
 *
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Event subscription management
 * - Type-safe event handlers
 * - Connection status tracking
 * - Integration with realtime store
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

  const {
    setConnectionStatus,
    setConnectionError,
    setLastConnectedAt,
    addSecurityEvent,
    addGazeData,
    addChatMessage,
    soundEnabled,
    connectionStatus,
  } = useRealtimeStore()

  /**
   * Play notification sound for critical events
   */
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return

    try {
      const audio = new Audio('/sounds/notification.mp3')
      audio.volume = 0.5
      audio.play().catch(() => {
        // Ignore errors if sound cannot be played
      })
    } catch {
      // Ignore errors
    }
  }, [soundEnabled])

  /**
   * Handle WebSocket connection
   */
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return
    }

    try {
      setConnectionStatus('connecting')

      const token = getAccessToken()
      if (!token) {
        setConnectionError('No authentication token available')
        return
      }

      // Create socket connection
      const socket = io(WS_URL, {
        auth: {
          token,
        },
        reconnection: false, // We handle reconnection manually
        transports: ['websocket', 'polling'],
        timeout: 10000,
      })

      // Connection established
      socket.on('connect', () => {
        console.log('WebSocket connected:', socket.id)
        setConnectionStatus('connected')
        setLastConnectedAt(Date.now())
        setConnectionError(null)
        reconnectAttemptsRef.current = 0

        // Join session room if sessionId is provided
        if (sessionId) {
          socket.emit('join', { sessionId })
        }
      })

      // Connection error
      socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error)
        setConnectionError(error.message)
        handleReconnection()
      })

      // Disconnected
      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason)
        setConnectionStatus('disconnected')

        // Auto-reconnect for certain disconnect reasons
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          handleReconnection()
        } else if (reason === 'transport close' || reason === 'ping timeout') {
          // Network issues, try to reconnect
          handleReconnection()
        }
      })

      // Pong response (heartbeat)
      socket.on('pong', () => {
        // Update last activity timestamp
        setLastConnectedAt(Date.now())
      })

      socketRef.current = socket
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect'
      setConnectionError(message)
      handleReconnection()
    }
  }, [sessionId, setConnectionStatus, setConnectionError, setLastConnectedAt])

  /**
   * Handle reconnection with exponential backoff
   */
  const handleReconnection = useCallback(() => {
    if (reconnectAttemptsRef.current >= reconnectionAttempts) {
      setConnectionStatus('error')
      setConnectionError(`Failed to reconnect after ${reconnectionAttempts} attempts`)
      return
    }

    setConnectionStatus('reconnecting')
    reconnectAttemptsRef.current += 1

    const delay = reconnectionDelay * Math.pow(2, reconnectAttemptsRef.current - 1)
    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${reconnectionAttempts})`)

    reconnectTimeoutRef.current = setTimeout(() => {
      connect()
    }, delay)
  }, [reconnectionAttempts, reconnectionDelay, setConnectionStatus, setConnectionError, connect])

  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (socketRef.current) {
      if (sessionId) {
        socketRef.current.emit('leave', { sessionId })
      }
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setConnectionStatus('disconnected')
    reconnectAttemptsRef.current = 0
  }, [sessionId, setConnectionStatus])

  /**
   * Emit event to server
   */
  const emit = useCallback((event: string, data?: unknown) => {
    if (!socketRef.current?.connected) {
      console.warn('Cannot emit event: WebSocket not connected')
      return
    }

    socketRef.current.emit(event, data)
  }, [])

  /**
   * Subscribe to WebSocket event
   */
  const subscribe = useCallback(
    <T = unknown>(event: WebSocketEventType, handler: WebSocketEventHandler<T>) => {
      if (!socketRef.current) {
        console.warn('Cannot subscribe: WebSocket not initialized')
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
    if (autoConnect) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

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
  }
}
