/**
 * @fileoverview React context provider for managing application theme state.
 * Implements Material Design 3.0 theming with support for light, dark, and system preference modes.
 * @version 1.0.0
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'; // v18.2.0
import { ThemeProvider as MuiThemeProvider } from '@mui/material'; // v5.14.0
import { lightTheme, darkTheme } from '../config/theme';
import useMediaQuery from '../hooks/useMediaQuery';
import useLocalStorage from '../hooks/useLocalStorage';
import { Theme } from '../types/common';

// Constants
const THEME_STORAGE_KEY = 'app-theme';
const DARK_MODE_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const THEME_TRANSITION_DURATION = 300;

/**
 * Interface for theme context value with enhanced functionality
 */
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDarkMode: boolean;
  isSystemTheme: boolean;
  themeTransition: boolean;
}

/**
 * Interface for theme provider component props
 */
interface ThemeProviderProps {
  children: ReactNode;
}

// Create theme context with type safety
const ThemeContext = createContext<ThemeContextType | null>(null);

/**
 * Enhanced custom hook to access theme context with error handling
 * @returns Current theme context value
 * @throws Error if used outside ThemeProvider
 */
const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/**
 * Enhanced theme provider component with system preference detection and persistence
 */
const ThemeProvider = ({ children }: ThemeProviderProps): JSX.Element => {
  // Initialize theme state with persisted value
  const [storedTheme, setStoredTheme, , storageError] = useLocalStorage<Theme>(
    THEME_STORAGE_KEY,
    Theme.SYSTEM,
    { encrypt: false, syncTabs: true }
  );

  if (storageError) {
    console.error('Theme storage error:', storageError);
  }

  // State for theme and transition management
  const [currentTheme, setCurrentTheme] = useState<Theme>(storedTheme);
  const [themeTransition, setThemeTransition] = useState<boolean>(false);

  // Detect system dark mode preference
  const { matches: prefersDarkMode, error: mediaQueryError } = useMediaQuery(
    DARK_MODE_MEDIA_QUERY
  );

  if (mediaQueryError) {
    console.error('Media query error:', mediaQueryError);
  }

  /**
   * Enhanced theme change handler with transition and persistence
   */
  const handleThemeChange = (newTheme: Theme): void => {
    setThemeTransition(true);
    setCurrentTheme(newTheme);
    setStoredTheme(newTheme);

    // Broadcast theme change event for other components
    window.dispatchEvent(new CustomEvent('themechange', { detail: newTheme }));

    // Reset transition flag after animation
    setTimeout(() => {
      setThemeTransition(false);
    }, THEME_TRANSITION_DURATION);

    // Log theme change for analytics
    console.debug('Theme changed:', newTheme);
  };

  // Determine if dark mode should be active
  const isDarkMode = currentTheme === Theme.DARK || 
    (currentTheme === Theme.SYSTEM && prefersDarkMode);

  // Determine if using system theme
  const isSystemTheme = currentTheme === Theme.SYSTEM;

  // Update theme when system preference changes
  useEffect(() => {
    if (isSystemTheme) {
      // Skip transition animation for initial system preference
      setThemeTransition(false);
    }
  }, [prefersDarkMode, isSystemTheme]);

  // Context value with enhanced functionality
  const contextValue: ThemeContextType = {
    theme: currentTheme,
    setTheme: handleThemeChange,
    isDarkMode,
    isSystemTheme,
    themeTransition,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={isDarkMode ? darkTheme : lightTheme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Export components and hooks with type safety
export { ThemeProvider, useTheme, ThemeContext };
export type { ThemeContextType, ThemeProviderProps };