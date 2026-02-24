/**
 * Window Manager
 *
 * Manages BrowserWindow lifecycle and security features:
 * - Kiosk mode / fullscreen enforcement
 * - Keyboard shortcut blocking
 * - Navigation control
 * - New window prevention
 * - DevTools prevention
 * - Content protection
 */

import { BrowserWindow, shell, Input } from 'electron';
import * as path from 'path';
import { BLOCKED_SHORTCUTS, ALLOWED_ORIGINS } from '../shared/constants.js';
import { MainToRenderer } from '../shared/ipc-channels.js';
import type { WindowConfig, BlockedKeyboardShortcut, SecurityEvent } from '../shared/types.js';

export class WindowManager {
  private window: BrowserWindow | null = null;
  private isSessionActive = false;
  private lockdownMode = false;

  /**
   * Create the main application window with security settings
   */
  async createWindow(): Promise<BrowserWindow> {
    console.log('Creating main window...');

    const windowConfig: WindowConfig = {
      width: 1280,
      height: 720,
      fullscreen: true,
      kiosk: false, // Start in non-kiosk mode, enable during session
      alwaysOnTop: false, // Enable during session
      frame: true, // Show frame initially, hide during session
    };

    this.window = new BrowserWindow({
      width: windowConfig.width,
      height: windowConfig.height,
      fullscreen: windowConfig.fullscreen,
      kiosk: windowConfig.kiosk,
      alwaysOnTop: windowConfig.alwaysOnTop,
      frame: windowConfig.frame,
      autoHideMenuBar: true,
      backgroundColor: '#1a1a1a',
      show: false, // Don't show until ready-to-show
      webPreferences: {
        // Security settings - CRITICAL
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        enableBlinkFeatures: '', // No experimental features
        disableBlinkFeatures: '', // Could disable features if needed

        // DevTools - Use build-time constant to prevent runtime bypass
        // BLOCKD_DEV_MODE is replaced at build time by esbuild/webpack
        devTools: __BLOCKD_DEV_MODE__ === true, // Only in dev mode (build-time constant)

        // Preload script
        preload: path.join(__dirname, '../preload/preload.js'),
      },
    });

    // Setup event handlers
    this.setupWindowHandlers();
    this.setupSecurityHandlers();
    this.setupKeyboardHandlers();

    // Load the app
    await this.loadApp();

    // Show window when ready
    this.window.once('ready-to-show', () => {
      console.log('Window ready to show');
      this.window?.show();
    });

    console.log('Main window created successfully');
    return this.window;
  }

  /**
   * Load the application (renderer process)
   */
  private async loadApp() {
    if (!this.window) return;

    // In development, load from Vite dev server
    // In production, load from built files
    if (process.env.NODE_ENV === 'development') {
      const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
      console.log(`Loading from dev server: ${devServerUrl}`);
      await this.window.loadURL(devServerUrl);
    } else {
      const indexPath = path.join(__dirname, '../renderer/index.html');
      console.log(`Loading from file: ${indexPath}`);
      await this.window.loadFile(indexPath);
    }
  }

  /**
   * Setup basic window event handlers
   */
  private setupWindowHandlers() {
    if (!this.window) return;

    // Window closed
    this.window.on('closed', () => {
      console.log('Window closed');
      this.window = null;
    });

    // Window focus changed
    this.window.on('focus', () => {
      this.window?.webContents.send(MainToRenderer.FOCUS_CHANGED, { focused: true });
    });

    this.window.on('blur', () => {
      this.window?.webContents.send(MainToRenderer.FOCUS_CHANGED, { focused: false });

      // If in session, report focus loss as security event
      if (this.isSessionActive) {
        this.reportSecurityEvent({
          type: 'window_focus_lost',
          severity: 'medium',
          timestamp: Date.now(),
          description: 'Window lost focus during active session',
          metadata: {},
        });
      }
    });

    // Fullscreen state changed
    this.window.on('enter-full-screen', () => {
      console.log('Entered fullscreen');
      this.window?.webContents.send(MainToRenderer.FULLSCREEN_CHANGED, { fullscreen: true });
    });

    this.window.on('leave-full-screen', () => {
      console.log('Left fullscreen');
      this.window?.webContents.send(MainToRenderer.FULLSCREEN_CHANGED, { fullscreen: false });

      // If in session, report exit attempt
      if (this.isSessionActive) {
        this.reportSecurityEvent({
          type: 'fullscreen_exit_attempt',
          severity: 'high',
          timestamp: Date.now(),
          description: 'User attempted to exit fullscreen during session',
          metadata: {},
        });

        // Force back to fullscreen
        this.enterFullscreen();
      }
    });

    // Window resize/maximize
    this.window.on('maximize', () => {
      console.log('Window maximized');
    });

    this.window.on('unmaximize', () => {
      console.log('Window unmaximized');
    });
  }

