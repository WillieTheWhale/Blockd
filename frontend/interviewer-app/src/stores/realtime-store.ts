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

  // Event deduplication
  processedEventIds: Set<string>

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
  processedEventIds: new Set<string>(),
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

      // Security events (with deduplication)
      addSecurityEvent: (event) =>
        set((state) => {
          // Skip if already processed (deduplication)
          if (state.processedEventIds.has(event.id)) {
            return state
          }

          // Add to processed set (keep last 200 IDs to prevent memory growth)
          const newProcessedIds = new Set(state.processedEventIds)
          newProcessedIds.add(event.id)
          if (newProcessedIds.size > 200) {
            const idsArray = Array.from(newProcessedIds)
            idsArray.slice(0, newProcessedIds.size - 200).forEach((id) => newProcessedIds.delete(id))
          }

          return {
            securityEvents: [event, ...state.securityEvents].slice(0, 100),
            processedEventIds: newProcessedIds,
          }
        }),

      clearSecurityEvents: () =>
        set({
          securityEvents: [],
        }),

      removeSecurityEvent: (eventId) =>
        set((state) => ({
          securityEvents: state.securityEvents.filter((e) => e.id !== eventId),
        })),

      // Gaze data (with timestamp-based deduplication)
      addGazeData: (data) =>
        set((state) => {
          // Deduplicate: skip if we already have data with same sessionId and timestamp
          const isDuplicate = state.gazeData.some(
            (existing) =>
              existing.sessionId === data.sessionId &&
              existing.timestamp === data.timestamp
          )
          if (isDuplicate) {
            return state
          }

          return {
            gazeData: [data, ...state.gazeData].slice(0, 1000), // Keep last 1000 data points
          }
        }),

      clearGazeData: () =>
        set({
          gazeData: [],
        }),

      getGazeDataForSession: (sessionId) => {
        return get().gazeData.filter((data) => data.sessionId === sessionId)
      },

      // Chat messages (with deduplication)
      addChatMessage: (message) =>
        set((state) => {
          // Skip if already processed (deduplication)
          if (state.processedEventIds.has(message.id)) {
            return state
          }

          // Add to processed set
          const newProcessedIds = new Set(state.processedEventIds)
          newProcessedIds.add(message.id)
          if (newProcessedIds.size > 200) {
            const idsArray = Array.from(newProcessedIds)
            idsArray.slice(0, newProcessedIds.size - 200).forEach((id) => newProcessedIds.delete(id))
          }

          return {
            chatMessages: [...state.chatMessages, message].slice(-500), // Keep last 500 messages
            unreadMessagesCount:
              message.type === 'user' && message.senderId !== 'me'
                ? state.unreadMessagesCount + 1
                : state.unreadMessagesCount,
            processedEventIds: newProcessedIds,
          }
        }),

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
