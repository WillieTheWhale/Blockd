/**
 * Settings Store
 *
 * Secure settings storage using electron-store with encryption.
 * Stores session settings and user preferences.
 */

import Store from 'electron-store';
import { SessionSettings } from '../../shared/types.js';

interface StoreSchema {
  sessionSettings?: SessionSettings;
  sessionToken?: string;
  sessionId?: string;
  userPreferences: {
    theme?: 'light' | 'dark' | 'system';
    notifications?: boolean;
    language?: string;
  };
  lastSession?: {
    id: string;
    endedAt: number;
    reason?: string;
  };
}

export class SettingsStore {
  private store: Store<StoreSchema>;

  constructor(encryptionKey?: string) {
    // Initialize electron-store with encryption
    this.store = new Store<StoreSchema>({
      name: 'blockd-settings',
      encryptionKey,
      defaults: {
        userPreferences: {
          theme: 'system',
          notifications: true,
          language: 'en',
        },
      },
      // Clear session data on app start for security
      clearInvalidConfig: true,
    });

    // Clear any leftover session data from previous run
    this.clearSessionData();
  }

  // ============================================================================
  // Session Settings
  // ============================================================================

  /**
   * Store session settings
   */
  setSessionSettings(settings: SessionSettings): void {
    this.store.set('sessionSettings', settings);
  }

  /**
   * Get session settings
   */
  getSessionSettings(): SessionSettings | undefined {
    return this.store.get('sessionSettings');
  }

  /**
   * Store session token
   */
  setSessionToken(token: string): void {
    this.store.set('sessionToken', token);
  }

  /**
   * Get session token
   */
  getSessionToken(): string | undefined {
    return this.store.get('sessionToken');
  }

  /**
   * Store session ID
   */
  setSessionId(id: string): void {
    this.store.set('sessionId', id);
  }

  /**
   * Get session ID
   */
  getSessionId(): string | undefined {
    return this.store.get('sessionId');
  }

  /**
   * Store last session info
   */
  setLastSession(id: string, reason?: string): void {
    this.store.set('lastSession', {
      id,
      endedAt: Date.now(),
      reason,
    });
  }

  /**
   * Get last session info
   */
  getLastSession(): { id: string; endedAt: number; reason?: string } | undefined {
    return this.store.get('lastSession');
  }

  /**
   * Clear all session-related data
   */
  clearSessionData(): void {
    this.store.delete('sessionSettings');
    this.store.delete('sessionToken');
    this.store.delete('sessionId');
    // Don't clear lastSession - it's useful for analytics
  }

  // ============================================================================
  // User Preferences
  // ============================================================================

  /**
   * Set theme preference
   */
  setTheme(theme: 'light' | 'dark' | 'system'): void {
    this.store.set('userPreferences.theme', theme);
  }

  /**
   * Get theme preference
   */
  getTheme(): 'light' | 'dark' | 'system' {
    return this.store.get('userPreferences.theme', 'system');
  }

  /**
   * Set notifications preference
   */
  setNotifications(enabled: boolean): void {
    this.store.set('userPreferences.notifications', enabled);
  }

  /**
   * Get notifications preference
   */
  getNotifications(): boolean {
    return this.store.get('userPreferences.notifications', true);
  }

  /**
   * Set language preference
   */
  setLanguage(language: string): void {
    this.store.set('userPreferences.language', language);
  }

  /**
   * Get language preference
   */
  getLanguage(): string {
    return this.store.get('userPreferences.language', 'en');
  }

  /**
   * Get all user preferences
   */
  getUserPreferences() {
    return this.store.get('userPreferences');
  }

  /**
   * Set multiple user preferences at once
   */
  setUserPreferences(prefs: Partial<StoreSchema['userPreferences']>): void {
    const current = this.getUserPreferences();
    this.store.set('userPreferences', { ...current, ...prefs });
  }

  // ============================================================================
  // Store Management
  // ============================================================================

  /**
   * Clear all stored data (including preferences)
   */
  clearAll(): void {
    this.store.clear();
  }

  /**
   * Reset to default settings
   */
  reset(): void {
    this.clearAll();
    // Restore defaults
    this.store.set('userPreferences', {
      theme: 'system',
      notifications: true,
      language: 'en',
    });
  }

  /**
   * Get the store file path (for debugging)
   */
  getStorePath(): string {
    return this.store.path;
  }

  /**
   * Check if store has any data
   */
  isEmpty(): boolean {
    return this.store.size === 0;
  }

  /**
   * Get store size (number of keys)
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Export all settings (for backup)
   */
  export(): StoreSchema {
    return this.store.store;
  }

  /**
   * Import settings (from backup)
   * WARNING: This will overwrite all current settings
   */
  import(data: Partial<StoreSchema>): void {
    // Validate data structure against expected schema
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import data: must be an object');
    }

    // Validate userPreferences if present
    if (data.userPreferences !== undefined) {
      if (typeof data.userPreferences !== 'object' || data.userPreferences === null) {
        throw new Error('Invalid import data: userPreferences must be an object');
      }
      const prefs = data.userPreferences;
      if (prefs.theme !== undefined && !['light', 'dark', 'system'].includes(prefs.theme)) {
        throw new Error('Invalid import data: theme must be "light", "dark", or "system"');
      }
      if (prefs.notifications !== undefined && typeof prefs.notifications !== 'boolean') {
        throw new Error('Invalid import data: notifications must be a boolean');
      }
      if (prefs.language !== undefined && typeof prefs.language !== 'string') {
        throw new Error('Invalid import data: language must be a string');
      }
    }

    // Validate lastSession if present
    if (data.lastSession !== undefined) {
      if (typeof data.lastSession !== 'object' || data.lastSession === null) {
        throw new Error('Invalid import data: lastSession must be an object');
      }
      if (typeof data.lastSession.id !== 'string') {
        throw new Error('Invalid import data: lastSession.id must be a string');
      }
      if (typeof data.lastSession.endedAt !== 'number') {
        throw new Error('Invalid import data: lastSession.endedAt must be a number');
      }
      if (data.lastSession.reason !== undefined && typeof data.lastSession.reason !== 'string') {
        throw new Error('Invalid import data: lastSession.reason must be a string');
      }
    }

    // Validate sessionSettings if present (should not be imported for security)
    if (data.sessionSettings !== undefined || data.sessionToken !== undefined || data.sessionId !== undefined) {
      throw new Error('Invalid import data: session-related fields cannot be imported');
    }

    // Only import allowed fields (userPreferences and lastSession)
    const safeData: Partial<StoreSchema> = {};
    if (data.userPreferences) {
      safeData.userPreferences = {
        theme: data.userPreferences.theme,
        notifications: data.userPreferences.notifications,
        language: data.userPreferences.language,
      };
    }
    if (data.lastSession) {
      safeData.lastSession = {
        id: data.lastSession.id,
        endedAt: data.lastSession.endedAt,
        reason: data.lastSession.reason,
      };
    }

    // Merge with defaults instead of full overwrite
    const current = this.store.store;
    this.store.store = {
      ...current,
      ...safeData,
    } as StoreSchema;
  }
}

// Singleton instance
let settingsStoreInstance: SettingsStore | null = null;

/**
 * Get or create the settings store singleton
 */
export function getSettingsStore(encryptionKey?: string): SettingsStore {
  if (!settingsStoreInstance) {
    settingsStoreInstance = new SettingsStore(encryptionKey);
  }
  return settingsStoreInstance;
}

/**
 * Destroy the settings store singleton
 */
export function destroySettingsStore(): void {
  settingsStoreInstance = null;
}
