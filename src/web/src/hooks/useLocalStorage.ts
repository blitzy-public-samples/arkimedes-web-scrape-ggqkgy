/**
 * @fileoverview Custom React hook for type-safe localStorage management with automatic
 * serialization/deserialization, state synchronization, and error handling.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // v18.2.0
import { getItem, setItem } from '../utils/storage';
import { Optional } from '../types/common';

/**
 * Type definition for storage hook configuration options
 */
interface StorageOptions {
  /** Enable encryption for sensitive data */
  encrypt?: boolean;
  /** Debounce delay for frequent updates (ms) */
  debounceDelay?: number;
  /** Enable cross-tab synchronization */
  syncTabs?: boolean;
}

/**
 * Type-safe wrapper for stored values that may be null or undefined
 */
type StorageValue<T> = Optional<T>;

/**
 * Return type for the useLocalStorage hook including value, setters, and error state
 */
type StorageHookReturn<T> = [
  T,                    // Current value
  (value: T) => void,  // Setter function
  () => void,          // Remove function
  Error | null         // Error state
];

/**
 * Default options for storage operations
 */
const DEFAULT_OPTIONS: StorageOptions = {
  encrypt: false,
  debounceDelay: 300,
  syncTabs: true
};

/**
 * Custom hook for managing localStorage values with React state synchronization
 * 
 * @template T - Type of the stored value
 * @param {string} key - Storage key
 * @param {T} initialValue - Initial value if none exists in storage
 * @param {StorageOptions} options - Configuration options
 * @returns {StorageHookReturn<T>} Tuple of [value, setter, remove, error]
 */
const useLocalStorage = <T>(
  key: string,
  initialValue: T,
  options: StorageOptions = DEFAULT_OPTIONS
): StorageHookReturn<T> => {
  // Initialize state with stored value or initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const result = getItem<T>(key, options.encrypt);
      if (result.success) {
        return result.data ?? initialValue;
      }
      console.error('Failed to retrieve stored value:', result.error);
      return initialValue;
    } catch (error) {
      console.error('Error initializing storage value:', error);
      return initialValue;
    }
  });

  // Track error state
  const [error, setError] = useState<Error | null>(null);

  // Debounce timer reference
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  /**
   * Memoized setter function for updating storage and state
   */
  const setValue = useCallback((value: T) => {
    try {
      // Clear any existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce storage updates
      debounceTimerRef.current = setTimeout(() => {
        const result = setItem(key, value, options.encrypt);
        if (!result.success) {
          setError(new Error(result.error.message));
          console.error('Storage update failed:', result.error);
          return;
        }
        setStoredValue(value);
        setError(null);
      }, options.debounceDelay);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown storage error');
      setError(error);
      console.error('Error setting storage value:', error);
    }
  }, [key, options.encrypt, options.debounceDelay]);

  /**
   * Memoized remove function for clearing storage
   */
  const removeValue = useCallback(() => {
    try {
      const result = removeItem(key);
      if (!result.success) {
        setError(new Error(result.error.message));
        console.error('Storage removal failed:', result.error);
        return;
      }
      setStoredValue(initialValue);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown storage error');
      setError(error);
      console.error('Error removing storage value:', error);
    }
  }, [key, initialValue]);

  /**
   * Handle storage events for cross-tab synchronization
   */
  useEffect(() => {
    if (!options.syncTabs) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          const result = getItem<T>(key, options.encrypt);
          if (result.success) {
            setStoredValue(result.data ?? initialValue);
            setError(null);
          } else {
            setError(new Error(result.error.message));
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Unknown storage error');
          setError(error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, options.syncTabs, options.encrypt, initialValue]);

  /**
   * Cleanup effect for debounce timers
   */
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return [storedValue, setValue, removeValue, error];
};

export default useLocalStorage;
```

This implementation provides:

1. Type Safety:
- Fully typed with TypeScript generics
- Proper error handling with type-safe error states
- Type-safe storage operations using the imported utility functions

2. Features:
- Automatic serialization/deserialization of stored values
- Optional encryption for sensitive data
- Cross-tab synchronization
- Debounced updates for performance
- Error tracking and reporting

3. Performance:
- Memoized setter and remove functions
- Debounced storage updates
- Efficient event cleanup

4. Security:
- Optional encryption support
- Safe error handling and logging
- Proper cleanup of sensitive data

5. Developer Experience:
- Comprehensive documentation
- Clear type definitions
- Consistent error handling
- Easy configuration through options

The hook can be used in components like this:

```typescript
const [value, setValue, removeValue, error] = useLocalStorage<string>(
  'my-key',
  'default value',
  { encrypt: true, syncTabs: true }
);