/**
 * Main Process Entry Point
 *
 * Responsibilities:
 * - Single instance lock
 * - App lifecycle management
 * - Main window creation
 * - Service initialization
 * - IPC handler registration
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { WindowManager } from './window-manager.js';
import { RendererToMain, MainToRenderer } from '../shared/ipc-channels.js';
import { BackendConnector } from './backend/backend-connector.js';
import { SessionManager, getSessionManager, destroySessionManager } from './session/session-manager.js';
import { SettingsStore, getSettingsStore, destroySettingsStore } from './session/settings-store.js';
import { SecurityMonitor } from './security/security-monitor.js';
import { TelemetryCollector, getTelemetryCollector, destroyTelemetryCollector } from './telemetry/telemetry-collector.js';
import { BACKEND_URL, BACKEND_URL_DEV } from '../shared/constants.js';
import type {
  SessionValidateRequest,
  SessionValidateResponse,
  GazeDataBatch,
  CalibrationResult,
  MeetingInfo,
  VideoFrame,
  SecurityEvent,
} from '../shared/types.js';

// Global reference to services to prevent GC
let windowManager: WindowManager | null = null;
let backendConnector: BackendConnector | null = null;
let sessionManager: SessionManager | null = null;
let settingsStore: SettingsStore | null = null;
let securityMonitor: SecurityMonitor | null = null;
let telemetryCollector: TelemetryCollector | null = null;

/**
 * Single instance lock - only allow one instance of the app
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (windowManager) {
      const window = windowManager.getWindow();
      if (window) {
        if (window.isMinimized()) {
          window.restore();
        }
        window.focus();
      }
    }
  });
}

/**
 * Initialize the application
 */
async function initialize() {
  console.log('Initializing Blockd Electron App...');

  // Initialize settings store with encryption key
  const encryptionKey = process.env.BLOCKD_ENCRYPTION_KEY;
  if (!encryptionKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BLOCKD_ENCRYPTION_KEY environment variable must be set in production');
    }
    console.warn('[Main] WARNING: BLOCKD_ENCRYPTION_KEY not set. Using insecure default for development only.');
  }
  settingsStore = getSettingsStore(encryptionKey || 'dev-only-insecure-key');

  // Initialize backend connector
  const backendUrl = process.env.NODE_ENV === 'development' ? BACKEND_URL_DEV : BACKEND_URL;
  backendConnector = new BackendConnector({ url: backendUrl });

  // Set up backend event handlers
  setupBackendHandlers();

  // Initialize session manager
  sessionManager = getSessionManager(backendConnector, settingsStore);
  setupSessionHandlers();

  // Initialize security monitor
  securityMonitor = new SecurityMonitor({
    enableProcessMonitoring: true,
    enableVMDetection: true,
    enableScreenRecorderDetection: true,
    enableFocusMonitoring: true,
    enableClipboardMonitoring: true,
  });
  setupSecurityHandlers();

  // Initialize telemetry collector
  telemetryCollector = getTelemetryCollector();

  // Create the main window
  windowManager = new WindowManager();
  await windowManager.createWindow();

  // Register IPC handlers
  registerIpcHandlers();

  console.log('Blockd app initialized successfully');
}

/**
 * Set up backend connection event handlers
 */
function setupBackendHandlers() {
  if (!backendConnector) return;

  backendConnector.on('connected', () => {
    console.log('[Main] Backend connected');
    notifyRenderer(MainToRenderer.BACKEND_CONNECTED, undefined);
  });

  backendConnector.on('disconnected', (reason) => {
    console.log('[Main] Backend disconnected:', reason);
    notifyRenderer(MainToRenderer.BACKEND_DISCONNECTED, undefined);
  });

  backendConnector.on('error', (error) => {
    console.error('[Main] Backend error:', error);
    notifyRenderer(MainToRenderer.BACKEND_ERROR, { message: error.message });
  });

  backendConnector.on('message', (message) => {
    console.log('[Main] Backend message:', message.type);
    // Handle backend messages that need to be forwarded to renderer
  });

  backendConnector.on('reconnecting', (attempt, max) => {
    console.log(`[Main] Reconnecting to backend (${attempt}/${max})`);
  });
}

/**
 * Set up session manager event handlers
 */
