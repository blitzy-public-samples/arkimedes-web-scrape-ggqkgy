/**
 * @fileoverview Custom React hook for handling responsive design media queries with SSR support.
 * Implements mobile-first responsive design pattern with type safety and performance optimizations.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // v18.2.0
import { UI_CONSTANTS } from '../../config/constants';

// Constants for SSR and default values
const IS_BROWSER = typeof window !== 'undefined';
const DEFAULT_MEDIA_QUERY = '(min-width: 0px)';

/**
 * Type definition for media query event callback function
 */
type MediaQueryCallback = (event: MediaQueryListEvent) => void;

/**
 * Type definition for hook return value with error handling
 */
type MediaQueryHookResult = {
  matches: boolean;
  error: Error | null;
};

/**
 * Creates a type-safe media query string from a pixel value
 * @param width - Breakpoint width in pixels
 * @returns Formatted media query string
 * @throws Error if width is invalid
 */
export const createMediaQuery = (width: number): string => {
  if (typeof width !== 'number' || width < 0) {
    throw new Error('Invalid width value for media query');
  }
  return `(min-width: ${width}px)`;
};

/**
 * Custom hook for handling responsive design media queries with SSR support
 * Follows mobile-first pattern and provides error handling
 * 
 * @param query - Media query string to evaluate
 * @returns Object containing match status and any errors
 * 
 * @example
 * ```tsx
 * const { matches, error } = useMediaQuery(createMediaQuery(UI_CONSTANTS.breakpoints.tablet));
 * if (error) {
 *   console.error('Media query error:', error);
 * }
 * return matches ? <DesktopView /> : <MobileView />;
 * ```
 */
const useMediaQuery = (query: string): MediaQueryHookResult => {
  // Initialize state with SSR-safe defaults
  const [matches, setMatches] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Validate query parameter
  const safeQuery = query || DEFAULT_MEDIA_QUERY;

  // Memoized media query list creation
  const getMediaQueryList = useCallback((): MediaQueryList | null => {
    if (!IS_BROWSER) return null;
    
    try {
      return window.matchMedia(safeQuery);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create MediaQueryList'));
      return null;
    }
  }, [safeQuery]);

  // Memoized event handler
  const handleChange = useCallback((event: MediaQueryListEvent): void => {
    try {
      setMatches(event.matches);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Media query event handling failed'));
    }
  }, []);

  useEffect(() => {
    if (!IS_BROWSER) {
      return undefined;
    }

    let mounted = true;
    let mediaQueryList: MediaQueryList | null = null;

    try {
      // Create media query list
      mediaQueryList = getMediaQueryList();
      
      if (!mediaQueryList) {
        throw new Error('Failed to initialize media query');
      }

      // Set initial state
      if (mounted) {
        setMatches(mediaQueryList.matches);
      }

      // Event listener for changes
      const safeHandler: MediaQueryCallback = (event) => {
        if (mounted) {
          handleChange(event);
        }
      };

      // Add event listener with error boundary
      try {
        // Modern browsers
        mediaQueryList.addEventListener('change', safeHandler);
      } catch (err) {
        // Fallback for older browsers
        mediaQueryList.addListener(safeHandler as any);
      }

      // Cleanup function
      return () => {
        mounted = false;
        if (mediaQueryList) {
          try {
            // Modern browsers
            mediaQueryList.removeEventListener('change', safeHandler);
          } catch (err) {
            // Fallback for older browsers
            mediaQueryList.removeListener(safeHandler as any);
          }
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Media query initialization failed'));
      return undefined;
    }
  }, [getMediaQueryList, handleChange]);

  return { matches, error };
};

// Pre-configured breakpoint queries for common use cases
export const useIsMobile = (): MediaQueryHookResult => 
  useMediaQuery(createMediaQuery(UI_CONSTANTS.breakpoints.mobile));

export const useIsTablet = (): MediaQueryHookResult => 
  useMediaQuery(createMediaQuery(UI_CONSTANTS.breakpoints.tablet));

export const useIsDesktop = (): MediaQueryHookResult => 
  useMediaQuery(createMediaQuery(UI_CONSTANTS.breakpoints.desktop));

export const useIsWidescreen = (): MediaQueryHookResult => 
  useMediaQuery(createMediaQuery(UI_CONSTANTS.breakpoints.widescreen));

export default useMediaQuery;