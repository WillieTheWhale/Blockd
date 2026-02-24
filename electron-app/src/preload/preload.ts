/**
 * Preload Script
 *
 * Runs in the renderer process BEFORE the web page loads.
 * Has access to both Node.js APIs and DOM APIs.
 *
 * CRITICAL SECURITY:
 * - Uses contextBridge to expose ONLY safe APIs to renderer
 * - NO direct Node.js API exposure
 * - NO eval() or unsafe code execution
 * - All IPC calls are type-safe and validated
 *
 * The renderer process (web page) can access the exposed API via window.blockd
 */

import { contextBridge, ipcRenderer } from 'electron';
import { MainToRenderer, RendererToMain } from '../shared/ipc-channels.js';
import type {
  SessionValidateRequest,
  SessionValidateResponse,
  GazeDataBatch,
  CalibrationResult,
  MeetingInfo,
  VideoFrame,
  SecurityEvent,
  SessionSettings,
} from '../shared/types.js';

// ============================================================================
// Type Definitions for Exposed API
// ============================================================================

/**
 * Session started event data
 */
interface SessionStartedData {
  sessionId: string;
  startedAt: number;
  settings: SessionSettings;
}

/**
 * Session ended event data
 */
interface SessionEndedData {
  sessionId: string;
  endedAt: number;
  reason?: string;
}

/**
 * Session error event data
 */
interface SessionErrorData {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Backend error event data
 */
interface BackendErrorData {
  code: string;
  message: string;
  timestamp: number;
}

/**
 * The API exposed to the renderer process via window.blockd
 */
export interface BlockdAPI {
  // Session Management
  session: {
    start: (request: SessionValidateRequest) => Promise<SessionValidateResponse>;
    end: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ status: string; sessionId: string | null }>;
  };

  // Eye Tracking
  eyeTracking: {
    sendGazeBatch: (batch: GazeDataBatch) => Promise<{ success: boolean }>;
    sendCalibration: (result: CalibrationResult) => Promise<{ success: boolean }>;
  };

  // Video Capture
  video: {
    sendFrame: (frame: VideoFrame) => Promise<{ success: boolean }>;
  };

  // Meeting Detection
  meeting: {
    detected: (info: MeetingInfo) => Promise<{ success: boolean }>;
    ended: (info: MeetingInfo) => Promise<{ success: boolean }>;
  };

  // Window Control
  window: {
    requestFullscreen: () => Promise<{ success: boolean; error?: string }>;
    requestExitFullscreen: () => Promise<{ success: boolean; error?: string }>;
  };

  // System Info
  system: {
    getInfo: () => Promise<{
      platform: string;
      arch: string;
      electronVersion: string;
      chromeVersion: string;
      nodeVersion: string;
    }>;
    getAppVersion: () => Promise<{ version: string; name: string }>;
  };

  // Event Listeners
  on: {
    sessionStarted: (callback: (data: SessionStartedData) => void) => void;
    sessionEnded: (callback: (data: SessionEndedData) => void) => void;
    sessionError: (callback: (error: SessionErrorData) => void) => void;
    backendConnected: (callback: () => void) => void;
    backendDisconnected: (callback: () => void) => void;
    backendError: (callback: (error: BackendErrorData) => void) => void;
    securityAlert: (callback: (event: SecurityEvent) => void) => void;
    fullscreenChanged: (callback: (data: { fullscreen: boolean }) => void) => void;
    focusChanged: (callback: (data: { focused: boolean }) => void) => void;
    meetingLockdownActivated: (callback: (info: MeetingInfo) => void) => void;
    meetingLockdownDeactivated: (callback: () => void) => void;
  };

  // Remove all listeners for a channel
  removeAllListeners: {
    sessionStarted: () => void;
    sessionEnded: () => void;
    sessionError: () => void;
    backendConnected: () => void;
    backendDisconnected: () => void;
    backendError: () => void;
    securityAlert: () => void;
    fullscreenChanged: () => void;
    focusChanged: () => void;
    meetingLockdownActivated: () => void;
    meetingLockdownDeactivated: () => void;
  };
}

// ============================================================================
// API Implementation
// ============================================================================

