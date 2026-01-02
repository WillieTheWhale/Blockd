/**
 * Session Store
 * Manages interview session state
 */

import { create } from 'zustand';

interface Session {
  id: string;
  token: string;
  status: string;
  interviewerId: string;
  scheduledAt: string;
}

interface SecurityEvent {
  type: string;
  severity: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

type MeetingPlatform = 'google-meet' | 'zoom' | 'teams' | null;

interface SessionState {
  session: Session | null;
  meetingPlatform: MeetingPlatform;
  meetingUrl: string;
  isConnected: boolean;
  isCapturing: boolean;
  securityEvents: SecurityEvent[];
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
}

interface SessionActions {
  setMeetingPlatform: (platform: MeetingPlatform) => void;
  setMeetingUrl: (url: string) => void;
  joinSession: (sessionToken: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  addSecurityEvent: (event: SecurityEvent) => void;
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  reset: () => void;
}

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>()((set, get) => ({
  // Initial state
  session: null,
  meetingPlatform: null,
  meetingUrl: '',
  isConnected: false,
  isCapturing: false,
  securityEvents: [],
  connectionStatus: 'disconnected',

  // Actions
  setMeetingPlatform: (platform) => {
    set({ meetingPlatform: platform });
  },

  setMeetingUrl: (url) => {
    set({ meetingUrl: url });
  },

  joinSession: async (sessionToken: string) => {
    set({ connectionStatus: 'connecting' });

    try {
      const result = await window.electronAPI.session.join(sessionToken);

      if (!result.success) {
        throw new Error(result.error || 'Failed to join session');
      }

      set({
        session: result.data as Session,
        isConnected: true,
        connectionStatus: 'connected',
      });

      // Connect WebSocket
      await window.electronAPI.websocket.connect();
    } catch (error) {
      set({ connectionStatus: 'disconnected' });
      throw error;
    }
  },

  leaveSession: async () => {
    try {
      await window.electronAPI.session.leave();
      await window.electronAPI.websocket.disconnect();
    } catch (error) {
      console.error('Leave session error:', error);
    } finally {
      set({
        session: null,
        isConnected: false,
        isCapturing: false,
        connectionStatus: 'disconnected',
        securityEvents: [],
      });
    }
  },

  addSecurityEvent: (event) => {
    set((state) => ({
      securityEvents: [event, ...state.securityEvents].slice(0, 100),
    }));
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status, isConnected: status === 'connected' });
  },

  startCapture: async () => {
    try {
      const sourcesResult = await window.electronAPI.media.getSources();

      if (sourcesResult.success && Array.isArray(sourcesResult.data)) {
        const sources = sourcesResult.data as Array<{ id: string; name: string }>;
        // Get first screen source
        const screenSource = sources.find((s) => s.name.includes('Screen') || s.name.includes('Entire'));

        if (screenSource) {
          await window.electronAPI.media.startCapture(screenSource.id);
          set({ isCapturing: true });
        }
      }
    } catch (error) {
      console.error('Start capture error:', error);
    }
  },

  stopCapture: async () => {
    try {
      await window.electronAPI.media.stopCapture();
      set({ isCapturing: false });
    } catch (error) {
      console.error('Stop capture error:', error);
    }
  },

  reset: () => {
    set({
      session: null,
      meetingPlatform: null,
      meetingUrl: '',
      isConnected: false,
      isCapturing: false,
      securityEvents: [],
      connectionStatus: 'disconnected',
    });
  },
}));
