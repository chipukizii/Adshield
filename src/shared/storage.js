/**
 * AdShield — Storage Utility
 *
 * A thin, promise-based wrapper around chrome.storage.local.
 * Centralizes all storage access so we can:
 *   - Add error handling in one place.
 *   - Add logging/debugging in one place.
 *   - Replace the backend (e.g., sync storage) without touching all callers.
 *
 * Usage:
 *   import { StorageManager } from '../shared/storage.js';
 *   const settings = await StorageManager.get('protectionEnabled');
 *   await StorageManager.set({ protectionEnabled: false });
 */

'use strict';

export const StorageManager = {

  /**
   * Get one or more values from storage.
   * @param {string|string[]|null} keys — key, array of keys, or null for all.
   * @returns {Promise<object>}
   */
  async get(keys) {
    return chrome.storage.local.get(keys);
  },

  /**
   * Set one or more values in storage.
   * @param {object} items — key-value pairs to store.
   * @returns {Promise<void>}
   */
  async set(items) {
    return chrome.storage.local.set(items);
  },

  /**
   * Remove a key or array of keys from storage.
   * @param {string|string[]} keys
   * @returns {Promise<void>}
   */
  async remove(keys) {
    return chrome.storage.local.remove(keys);
  },

  /**
   * Clear ALL storage. Use with caution — resets all user settings.
   * @returns {Promise<void>}
   */
  async clear() {
    return chrome.storage.local.clear();
  },

  /**
   * Get a single value with a fallback default.
   * @param {string} key
   * @param {*} defaultValue
   * @returns {Promise<*>}
   */
  async getValue(key, defaultValue = null) {
    const result = await chrome.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  },

};
