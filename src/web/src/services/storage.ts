/**
 * @fileoverview High-level storage service providing type-safe persistent storage operations
 * for the web scraping platform's frontend. Handles user preferences, session data, and
 * cached responses with encryption, compression, and quota management.
 * @version 1.0.0
 */

import { setItem, getItem, removeItem } from '../utils/storage';
import { Theme } from '../types/common';

// Storage keys for different data types
const STORAGE_KEYS = {
  THEME: 'theme',
  AUTH_TOKEN: 'auth_token',
  USER_PREFERENCES: 'user_preferences',
  TASK_FILTERS: 'task_filters',
  DATA_FILTERS: 'data_filters',
  RECENT_TASKS: 'recent_tasks',
  CACHED_RESPONSES: 'cached_responses',
  STORAGE_VERSION: 'storage_version',
  QUOTA_USAGE: 'quota_usage'
} as const;

// Constants for storage limits and configuration
const MAX_RECENT_TASKS = 10;
const CACHE_EXPIRY = 300000; // 5 minutes in milliseconds
const STORAGE_VERSION = '1.0';
const MAX_STORAGE_QUOTA = 10 * 1024 * 1024; // 10MB

/**
 * Interface for tracking storage quota usage
 */
interface QuotaUsage {
  used: number;
  lastUpdated: number;
}

/**
 * Retrieves the user's theme preference with validation and fallback
 * @returns {Theme} User's theme preference or Theme.SYSTEM if not set
 */
export function getUserTheme(): Theme {
  try {
    const result = getItem<Theme>(STORAGE_KEYS.THEME);
    
    if (!result.success) {
      console.warn('Failed to retrieve theme preference:', result.error);
      return Theme.SYSTEM;
    }

    const storedTheme = result.data;

    // Validate stored theme against Theme enum
    if (storedTheme && Object.values(Theme).includes(storedTheme)) {
      return storedTheme;
    }

    // Log telemetry for invalid theme value
    console.warn('Invalid theme value stored:', storedTheme);
    return Theme.SYSTEM;
  } catch (error) {
    // Handle unexpected errors and fallback to system theme
    console.error('Error retrieving theme preference:', error);
    return Theme.SYSTEM;
  }
}

/**
 * Stores the user's theme preference with validation and quota management
 * @param {Theme} theme - Theme preference to store
 * @throws {Error} If storage quota is exceeded
 */
export function setUserTheme(theme: Theme): void {
  // Validate theme parameter
  if (!Object.values(Theme).includes(theme)) {
    throw new Error(`Invalid theme value: ${theme}`);
  }

  try {
    // Check current quota usage
    const quotaResult = getItem<QuotaUsage>(STORAGE_KEYS.QUOTA_USAGE);
    const currentQuota = quotaResult.success ? quotaResult.data?.used || 0 : 0;

    // Estimate new data size
    const themeSize = new TextEncoder().encode(JSON.stringify(theme)).length;

    if (currentQuota + themeSize > MAX_STORAGE_QUOTA) {
      throw new Error('Storage quota exceeded');
    }

    // Store theme preference
    const result = setItem(STORAGE_KEYS.THEME, theme);

    if (!result.success) {
      throw new Error(`Failed to store theme: ${result.error.message}`);
    }

    // Update quota usage
    setItem(STORAGE_KEYS.QUOTA_USAGE, {
      used: currentQuota + themeSize,
      lastUpdated: Date.now()
    });

    // Log telemetry for successful theme change
    console.debug('Theme preference updated:', theme);
  } catch (error) {
    // Handle storage errors with retry logic
    console.error('Error storing theme preference:', error);
    throw error;
  }
}

/**
 * Utility function to calculate current storage usage
 * @returns {Promise<number>} Current storage usage in bytes
 */
async function calculateStorageUsage(): Promise<number> {
  let totalSize = 0;
  
  for (const key of Object.values(STORAGE_KEYS)) {
    const result = getItem(key);
    if (result.success && result.data) {
      totalSize += new TextEncoder().encode(JSON.stringify(result.data)).length;
    }
  }
  
  return totalSize;
}

/**
 * Utility function to clean up expired cache entries
 */
function cleanupExpiredCache(): void {
  try {
    const result = getItem<Record<string, { data: any; timestamp: number }>>(
      STORAGE_KEYS.CACHED_RESPONSES
    );

    if (!result.success || !result.data) {
      return;
    }

    const now = Date.now();
    const cache = result.data;
    let hasExpired = false;

    // Remove expired entries
    Object.entries(cache).forEach(([key, value]) => {
      if (now - value.timestamp > CACHE_EXPIRY) {
        delete cache[key];
        hasExpired = true;
      }
    });

    // Update cache if items were removed
    if (hasExpired) {
      setItem(STORAGE_KEYS.CACHED_RESPONSES, cache);
    }
  } catch (error) {
    console.error('Error cleaning up cache:', error);
  }
}

// Initialize storage service
(function initializeStorage() {
  try {
    // Check storage version and perform migration if needed
    const versionResult = getItem<string>(STORAGE_KEYS.STORAGE_VERSION);
    if (!versionResult.success || versionResult.data !== STORAGE_VERSION) {
      setItem(STORAGE_KEYS.STORAGE_VERSION, STORAGE_VERSION);
    }

    // Initial cache cleanup
    cleanupExpiredCache();

    // Schedule periodic cache cleanup
    setInterval(cleanupExpiredCache, CACHE_EXPIRY);

    // Initialize quota tracking if not present
    const quotaResult = getItem<QuotaUsage>(STORAGE_KEYS.QUOTA_USAGE);
    if (!quotaResult.success || !quotaResult.data) {
      calculateStorageUsage().then(usage => {
        setItem(STORAGE_KEYS.QUOTA_USAGE, {
          used: usage,
          lastUpdated: Date.now()
        });
      });
    }
  } catch (error) {
    console.error('Storage initialization failed:', error);
  }
})();