/**
 * Blockd Interviewee App - Main Process
 * Electron main process entry point
 */

import { app, BrowserWindow, ipcMain, session, desktopCapturer, nativeImage } from 'electron';
import path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { SecurityMonitor } from './security-monitor';
import { SessionManager } from './session-manager';

/**
 * Get the path to the application icon
 * Works in both development and production
 */
function getIconPath(): string {
  // In production, resources are in the app root
  // In development, they're relative to the source
  const isDev = process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL;

  if (isDev) {
    return path.join(__dirname, '../../resources/icon.png');
  }

  // Production: resources are in the app's resources folder
  return path.join(process.resourcesPath, 'icon.png');
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Global references to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let securityMonitor: SecurityMonitor | null = null;
let sessionManager: SessionManager | null = null;

// Declare Vite-generated constants
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const createWindow = (): void => {
  // Create the browser window.
  // Get the application icon
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Blockd Interviewee',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Security settings
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Enable webview tag for meeting embeds
      webviewTag: true,
    },
  });

  // Configure session for security
  const ses = mainWindow.webContents.session;

  // Set Content Security Policy
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "connect-src 'self' http://localhost:* ws://localhost:* https://*.google.com https://*.zoom.us https://*.microsoft.com",
          "frame-src 'self' https://*.google.com https://*.zoom.us https://*.microsoft.com https://meet.google.com https://teams.microsoft.com",
        ].join('; '),
      },
    });
  });

  // Handle display media request (screen sharing)
  ses.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      // Return the first screen source for auto-capture
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({});
      }
    });
  });

  // Load the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  // Initialize services
  sessionManager = new SessionManager();
  securityMonitor = new SecurityMonitor(mainWindow, sessionManager);

  // Setup IPC handlers
  setupIpcHandlers(mainWindow, sessionManager, securityMonitor);

  // Handle window events
  mainWindow.on('focus', () => {
    securityMonitor?.onWindowFocus();
  });

  mainWindow.on('blur', () => {
    securityMonitor?.onWindowBlur();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    securityMonitor?.stop();
    sessionManager?.disconnect();
  });
};

// Security: Disable navigation to external URLs from main window
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    // Allow navigation only to localhost (dev) or app pages
    if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
      console.log('Blocked navigation to:', navigationUrl);
      event.preventDefault();
    }
  });

  // Handle new window creation (block popups)
  contents.setWindowOpenHandler(({ url }) => {
    // Allow opening meeting URLs in webview
    if (url.includes('meet.google.com') ||
        url.includes('zoom.us') ||
        url.includes('teams.microsoft.com')) {
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (process.env.NODE_ENV === 'development') {
    // In development, ignore certificate errors for localhost
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
