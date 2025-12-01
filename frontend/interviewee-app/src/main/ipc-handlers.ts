/**
 * IPC Handlers
 * Handles communication between main and renderer processes
 */

import { ipcMain, BrowserWindow, desktopCapturer, shell } from 'electron';
import { SessionManager } from './session-manager';
import { SecurityMonitor } from './security-monitor';

export function setupIpcHandlers(
  mainWindow: BrowserWindow,
  sessionManager: SessionManager,
  securityMonitor: SecurityMonitor
): void {
  // ============================================================================
  // AUTH IPC HANDLERS
  // ============================================================================

  ipcMain.handle('auth:login', async (event, credentials: { email: string; password: string }) => {
    try {
      const result = await sessionManager.login(credentials.email, credentials.password);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:register', async (event, data: {
    email: string;
    password: string;
    fullName: string;
  }) => {
    try {
      const result = await sessionManager.register(data.email, data.password, data.fullName);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await sessionManager.logout();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:refresh', async () => {
    try {
      const result = await sessionManager.refreshAccessToken();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:get-user', async () => {
    try {
      const user = sessionManager.getCurrentUser();
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:is-authenticated', () => {
    return { success: true, data: sessionManager.isAuthenticated() };
  });

  // ============================================================================
  // SESSION IPC HANDLERS
  // ============================================================================

  ipcMain.handle('session:join', async (event, sessionToken: string) => {
    try {
      const result = await sessionManager.joinSession(sessionToken);
      // Start security monitoring when session joins
      securityMonitor.start();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('session:leave', async () => {
    try {
      await sessionManager.leaveSession();
      securityMonitor.stop();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('session:get-current', () => {
    return { success: true, data: sessionManager.getCurrentSession() };
  });

  // ============================================================================
  // MEDIA IPC HANDLERS
  // ============================================================================

  ipcMain.handle('media:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 150, height: 150 },
        fetchWindowIcons: true,
      });

      return {
        success: true,
        data: sources.map((source) => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL(),
          appIcon: source.appIcon?.toDataURL(),
        })),
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('media:start-capture', async (event, sourceId: string) => {
    try {
      await sessionManager.startMediaCapture(sourceId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('media:stop-capture', async () => {
    try {
      await sessionManager.stopMediaCapture();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ============================================================================
  // SECURITY IPC HANDLERS
  // ============================================================================

  ipcMain.handle('security:start-monitoring', () => {
    try {
      securityMonitor.start();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('security:stop-monitoring', () => {
    try {
      securityMonitor.stop();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('security:get-status', () => {
    return { success: true, data: securityMonitor.getStatus() };
  });

  ipcMain.handle('security:report-event', async (event, securityEvent: {
    type: string;
    severity: string;
    description: string;
    metadata?: Record<string, unknown>;
  }) => {
    try {
      await securityMonitor.reportEvent(securityEvent);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ============================================================================
  // WEBSOCKET IPC HANDLERS
  // ============================================================================

  ipcMain.handle('websocket:connect', async () => {
    try {
      await sessionManager.connectWebSocket();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('websocket:disconnect', async () => {
    try {
      sessionManager.disconnectWebSocket();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('websocket:send', async (event, eventName: string, data: unknown) => {
    try {
      sessionManager.sendWebSocketEvent(eventName, data);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Forward WebSocket events to renderer
  sessionManager.on('websocket:event', (eventName: string, data: unknown) => {
    mainWindow.webContents.send('websocket:event', eventName, data);
  });

  // ============================================================================
  // UTILITY IPC HANDLERS
  // ============================================================================

  ipcMain.handle('app:get-version', () => {
    return { success: true, data: require('../../package.json').version };
  });

  ipcMain.handle('app:open-external', async (event, url: string) => {
    // Only allow specific external URLs
    const allowedDomains = ['meet.google.com', 'zoom.us', 'teams.microsoft.com'];
    const parsedUrl = new URL(url);

    if (allowedDomains.some((domain) => parsedUrl.hostname.includes(domain))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'URL not allowed' };
  });

  // ============================================================================
  // GAZE TRACKING IPC HANDLERS
  // ============================================================================

  ipcMain.handle('gaze:send-data', async (event, gazeData: {
    gaze_x: number;
    gaze_y: number;
    is_off_screen: boolean;
    off_screen_direction?: string;
    confidence: number;
  }) => {
    try {
      await sessionManager.sendGazeData(gazeData);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