function setupSessionHandlers() {
  if (!sessionManager) return;

  sessionManager.on('session-started', (session) => {
    console.log('[Main] Session started:', session.id);
    notifyRenderer(MainToRenderer.SESSION_STARTED, {
      sessionId: session.id,
      settings: session.settings,
    });

    // Start security monitoring
    const window = windowManager?.getWindow();
    if (securityMonitor && window) {
      securityMonitor.start(window);
    }

    // Start telemetry collection
    if (telemetryCollector && backendConnector && window) {
      telemetryCollector.start(session.id, backendConnector, window);
    }

    // Enable lockdown mode
    windowManager?.enableLockdown();
  });

  sessionManager.on('session-ended', (sessionId, reason) => {
    console.log('[Main] Session ended:', sessionId, reason);
    notifyRenderer(MainToRenderer.SESSION_ENDED, { sessionId, reason });

    // Stop security monitoring
    securityMonitor?.stop();

    // Stop telemetry collection
    telemetryCollector?.stop();

    // Disable lockdown mode
    windowManager?.disableLockdown();
  });

  sessionManager.on('session-error', (error) => {
    console.error('[Main] Session error:', error);
    notifyRenderer(MainToRenderer.SESSION_ERROR, { message: error.message });
  });
}

/**
 * Set up security monitor event handlers
 */
function setupSecurityHandlers() {
  if (!securityMonitor) return;

  securityMonitor.onSecurityEvent((event: SecurityEvent) => {
    console.log('[Main] Security event:', event.type, event.severity);
    notifyRenderer(MainToRenderer.SECURITY_ALERT, event);

    // Send to backend if connected
    if (backendConnector?.isConnected() && sessionManager?.getCurrentSessionId()) {
      backendConnector.send({
        type: 'security_event',
        sessionId: sessionManager.getCurrentSessionId()!,
        timestamp: event.timestamp,
        payload: event,
      });
    }
  });
}

/**
 * Helper to send messages to renderer
 */
function notifyRenderer(channel: string, data: unknown) {
  const window = windowManager?.getWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

/**
 * Register all IPC handlers for renderer communication
 */
function registerIpcHandlers() {
  console.log('Registering IPC handlers...');

  // Session Management
  ipcMain.handle(RendererToMain.SESSION_START, async (_event, request: SessionValidateRequest) => {
    // Log session start without exposing the token (security: avoid logging sensitive data)
    console.log('Session start requested');

    if (!sessionManager || !backendConnector) {
      return {
        valid: false,
        errorMessage: 'Services not initialized',
      } as SessionValidateResponse;
    }

    // Capture in local variable for TypeScript closure flow analysis
    const connector = backendConnector;

    try {
      // Connect to backend if not connected
      if (!connector.isConnected()) {
        // Wait for 'connected' event before starting session to avoid race condition
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            connector.removeListener('connected', onConnected);
            connector.removeListener('error', onError);
            reject(new Error('Backend connection timeout'));
          }, 10000);

          const onConnected = () => {
            clearTimeout(timeout);
            connector.removeListener('error', onError);
            resolve();
          };

          const onError = (error: Error) => {
            clearTimeout(timeout);
            connector.removeListener('connected', onConnected);
            reject(error);
          };

          connector.once('connected', onConnected);
          connector.once('error', onError);
          connector.connect();
        });
      }

      // Start session
      const session = await sessionManager.startSession(request.sessionToken);
      return {
        valid: true,
        sessionId: session.id,
        settings: session.settings,
      } as SessionValidateResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session start failed';
      return {
        valid: false,
        errorMessage: message,
      } as SessionValidateResponse;
    }
  });

  ipcMain.handle(RendererToMain.SESSION_END, async () => {
    console.log('Session end requested');

    if (sessionManager?.isSessionActive()) {
      sessionManager.endSession('User requested');
    }

    return { success: true };
  });

  ipcMain.handle(RendererToMain.SESSION_GET_STATUS, async () => {
    console.log('Session status requested');

    return {
      status: sessionManager?.getSessionStatus() || 'idle',
      sessionId: sessionManager?.getCurrentSessionId() || null,
    };
  });

  // Eye Tracking
  ipcMain.handle(RendererToMain.GAZE_DATA_BATCH, async (_event, batch: GazeDataBatch) => {
    // Forward gaze data to backend
    if (backendConnector?.isConnected()) {
      backendConnector.send({
        type: 'gaze_data',
        sessionId: batch.sessionId,
        timestamp: Date.now(),
        payload: batch,
      });
    }
    return { success: true };
  });

  ipcMain.handle(RendererToMain.CALIBRATION_COMPLETE, async (_event, result: CalibrationResult) => {
    console.log('Calibration completed:', result.success ? 'SUCCESS' : 'FAILED', `Accuracy: ${result.accuracy}`);

    // Store calibration data if needed
    // Send to backend if connected
    if (backendConnector?.isConnected() && sessionManager?.getCurrentSessionId()) {
      backendConnector.send({
        type: 'gaze_data',
        sessionId: sessionManager.getCurrentSessionId()!,
        timestamp: Date.now(),
        payload: { calibration: result },
      });
    }

    return { success: true };
  });

  // Video Capture
  ipcMain.handle(RendererToMain.VIDEO_FRAME, async (_event, frame: VideoFrame) => {
    // Forward video frame to backend
    if (backendConnector?.isConnected() && sessionManager?.getCurrentSessionId()) {
      backendConnector.send({
        type: 'video_frame',
        sessionId: sessionManager.getCurrentSessionId()!,
        timestamp: frame.timestamp,
        payload: frame,
      });
    }
    return { success: true };
  });

  // Meeting Detection
  ipcMain.handle(RendererToMain.MEETING_DETECTED, async (_event, info: MeetingInfo) => {
    console.log('Meeting detected:', info.platform, info.meetingUrl);

    // Activate lockdown mode
    if (windowManager) {
      windowManager.enableLockdown();
      const window = windowManager.getWindow();
      if (window) {
        window.webContents.send(MainToRenderer.MEETING_LOCKDOWN_ACTIVATED, info);
      }
    }

    return { success: true };
  });

  ipcMain.handle(RendererToMain.MEETING_ENDED, async (_event, info: MeetingInfo) => {
    console.log('Meeting ended:', info.platform);

    // Don't disable lockdown if session is still active
    if (!sessionManager?.isSessionActive()) {
      windowManager?.disableLockdown();
    }

    const window = windowManager?.getWindow();
    if (window) {
      window.webContents.send(MainToRenderer.MEETING_LOCKDOWN_DEACTIVATED);
    }

    return { success: true };
  });

  // Window Control
  ipcMain.handle(RendererToMain.REQUEST_FULLSCREEN, async () => {
    console.log('Fullscreen requested');

    if (windowManager) {
      windowManager.enterFullscreen();
      return { success: true };
    }

    return { success: false, error: 'Window manager not initialized' };
  });

  ipcMain.handle(RendererToMain.REQUEST_EXIT_FULLSCREEN, async () => {
    console.log('Exit fullscreen requested');

    // Only allow exit if no active session
    if (sessionManager?.isSessionActive()) {
      return { success: false, error: 'Cannot exit fullscreen during active session' };
    }

    if (windowManager) {
      windowManager.exitFullscreen();
      return { success: true };
    }

    return { success: false, error: 'Window manager not initialized' };
  });

  // Utility
  ipcMain.handle(RendererToMain.GET_SYSTEM_INFO, async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
    };
  });

  ipcMain.handle(RendererToMain.GET_APP_VERSION, async () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
    };
  });

  console.log('IPC handlers registered successfully');
}