  /**
   * Setup security-related handlers
   */
  private setupSecurityHandlers() {
    if (!this.window) return;

    const webContents = this.window.webContents;

    // Block all new windows
    webContents.setWindowOpenHandler((details) => {
      console.log('Blocked window.open attempt:', details.url);

      this.reportSecurityEvent({
        type: 'navigation_blocked',
        severity: 'medium',
        timestamp: Date.now(),
        description: 'Attempted to open new window',
        metadata: { url: details.url, disposition: details.disposition },
      });

      return { action: 'deny' };
    });

    // Navigation control - combined handler for internal navigation and external links
    webContents.on('will-navigate', (event, url) => {
      // Check if navigation is allowed (whitelist check)
      if (!this.isNavigationAllowed(url)) {
        console.log('Blocked navigation:', url);
        event.preventDefault();

        // Only open external links in non-session mode and if URL is in allowlist
        if (!this.isSessionActive && url.startsWith('http') && this.isExternalUrlAllowed(url)) {
          shell.openExternal(url);
        } else {
          this.reportSecurityEvent({
            type: 'navigation_blocked',
            severity: 'medium',
            timestamp: Date.now(),
            description: 'Attempted to navigate to disallowed URL',
            metadata: { url },
          });
        }
      }
    });

    webContents.on('will-redirect', (event, url) => {
      if (!this.isNavigationAllowed(url)) {
        console.log('Blocked redirect:', url);
        event.preventDefault();

        this.reportSecurityEvent({
          type: 'navigation_blocked',
          severity: 'medium',
          timestamp: Date.now(),
          description: 'Attempted to redirect to disallowed URL',
          metadata: { url },
        });
      }
    });

    // Prevent DevTools opening (backup - already disabled in webPreferences)
    webContents.on('devtools-opened', () => {
      console.log('DevTools opened - closing immediately');
      webContents.closeDevTools();

      this.reportSecurityEvent({
        type: 'keyboard_shortcut_blocked',
        severity: 'high',
        timestamp: Date.now(),
        description: 'DevTools was opened',
        metadata: {},
      });
    });

    // Content protection (helps prevent screen recording on some platforms)
    if (process.platform === 'darwin' || process.platform === 'win32') {
      this.window.setContentProtection(true);
    }

    // Prevent context menu in production
    if (process.env.NODE_ENV !== 'development') {
      webContents.on('context-menu', (event) => {
        event.preventDefault();
      });
    }
  }

  /**
   * Setup keyboard shortcut blocking
   */
  private setupKeyboardHandlers() {
    if (!this.window) return;

    const webContents = this.window.webContents;

    // Intercept keyboard input BEFORE it reaches the renderer
    webContents.on('before-input-event', (event, input) => {
      if (this.shouldBlockShortcut(input)) {
        event.preventDefault();

        const shortcut = this.findBlockedShortcut(input);
        console.log(`Blocked keyboard shortcut: ${this.formatShortcut(input)} (${shortcut?.reason})`);

        this.reportSecurityEvent({
          type: 'keyboard_shortcut_blocked',
          severity: 'low',
          timestamp: Date.now(),
          description: `Blocked keyboard shortcut: ${this.formatShortcut(input)}`,
          metadata: {
            key: input.key,
            modifiers: {
              ctrl: input.control,
              alt: input.alt,
              shift: input.shift,
              meta: input.meta,
            },
            reason: shortcut?.reason || 'Unknown',
          },
        });
      }
    });
  }

  /**
   * Check if a keyboard shortcut should be blocked
   */
  private shouldBlockShortcut(input: Input): boolean {
    // Only block during session or lockdown
    if (!this.isSessionActive && !this.lockdownMode) {
      return false;
    }

    return this.findBlockedShortcut(input) !== null;
  }

  /**
   * Find matching blocked shortcut definition
   */
  private findBlockedShortcut(input: Input): BlockedKeyboardShortcut | null {
    // Only consider keyDown events
    if (input.type !== 'keyDown') {
      return null;
    }

    for (const shortcut of BLOCKED_SHORTCUTS) {
      // Match key (case-insensitive)
      if (shortcut.key.toLowerCase() !== input.key.toLowerCase()) {
        continue;
      }

      // Match modifiers
      const requiredModifiers = shortcut.modifiers || [];
      const hasCtrl = requiredModifiers.includes('ctrl') === input.control;
      const hasAlt = requiredModifiers.includes('alt') === input.alt;
      const hasShift = requiredModifiers.includes('shift') === input.shift;
      const hasMeta = requiredModifiers.includes('meta') === input.meta;

      // All modifiers must match (both required and not-required)
      const ctrlMatch = requiredModifiers.includes('ctrl') ? input.control : !input.control;
      const altMatch = requiredModifiers.includes('alt') ? input.alt : !input.alt;
      const shiftMatch = requiredModifiers.includes('shift') ? input.shift : !input.shift;
      const metaMatch = requiredModifiers.includes('meta') ? input.meta : !input.meta;

      if (ctrlMatch && altMatch && shiftMatch && metaMatch) {
        return shortcut;
      }
    }

    return null;
  }

