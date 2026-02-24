/**
 * Clipboard Monitor
 *
 * Monitors clipboard activity to detect copy/paste operations.
 * Uses polling to detect clipboard changes.
 */

import { EventEmitter } from 'events';
import { clipboard } from 'electron';

export interface ClipboardChangeEvent {
  timestamp: number;
  hasText: boolean;
  hasImage: boolean;
  textLength?: number;
  changeType: 'text' | 'image' | 'both' | 'cleared';
}

export interface ClipboardMonitorConfig {
  pollIntervalMs: number; // How often to check for changes
  enableTextTracking: boolean;
  enableImageTracking: boolean;
  logContent: boolean; // Whether to log actual content (privacy concern)
}

export class ClipboardMonitor extends EventEmitter {
  private config: ClipboardMonitorConfig;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastClipboardText: string = '';
  private lastClipboardImage: string = ''; // Store hash or basic info
  private isRunning: boolean = false;

  constructor(config?: Partial<ClipboardMonitorConfig>) {
    super();
    this.config = {
      pollIntervalMs: 500,
      enableTextTracking: true,
      enableImageTracking: true,
      logContent: false,
      ...config,
    };
  }

  /**
   * Start monitoring clipboard
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Initialize with current clipboard state
    if (this.config.enableTextTracking) {
      this.lastClipboardText = clipboard.readText();
    }
    if (this.config.enableImageTracking) {
      this.lastClipboardImage = this.getImageHash();
    }

    // Start polling
    this.pollInterval = setInterval(() => {
      this.checkForChanges();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop monitoring clipboard
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Check for clipboard changes
   */
  private checkForChanges(): void {
    const hasText = clipboard.has('text/plain');
    const hasImage = clipboard.has('image/png') || clipboard.has('image/jpeg');

    let textChanged = false;
    let imageChanged = false;

    // Check text changes
    if (this.config.enableTextTracking && hasText) {
      const currentText = clipboard.readText();
      if (currentText !== this.lastClipboardText) {
        textChanged = true;
        this.lastClipboardText = currentText;
      }
    }

    // Check image changes
    if (this.config.enableImageTracking && hasImage) {
      const currentImageHash = this.getImageHash();
      if (currentImageHash !== this.lastClipboardImage) {
        imageChanged = true;
        this.lastClipboardImage = currentImageHash;
      }
    }

    // Emit event if anything changed
    if (textChanged || imageChanged) {
      const event: ClipboardChangeEvent = {
        timestamp: Date.now(),
        hasText,
        hasImage,
        textLength: hasText ? this.lastClipboardText.length : undefined,
        changeType: this.determineChangeType(textChanged, imageChanged),
      };

      this.emit('clipboard-change', event);

      // Emit specific events
      if (textChanged) {
        this.emit('clipboard-text-change', {
          ...event,
          text: this.config.logContent ? this.lastClipboardText : undefined,
        });
      }
      if (imageChanged) {
        this.emit('clipboard-image-change', event);
      }
    }

    // Check if clipboard was cleared
    if (!hasText && !hasImage && (this.lastClipboardText || this.lastClipboardImage)) {
      this.lastClipboardText = '';
      this.lastClipboardImage = '';
      this.emit('clipboard-cleared', {
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get a simple hash/identifier for images
   */
  private getImageHash(): string {
    try {
      const image = clipboard.readImage();
      if (image.isEmpty()) {
        return '';
      }

      const size = image.getSize();
      const aspectRatio = size.width / size.height;

      // Create a simple identifier based on size and aspect ratio
      return `${size.width}x${size.height}_${aspectRatio.toFixed(2)}`;
    } catch (error) {
      console.error('Error reading clipboard image:', error);
      return '';
    }
  }

  /**
   * Determine the type of change
   */
  private determineChangeType(
    textChanged: boolean,
    imageChanged: boolean
  ): ClipboardChangeEvent['changeType'] {
    if (textChanged && imageChanged) {
      return 'both';
    } else if (textChanged) {
      return 'text';
    } else if (imageChanged) {
      return 'image';
    } else {
      return 'cleared';
    }
  }

  /**
   * Get current clipboard contents (for debugging)
   */
  getCurrentClipboard(): {
    hasText: boolean;
    hasImage: boolean;
    textLength: number;
  } {
    const hasText = clipboard.has('text/plain');
    const hasImage = clipboard.has('image/png') || clipboard.has('image/jpeg');

    return {
      hasText,
      hasImage,
      textLength: hasText ? clipboard.readText().length : 0,
    };
  }

  /**
   * Clear the clipboard
   */
  clearClipboard(): void {
    clipboard.clear();
    this.lastClipboardText = '';
    this.lastClipboardImage = '';
  }

  /**
   * Get monitoring statistics
   */
  getStatistics(): {
    isRunning: boolean;
    pollIntervalMs: number;
    lastTextLength: number;
    hasImage: boolean;
  } {
    return {
      isRunning: this.isRunning,
      pollIntervalMs: this.config.pollIntervalMs,
      lastTextLength: this.lastClipboardText.length,
      hasImage: !!this.lastClipboardImage,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ClipboardMonitorConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = {
      ...this.config,
      ...config,
    };

    if (wasRunning) {
      this.start();
    }
  }
}