/**
 * Cleanup on app quit
 */
function cleanup() {
  console.log('Cleaning up...');

  // Stop security monitoring
  if (securityMonitor) {
    securityMonitor.stop();
    securityMonitor = null;
  }

  // Stop telemetry collection
  destroyTelemetryCollector();
  telemetryCollector = null;

  // End session if active
  if (sessionManager?.isSessionActive()) {
    sessionManager.forceEndSession('Application closing');
  }
  destroySessionManager();
  sessionManager = null;

  // Disconnect backend
  if (backendConnector) {
    backendConnector.destroy();
    backendConnector = null;
  }

  // Destroy settings store
  destroySettingsStore();
  settingsStore = null;

  // Destroy window
  if (windowManager) {
    windowManager.destroy();
    windowManager = null;
  }
}

// ============================================================================
// App Lifecycle Events
// ============================================================================

/**
 * App is ready - create window and initialize
 */
app.on('ready', async () => {
  console.log('App ready');

  try {
    await initialize();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

/**
 * All windows closed - quit on Windows/Linux, keep running on macOS
 */
app.on('window-all-closed', () => {
  console.log('All windows closed');

  // On macOS, apps typically stay open even when all windows are closed
  // But for a kiosk/interview app, we should quit
  cleanup();
  app.quit();
});

/**
 * App is activated (macOS) - recreate window if needed
 */
app.on('activate', async () => {
  console.log('App activated');

  // On macOS, recreate window when dock icon is clicked and no windows exist
  if (BrowserWindow.getAllWindows().length === 0) {
    await initialize();
  }
});

/**
 * App is about to quit
 */
app.on('before-quit', () => {
  console.log('App quitting...');
  cleanup();
});

/**
 * Handle any unhandled errors
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);

  // Report to backend if connected
  if (backendConnector?.isConnected() && sessionManager?.getCurrentSessionId()) {
    backendConnector.send({
      type: 'error',
      sessionId: sessionManager.getCurrentSessionId()!,
      timestamp: Date.now(),
      payload: { message: error.message, stack: error.stack },
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection at:', promise, 'reason:', reason);

  // Report to backend if connected
  if (backendConnector?.isConnected() && sessionManager?.getCurrentSessionId()) {
    backendConnector.send({
      type: 'error',
      sessionId: sessionManager.getCurrentSessionId()!,
      timestamp: Date.now(),
      payload: { message: String(reason) },
    });
  }
});