  /**
   * Format shortcut for logging
   */
  private formatShortcut(input: Input): string {
    const parts: string[] = [];

    if (input.control) parts.push('Ctrl');
    if (input.alt) parts.push('Alt');
    if (input.shift) parts.push('Shift');
    if (input.meta) parts.push('Meta');

    parts.push(input.key);

    return parts.join('+');
  }

  /**
   * Check if external URL is allowed to be opened in default browser
   */
  private isExternalUrlAllowed(url: string): boolean {
    // Allowlist of domains that can be opened externally
    const EXTERNAL_URL_ALLOWLIST = [
      'zoom.us',
      'teams.microsoft.com',
      'meet.google.com',
      'webex.com',
      'blockd.app',
    ];

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Check if hostname matches or is a subdomain of allowed domains
      return EXTERNAL_URL_ALLOWLIST.some(allowed =>
        hostname === allowed || hostname.endsWith('.' + allowed)
      );
    } catch {
      return false;
    }
  }

  /**
   * Check if navigation to URL is allowed
   */
  private isNavigationAllowed(url: string): boolean {
    // In development, allow localhost
    if (process.env.NODE_ENV === 'development') {
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
        return true;
      }
    }

    // Check against whitelist
    try {
      const urlObj = new URL(url);
      const origin = urlObj.origin;

      // Exact match
      if (ALLOWED_ORIGINS.includes(origin)) {
        return true;
      }

      // Wildcard match (e.g., *.zoom.us)
      for (const allowedOrigin of ALLOWED_ORIGINS) {
        if (allowedOrigin.includes('*')) {
          const pattern = allowedOrigin
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);

          if (regex.test(origin)) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Invalid URL:', url, error);
      return false;
    }
  }

  /**
   * Report security event to backend (via IPC)
   */
  private reportSecurityEvent(event: SecurityEvent) {
    if (!this.window) return;

    // Send to renderer which will forward to backend
    this.window.webContents.send(MainToRenderer.SECURITY_ALERT, event);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the main window instance
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }

  /**
   * Enter fullscreen mode
   */
  enterFullscreen() {
    if (!this.window) return;

    if (!this.window.isFullScreen()) {
      this.window.setFullScreen(true);
    }
  }

  /**
   * Exit fullscreen mode (only allowed when not in session)
   */
  exitFullscreen() {
    if (!this.window) return;

    if (this.isSessionActive) {
      console.warn('Cannot exit fullscreen during active session');
      return;
    }

    if (this.window.isFullScreen()) {
      this.window.setFullScreen(false);
    }
  }

  /**
   * Enable kiosk/lockdown mode (during session)
   */
  enableLockdown() {
    if (!this.window) return;

    console.log('Enabling lockdown mode');

    this.lockdownMode = true;
    this.isSessionActive = true;

    // Enable kiosk mode (platform-dependent)
    this.window.setKiosk(true);

    // Always on top
    this.window.setAlwaysOnTop(true, 'screen-saver');

    // Hide frame
    // Note: Cannot dynamically change frame after window creation on most platforms
    // This is a limitation we must accept

    // Prevent closing
    this.window.setClosable(false);
    this.window.setMinimizable(false);

    // Force fullscreen
    this.enterFullscreen();

    console.log('Lockdown mode enabled');
  }

  /**
   * Disable lockdown mode (after session)
   */
  disableLockdown() {
    if (!this.window) return;

    console.log('Disabling lockdown mode');

    this.lockdownMode = false;
    this.isSessionActive = false;

    // Disable kiosk mode
    this.window.setKiosk(false);

    // Not always on top
    this.window.setAlwaysOnTop(false);

    // Allow closing
    this.window.setClosable(true);
    this.window.setMinimizable(true);

    console.log('Lockdown mode disabled');
  }

  /**
   * Check if window is in fullscreen
   */
  isFullscreen(): boolean {
    return this.window?.isFullScreen() ?? false;
  }

  /**
   * Check if window is in kiosk mode
   */
  isKiosk(): boolean {
    return this.window?.isKiosk() ?? false;
  }

  /**
   * Check if lockdown is active
   */
  isLocked(): boolean {
    return this.lockdownMode;
  }

  /**
   * Destroy the window
   */
  destroy() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
      this.window = null;
    }
  }
}
