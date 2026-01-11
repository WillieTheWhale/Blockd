/**
 * Safe localStorage wrapper with error handling and type safety
 *
 * Features:
 * - Try-catch around all operations (handles quota exceeded, private mode)
 * - JSON serialization/deserialization
 * - Default value support
 * - Storage availability detection
 */

import { STORAGE_KEYS } from './constants'
import { logger } from './logger'

/**
 * Check if localStorage is available
 */
export function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__'
    localStorage.setItem(testKey, testKey)
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * Get an item from localStorage with type safety
 */
export function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key)
    if (item === null) {
      return defaultValue
    }

    // Try to parse as JSON, fallback to raw value
    try {
      return JSON.parse(item) as T
    } catch {
      // Return raw string value if not valid JSON
      return item as unknown as T
    }
  } catch (error) {
    logger.warn('Failed to get item from localStorage', {
      component: 'storage',
      action: 'getStorageItem',
      key,
    })
    return defaultValue
  }
}

/**
 * Get a string item from localStorage
 */
export function getStorageString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (error) {
    logger.warn('Failed to get string from localStorage', {
      component: 'storage',
      action: 'getStorageString',
      key,
    })
    return null
  }
}

/**
 * Set an item in localStorage
 */
export function setStorageItem<T>(key: string, value: T): boolean {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, serialized)
    return true
  } catch (error) {
    // Handle QuotaExceededError
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      logger.error('localStorage quota exceeded', error, {
        component: 'storage',
        action: 'setStorageItem',
        key,
      })
    } else {
      logger.warn('Failed to set item in localStorage', {
        component: 'storage',
        action: 'setStorageItem',
        key,
      })
    }
    return false
  }
}

/**
 * Remove an item from localStorage
 */
export function removeStorageItem(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    logger.warn('Failed to remove item from localStorage', {
      component: 'storage',
      action: 'removeStorageItem',
      key,
    })
    return false
  }
}

/**
 * Clear all items from localStorage
 */
export function clearStorage(): boolean {
  try {
    localStorage.clear()
    return true
  } catch (error) {
    logger.warn('Failed to clear localStorage', {
      component: 'storage',
      action: 'clearStorage',
    })
    return false
  }
}

// Re-export STORAGE_KEYS for convenience
export { STORAGE_KEYS }

/**
 * Storage utility object for common operations
 */
export const storage = {
  isAvailable: isStorageAvailable,
  get: getStorageItem,
  getString: getStorageString,
  set: setStorageItem,
  remove: removeStorageItem,
  clear: clearStorage,
  keys: STORAGE_KEYS,
}
