// External imports
import { useEffect, useState } from 'react'; // v18.2.0

/**
 * A custom React hook that provides debounced value updates.
 * Useful for optimizing performance by reducing the frequency of expensive operations
 * like API calls, heavy computations, or frequent UI updates.
 * 
 * @template T - The type of value being debounced
 * @param {T} value - The value to debounce
 * @param {number} delay - The delay in milliseconds before updating the debounced value
 * @returns {T} The debounced value
 * 
 * @example
 * // Usage with string input
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 * 
 * @example
 * // Usage with complex object
 * const [formData, setFormData] = useState<FormData>({});
 * const debouncedFormData = useDebounce(formData, 300);
 */
function useDebounce<T>(value: T, delay: number): T {
  // Initialize state with the initial value
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Create a timeout to update the debounced value after the specified delay
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function to clear the timeout if value changes or component unmounts
    return () => {
      clearTimeout(timeoutId);
    };
    // Only re-run effect if value or delay changes
  }, [value, delay]);

  return debouncedValue;
}

// Export the hook as the default export for maximum flexibility
export default useDebounce;

// Also export a named export for users who prefer named imports
export { useDebounce };

// Type definition for the hook to ensure type safety
export type UseDebounceHook = typeof useDebounce;