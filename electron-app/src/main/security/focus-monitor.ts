/**
 * Focus Monitor
 *
 * Tracks window focus changes for the application.
 * Emits events when the window loses or gains focus.
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';

export interface FocusChangeEvent {
  focused: boolean;
  timestamp: number;
  duration?: number; // Duration of last focus state in ms
}

export class FocusMonitor extends EventEmitter {
  private window: BrowserWindow | null = null;
  private lastFocusChange: number = Date.now();
  private currentlyFocused: boolean = true;

  // Store bound function references for proper event listener removal
  private boundHandleFocus = this.handleFocus.bind(this);
  private boundHandleBlur = this.handleBlur.bind(this);
  private boundHandleShow = this.handleShow.bind(this);
  private boundHandleHide = this.handleHide.bind(this);
  private boundHandleMinimize = this.handleMinimize.bind(this);
  private boundHandleRestore = this.handleRestore.bind(this);

  /**
   * Start monitoring focus for a specific window
   */
  start(window: BrowserWindow): void {
    if (this.window) {
      this.stop();
    }

    this.window = window;
    this.currentlyFocused = window.isFocused();
    this.lastFocusChange = Date.now();

    // Register focus event listeners using stored bound references
    this.window.on('focus', this.boundHandleFocus);
    this.window.on('blur', this.boundHandleBlur);

    // Also listen for window show/hide events
    this.window.on('show', this.boundHandleShow);
    this.window.on('hide', this.boundHandleHide);

    // Listen for minimize/restore
    this.window.on('minimize', this.boundHandleMinimize);
    this.window.on('restore', this.boundHandleRestore);
  }

  /**
   * Stop monitoring focus
   */
  stop(): void {
    if (!this.window) {
      return;
    }

    // Remove all listeners using stored bound references
    this.window.removeListener('focus', this.boundHandleFocus);
    this.window.removeListener('blur', this.boundHandleBlur);
    this.window.removeListener('show', this.boundHandleShow);
    this.window.removeListener('hide', this.boundHandleHide);
    this.window.removeListener('minimize', this.boundHandleMinimize);
    this.window.removeListener('restore', this.boundHandleRestore);

    this.window = null;
  }

  /**
   * Get current focus state
   */
  isFocused(): boolean {
    if (!this.window) {
      return false;
    }
    return this.window.isFocused();
  }

  /**
   * Get duration of current focus state
   */
  getCurrentStateDuration(): number {
    return Date.now() - this.lastFocusChange;
  }

  /**
   * Handle window focus event
   */
  private handleFocus(): void {
    const now = Date.now();
    const duration = now - this.lastFocusChange;

    this.currentlyFocused = true;
    this.lastFocusChange = now;

    const event: FocusChangeEvent = {
      focused: true,
      timestamp: now,
      duration,
    };

    this.emit('focus-gained', event);
    this.emit('focus-change', event);
  }

  /**
   * Handle window blur event
   */
  private handleBlur(): void {
    const now = Date.now();
    const duration = now - this.lastFocusChange;

    this.currentlyFocused = false;
    this.lastFocusChange = now;

    const event: FocusChangeEvent = {
      focused: false,
      timestamp: now,
      duration,
    };

    this.emit('focus-lost', event);
    this.emit('focus-change', event);
  }

  /**
   * Handle window show event
   */
  private handleShow(): void {
    this.emit('window-shown', { timestamp: Date.now() });
  }

  /**
   * Handle window hide event
   */
  private handleHide(): void {
    this.emit('window-hidden', { timestamp: Date.now() });
  }

  /**
   * Handle window minimize event
   */
  private handleMinimize(): void {
    const now = Date.now();
    const duration = now - this.lastFocusChange;

    this.currentlyFocused = false;
    this.lastFocusChange = now;

    this.emit('window-minimized', {
      timestamp: now,
      duration,
    });

    // Also emit focus-lost event
    this.emit('focus-lost', {
      focused: false,
      timestamp: now,
      duration,
    });
  }

  /**
   * Handle window restore event
   */
  private handleRestore(): void {
    this.emit('window-restored', { timestamp: Date.now() });

    // Check if window has focus after restore
    if (this.window?.isFocused()) {
      this.handleFocus();
    }
  }

  /**
   * Get statistics about focus changes
   */
  getStatistics(): {
    currentlyFocused: boolean;
    lastFocusChange: number;
    currentStateDuration: number;
  } {
    return {
      currentlyFocused: this.currentlyFocused,
      lastFocusChange: this.lastFocusChange,
      currentStateDuration: this.getCurrentStateDuration(),
    };
  }
}