const blockdAPI: BlockdAPI = {
  // Session Management
  session: {
    start: (request: SessionValidateRequest) =>
      ipcRenderer.invoke(RendererToMain.SESSION_START, request),

    end: () =>
      ipcRenderer.invoke(RendererToMain.SESSION_END),

    getStatus: () =>
      ipcRenderer.invoke(RendererToMain.SESSION_GET_STATUS),
  },

  // Eye Tracking
  eyeTracking: {
    sendGazeBatch: (batch: GazeDataBatch) =>
      ipcRenderer.invoke(RendererToMain.GAZE_DATA_BATCH, batch),

    sendCalibration: (result: CalibrationResult) =>
      ipcRenderer.invoke(RendererToMain.CALIBRATION_COMPLETE, result),
  },

  // Video Capture
  video: {
    sendFrame: (frame: VideoFrame) =>
      ipcRenderer.invoke(RendererToMain.VIDEO_FRAME, frame),
  },

  // Meeting Detection
  meeting: {
    detected: (info: MeetingInfo) =>
      ipcRenderer.invoke(RendererToMain.MEETING_DETECTED, info),

    ended: (info: MeetingInfo) =>
      ipcRenderer.invoke(RendererToMain.MEETING_ENDED, info),
  },

  // Window Control
  window: {
    requestFullscreen: () =>
      ipcRenderer.invoke(RendererToMain.REQUEST_FULLSCREEN),

    requestExitFullscreen: () =>
      ipcRenderer.invoke(RendererToMain.REQUEST_EXIT_FULLSCREEN),
  },

  // System Info
  system: {
    getInfo: () =>
      ipcRenderer.invoke(RendererToMain.GET_SYSTEM_INFO),

    getAppVersion: () =>
      ipcRenderer.invoke(RendererToMain.GET_APP_VERSION),
  },

  // Event Listeners (Main -> Renderer)
  on: {
    sessionStarted: (callback) =>
      ipcRenderer.on(MainToRenderer.SESSION_STARTED, (_event, data) => callback(data)),

    sessionEnded: (callback) =>
      ipcRenderer.on(MainToRenderer.SESSION_ENDED, (_event, data) => callback(data)),

    sessionError: (callback) =>
      ipcRenderer.on(MainToRenderer.SESSION_ERROR, (_event, error) => callback(error)),

    backendConnected: (callback) =>
      ipcRenderer.on(MainToRenderer.BACKEND_CONNECTED, () => callback()),

    backendDisconnected: (callback) =>
      ipcRenderer.on(MainToRenderer.BACKEND_DISCONNECTED, () => callback()),

    backendError: (callback) =>
      ipcRenderer.on(MainToRenderer.BACKEND_ERROR, (_event, error) => callback(error)),

    securityAlert: (callback) =>
      ipcRenderer.on(MainToRenderer.SECURITY_ALERT, (_event, event) => callback(event)),

    fullscreenChanged: (callback) =>
      ipcRenderer.on(MainToRenderer.FULLSCREEN_CHANGED, (_event, data) => callback(data)),

    focusChanged: (callback) =>
      ipcRenderer.on(MainToRenderer.FOCUS_CHANGED, (_event, data) => callback(data)),

    meetingLockdownActivated: (callback) =>
      ipcRenderer.on(MainToRenderer.MEETING_LOCKDOWN_ACTIVATED, (_event, info) => callback(info)),

    meetingLockdownDeactivated: (callback) =>
      ipcRenderer.on(MainToRenderer.MEETING_LOCKDOWN_DEACTIVATED, () => callback()),
  },

  // Remove All Listeners for a channel
  // Note: Due to contextBridge limitations, we can't remove individual listeners
  // as function references don't match across the bridge. Use removeAll instead.
  removeAllListeners: {
    sessionStarted: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.SESSION_STARTED),

    sessionEnded: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.SESSION_ENDED),

    sessionError: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.SESSION_ERROR),

    backendConnected: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.BACKEND_CONNECTED),

    backendDisconnected: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.BACKEND_DISCONNECTED),

    backendError: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.BACKEND_ERROR),

    securityAlert: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.SECURITY_ALERT),

    fullscreenChanged: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.FULLSCREEN_CHANGED),

    focusChanged: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.FOCUS_CHANGED),

    meetingLockdownActivated: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.MEETING_LOCKDOWN_ACTIVATED),

    meetingLockdownDeactivated: () =>
      ipcRenderer.removeAllListeners(MainToRenderer.MEETING_LOCKDOWN_DEACTIVATED),
  },
};

// ============================================================================
// Expose API to Renderer
// ============================================================================

/**
 * Expose the Blockd API to the renderer process via window.blockd
 *
 * SECURITY NOTE:
 * - contextBridge creates a SAFE bridge between isolated contexts
 * - Only the explicitly defined API is exposed
 * - No direct access to ipcRenderer or Node.js APIs
 * - All data passed through the bridge is serialized (no functions, no prototypes)
 */
contextBridge.exposeInMainWorld('blockd', blockdAPI);

// ============================================================================
// Type Declaration for Window
// ============================================================================

/**
 * Augment the Window interface for TypeScript
 * This should also be declared in a .d.ts file for the renderer
 */
declare global {
  interface Window {
    blockd: BlockdAPI;
  }
}

// ============================================================================
// Preload Initialization
// ============================================================================

console.log('Preload script loaded - Blockd API exposed to renderer');

// Log security settings for debugging
console.log('Security settings:', {
  contextIsolation: process.contextIsolated,
  sandbox: process.sandboxed,
  nodeIntegration: 'nodeIntegration is disabled (cannot check from preload)',
});

// Warn if running in insecure mode
if (!process.contextIsolated) {
  console.error('WARNING: contextIsolation is disabled - this is a security risk!');
}
