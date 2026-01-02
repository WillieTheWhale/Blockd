/**
 * Preload Script
 * Exposes secure APIs to renderer via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for exposed API
export interface ElectronAPI {
  auth: {
    login: (email: string, password: string) => Promise<IpcResult>;
    register: (email: string, password: string, fullName: string) => Promise<IpcResult>;
    logout: () => Promise<IpcResult>;
    refresh: () => Promise<IpcResult>;
    getUser: () => Promise<IpcResult>;
    isAuthenticated: () => Promise<IpcResult>;
  };
  session: {
    join: (sessionToken: string) => Promise<IpcResult>;
    leave: () => Promise<IpcResult>;
    getCurrent: () => Promise<IpcResult>;
  };
  media: {
    getSources: () => Promise<IpcResult>;
    startCapture: (sourceId: string) => Promise<IpcResult>;
    stopCapture: () => Promise<IpcResult>;
  };
  security: {
    startMonitoring: () => Promise<IpcResult>;
    stopMonitoring: () => Promise<IpcResult>;
    getStatus: () => Promise<IpcResult>;
    reportEvent: (event: SecurityEventInput) => Promise<IpcResult>;
    onEvent: (callback: (event: unknown) => void) => () => void;
  };
  websocket: {
    connect: () => Promise<IpcResult>;
    disconnect: () => Promise<IpcResult>;
    send: (eventName: string, data: unknown) => Promise<IpcResult>;
    onEvent: (callback: (eventName: string, data: unknown) => void) => () => void;
  };
  gaze: {
    sendData: (data: GazeDataInput) => Promise<IpcResult>;
  };
  app: {
    getVersion: () => Promise<IpcResult>;
    openExternal: (url: string) => Promise<IpcResult>;
  };
}

interface IpcResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface SecurityEventInput {
  type: string;
  severity: string;
  description: string;
  metadata?: Record<string, unknown>;
}

interface GazeDataInput {
  gaze_x: number;
  gaze_y: number;
  is_off_screen: boolean;
  off_screen_direction?: string;
  confidence: number;
}

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // ============================================================================
  // AUTH API
  // ============================================================================
  auth: {
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', { email, password }),

    register: (email: string, password: string, fullName: string) =>
      ipcRenderer.invoke('auth:register', { email, password, fullName }),

    logout: () => ipcRenderer.invoke('auth:logout'),

    refresh: () => ipcRenderer.invoke('auth:refresh'),

    getUser: () => ipcRenderer.invoke('auth:get-user'),

    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
  },

  // ============================================================================
  // SESSION API
  // ============================================================================
  session: {
    join: (sessionToken: string) => ipcRenderer.invoke('session:join', sessionToken),

    leave: () => ipcRenderer.invoke('session:leave'),

    getCurrent: () => ipcRenderer.invoke('session:get-current'),
  },

  // ============================================================================
  // MEDIA API
  // ============================================================================
  media: {
    getSources: () => ipcRenderer.invoke('media:get-sources'),

    startCapture: (sourceId: string) => ipcRenderer.invoke('media:start-capture', sourceId),

    stopCapture: () => ipcRenderer.invoke('media:stop-capture'),
  },

  // ============================================================================
  // SECURITY API
  // ============================================================================
  security: {
    startMonitoring: () => ipcRenderer.invoke('security:start-monitoring'),

    stopMonitoring: () => ipcRenderer.invoke('security:stop-monitoring'),

    getStatus: () => ipcRenderer.invoke('security:get-status'),

    reportEvent: (event: SecurityEventInput) =>
      ipcRenderer.invoke('security:report-event', event),

    onEvent: (callback: (event: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        callback(data);
      };
      ipcRenderer.on('security:event', handler);

      // Return cleanup function
      return () => {
        ipcRenderer.removeListener('security:event', handler);
      };
    },
  },

  // ============================================================================
  // WEBSOCKET API
  // ============================================================================
  websocket: {
    connect: () => ipcRenderer.invoke('websocket:connect'),

    disconnect: () => ipcRenderer.invoke('websocket:disconnect'),

    send: (eventName: string, data: unknown) =>
      ipcRenderer.invoke('websocket:send', eventName, data),

    onEvent: (callback: (eventName: string, data: unknown) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        eventName: string,
        data: unknown
      ) => {
        callback(eventName, data);
      };
      ipcRenderer.on('websocket:event', handler);

      // Return cleanup function
      return () => {
        ipcRenderer.removeListener('websocket:event', handler);
      };
    },
  },

  // ============================================================================
  // GAZE API
  // ============================================================================
  gaze: {
    sendData: (data: GazeDataInput) => ipcRenderer.invoke('gaze:send-data', data),
  },

  // ============================================================================
  // APP API
  // ============================================================================
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),

    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  },
} as ElectronAPI);

// Declare global type for renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
