/**
 * TypeScript declarations for window.blockd API
 *
 * This file provides type definitions for the renderer process
 * to access the Blockd API exposed by the preload script.
 */

import type {
  SessionValidateRequest,
  SessionValidateResponse,
  GazeDataBatch,
  CalibrationResult,
  MeetingInfo,
  VideoFrame,
  SecurityEvent,
} from '../shared/types';

/**
 * The Blockd API exposed to the renderer via window.blockd
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
    sessionStarted: (callback: (data: any) => void) => void;
    sessionEnded: (callback: (data: any) => void) => void;
    sessionError: (callback: (error: any) => void) => void;
    backendConnected: (callback: () => void) => void;
    backendDisconnected: (callback: () => void) => void;
    backendError: (callback: (error: any) => void) => void;
    securityAlert: (callback: (event: SecurityEvent) => void) => void;
    fullscreenChanged: (callback: (data: { fullscreen: boolean }) => void) => void;
    focusChanged: (callback: (data: { focused: boolean }) => void) => void;
    meetingLockdownActivated: (callback: (info: MeetingInfo) => void) => void;
    meetingLockdownDeactivated: (callback: () => void) => void;
  };

  // Remove all listeners for a channel
  // Note: Due to contextBridge limitations, we can't remove individual listeners
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

// Augment the global Window interface
declare global {
  interface Window {
    blockd: BlockdAPI;
  }
}

export {};
