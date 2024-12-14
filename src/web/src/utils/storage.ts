/**
 * @fileoverview Type-safe utility functions for browser localStorage operations with
 * comprehensive error handling, versioning support, and secure data serialization.
 * @version 1.0.0
 */

import CryptoJS from 'crypto-js'; // v4.1.1
import { ErrorType } from '../types/common';

// Global constants
const STORAGE_PREFIX = 'web_scraper_';
const STORAGE_VERSION = 'v1';
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ENCRYPTION_KEY = process.env.STORAGE_ENCRYPTION_KEY || 'default_key';

/**
 * Custom error type for storage operations
 */
interface StorageError {
  type: ErrorType;
  message: string;
  code: string;
  details: Record<string, any>;
}

/**
 * Result type for handling operation outcomes
 */
type Result<T, E = StorageError> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};

/**
 * Decorator for validating storage availability
 */
function validateStorage(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function(...args: any[]) {
    try {
      if (!window.localStorage) {
        return {
          success: false,
          error: {
            type: 'unknown',
            message: 'localStorage is not available',
            code: 'STORAGE_001',
            details: {}
          }
        };
      }
      return originalMethod.apply(this, args);
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown',
          message: 'Storage operation failed',
          code: 'STORAGE_002',
          details: { error }
        }
      };
    }
  };
}

/**
 * Decorator for logging storage access
 */
function logStorageAccess(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function(...args: any[]) {
    console.debug(`Storage operation: ${propertyKey}`, { args });
    return originalMethod.apply(this, args);
  };
}

/**
 * Namespace containing storage utility functions
 */
export namespace storage {
  /**
   * Creates a versioned key for storage
   */
  function createVersionedKey(key: string): string {
    return `${STORAGE_PREFIX}${STORAGE_VERSION}_${key}`;
  }

  /**
   * Encrypts data using AES encryption
   */
  function encrypt(data: string): string {
    return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
  }

  /**
   * Decrypts data using AES decryption
   */
  function decrypt(data: string): string {
    const bytes = CryptoJS.AES.decrypt(data, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Stores a value in localStorage with optional encryption
   */
  @validateStorage
  export function setItem<T>(key: string, value: T, encrypt = false): Result<void> {
    try {
      if (!key || typeof key !== 'string') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: 'Invalid key provided',
            code: 'STORAGE_003',
            details: { key }
          }
        };
      }

      const serializedValue = JSON.stringify(value);
      const dataToStore = encrypt ? encrypt(serializedValue) : serializedValue;
      
      if (dataToStore.length > MAX_STORAGE_SIZE) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: 'Data exceeds maximum storage size',
            code: 'STORAGE_004',
            details: { size: dataToStore.length, maxSize: MAX_STORAGE_SIZE }
          }
        };
      }

      localStorage.setItem(createVersionedKey(key), dataToStore);
      return { success: true, data: void 0 };
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        return {
          success: false,
          error: {
            type: 'storage',
            message: 'Storage quota exceeded',
            code: 'STORAGE_005',
            details: { error }
          }
        };
      }
      throw error;
    }
  }

  /**
   * Retrieves and deserializes a value from localStorage
   */
  @validateStorage
  export function getItem<T>(key: string, decrypt = false): Result<T | null> {
    try {
      const versionedKey = createVersionedKey(key);
      const storedValue = localStorage.getItem(versionedKey);

      if (!storedValue) {
        return { success: true, data: null };
      }

      const decodedValue = decrypt ? storage.decrypt(storedValue) : storedValue;

      try {
        const parsedValue = JSON.parse(decodedValue) as T;
        return { success: true, data: parsedValue };
      } catch (error) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: 'Failed to parse stored value',
            code: 'STORAGE_006',
            details: { error }
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown',
          message: 'Failed to retrieve item',
          code: 'STORAGE_007',
          details: { error }
        }
      };
    }
  }

  /**
   * Removes an item from localStorage
   */
  @validateStorage
  @logStorageAccess
  export function removeItem(key: string): Result<void> {
    try {
      const versionedKey = createVersionedKey(key);
      localStorage.removeItem(versionedKey);
      return { success: true, data: void 0 };
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown',
          message: 'Failed to remove item',
          code: 'STORAGE_008',
          details: { error }
        }
      };
    }
  }

  /**
   * Clears all versioned items from localStorage
   */
  @validateStorage
  @logStorageAccess
  export function clear(): Result<void> {
    try {
      const keys = Object.keys(localStorage);
      const versionedKeys = keys.filter(key => 
        key.startsWith(`${STORAGE_PREFIX}${STORAGE_VERSION}`));

      versionedKeys.forEach(key => localStorage.removeItem(key));
      return { success: true, data: void 0 };
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown',
          message: 'Failed to clear storage',
          code: 'STORAGE_009',
          details: { error }
        }
      };
    }
  }

  /**
   * Migrates storage data between versions
   */
  @validateStorage
  export async function migrateStorage(
    fromVersion: string,
    toVersion: string
  ): Promise<Result<void>> {
    try {
      const keys = Object.keys(localStorage);
      const oldVersionKeys = keys.filter(key => 
        key.startsWith(`${STORAGE_PREFIX}${fromVersion}`));

      for (const oldKey of oldVersionKeys) {
        const value = localStorage.getItem(oldKey);
        if (value) {
          const newKey = oldKey.replace(fromVersion, toVersion);
          localStorage.setItem(newKey, value);
          localStorage.removeItem(oldKey);
        }
      }

      return { success: true, data: void 0 };
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown',
          message: 'Storage migration failed',
          code: 'STORAGE_010',
          details: { error, fromVersion, toVersion }
        }
      };
    }
  }
}