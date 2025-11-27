import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SecurityEvent, GazeData, ChatMessage } from '@/types'

/**
 * WebSocket connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface RealtimeState {
  // Connection state
  connectionStatus: ConnectionStatus
  connectionError: string | null
  lastConnectedAt: number | null

  // Real-time data
  securityEvents: SecurityEvent[]
  gazeData: GazeData[]
  chatMessages: ChatMessage[]

  // UI state
  unreadMessagesCount: number
  soundEnabled: boolean
}

interface RealtimeActions {
  // Connection actions
  setConnectionStatus: (status: ConnectionStatus) => void
  setConnectionError: (error: string | null) => void
  setLastConnectedAt: (timestamp: number) => void

  // Security events
  addSecurityEvent: (event: SecurityEvent) => void
  clearSecurityEvents: () => void
  removeSecurityEvent: (eventId: string) => void

  // Gaze data
  addGazeData: (data: GazeData) => void
  clearGazeData: () => void
  getGazeDataForSession: (sessionId: string) => GazeData[]

  // Chat messages
  addChatMessage: (message: ChatMessage) => void
  markMessageAsRead: (messageId: string) => void
  clearChatMessages: () => void
  getMessagesForSession: (sessionId: string) => ChatMessage[]

  // UI actions
  incrementUnreadMessages: () => void
  resetUnreadMessages: () => void
  toggleSound: () => void

  // Reset all
  resetStore: () => void
}

type RealtimeStore = RealtimeState & RealtimeActions

const initialState: RealtimeState = {
  connectionStatus: 'disconnected',
  connectionError: null,
  lastConnectedAt: null,
  securityEvents: [],
  gazeData: [],
  chatMessages: [],
  unreadMessagesCount: 0,
  soundEnabled: true,
}

export const useRealtimeStore = create<RealtimeStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Connection actions
      setConnectionStatus: (status) =>
        set({
          connectionStatus: status,
          connectionError: status === 'connected' ? null : get().connectionError,
        }),

      setConnectionError: (error) =>
        set({
          connectionError: error,
          connectionStatus: error ? 'error' : get().connectionStatus,
        }),

      setLastConnectedAt: (timestamp) =>
        set({
          lastConnectedAt: timestamp,
        }),

      // Security events
      addSecurityEvent: (event) =>
        set((state) => ({
          securityEvents: [event, ...state.securityEvents].slice(0, 100), // Keep last 100 events
        })),

      clearSecurityEvents: () =>
        set({
          securityEvents: [],
        }),

      removeSecurityEvent: (eventId) =>
        set((state) => ({
          securityEvents: state.securityEvents.filter((e) => e.id !== eventId),
        })),

      // Gaze data
      addGazeData: (data) =>
        set((state) => ({
          gazeData: [data, ...state.gazeData].slice(0, 1000), // Keep last 1000 data points
        })),

      clearGazeData: () =>
        set({
          gazeData: [],
        }),

      getGazeDataForSession: (sessionId) => {
        return get().gazeData.filter((data) => data.sessionId === sessionId)
      },

      // Chat messages
      addChatMessage: (message) =>
        set((state) => ({
          chatMessages: [...state.chatMessages, message],
          unreadMessagesCount:
            message.type === 'user' && message.senderId !== 'me'
              ? state.unreadMessagesCount + 1
              : state.unreadMessagesCount,
        })),

      markMessageAsRead: (messageId) =>
        set((state) => ({
          chatMessages: state.chatMessages.map((msg) =>
            msg.id === messageId ? { ...msg, read: true } : msg
          ),
        })),

      clearChatMessages: () =>
        set({
          chatMessages: [],
          unreadMessagesCount: 0,
        }),

      getMessagesForSession: (sessionId) => {
        return get().chatMessages.filter((msg) => msg.sessionId === sessionId)
      },

      // UI actions
      incrementUnreadMessages: () =>
        set((state) => ({
          unreadMessagesCount: state.unreadMessagesCount + 1,
        })),

      resetUnreadMessages: () =>
        set({
          unreadMessagesCount: 0,
        }),

      toggleSound: () =>
        set((state) => ({
          soundEnabled: !state.soundEnabled,
        })),

      // Reset all
      resetStore: () => set(initialState),
    }),
    {
      name: 'realtime-store',
    }
  )
)
