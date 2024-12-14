/**
 * @fileoverview Core theme implementation for the Web Scraping Platform.
 * Implements Material Design 3.0 with WCAG 2.1 Level AA compliance.
 * Provides light and dark themes with responsive design support.
 * @version 1.0.0
 */

import { createTheme, Theme, ThemeOptions, PaletteOptions } from '@mui/material';
import { UI_CONSTANTS } from '../config/constants';

// Global constants
const FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';
const HEADING_FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';
const SPACING_UNIT = 8;
const TRANSITION_DURATION = 200;

// Extended theme interface for custom properties
interface CustomTheme extends Theme {
  custom?: Record<string, unknown>;
  transitions: Record<string, string>;
  elevation: Record<string, string>;
}

// Theme mode type
type ThemeMode = 'light' | 'dark';

/**
 * Creates base theme configuration shared between light and dark themes
 * @param palette - Theme-specific color palette
 * @returns Base theme configuration
 */
const createBaseTheme = (palette: PaletteOptions): ThemeOptions => ({
  palette,
  typography: {
    fontFamily: FONT_FAMILY,
    h1: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
      '@media (max-width:768px)': {
        fontSize: '2rem',
      },
    },
    h2: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
      '@media (max-width:768px)': {
        fontSize: '1.75rem',
      },
    },
    h3: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.3,
      '@media (max-width:768px)': {
        fontSize: '1.5rem',
      },
    },
    h4: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
  },
  spacing: (factor: number) => `${SPACING_UNIT * factor}px`,
  breakpoints: {
    values: {
      xs: UI_CONSTANTS.breakpoints.mobile,
      sm: UI_CONSTANTS.breakpoints.tablet,
      md: UI_CONSTANTS.breakpoints.desktop,
      lg: UI_CONSTANTS.breakpoints.widescreen,
      xl: 1920,
    },
  },
  transitions: {
    duration: {
      shortest: TRANSITION_DURATION / 2,
      shorter: TRANSITION_DURATION * 0.75,
      short: TRANSITION_DURATION,
      standard: TRANSITION_DURATION,
      complex: TRANSITION_DURATION * 1.25,
      enteringScreen: TRANSITION_DURATION,
      leavingScreen: TRANSITION_DURATION * 0.75,
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '4px',
          fontWeight: 500,
          padding: '6px 16px',
        },
      },
    },
    MuiFocusRing: {
      defaultProps: {
        width: UI_CONSTANTS.themeConfig.accessibility.focusRingWidth,
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        '@media (prefers-reduced-motion: reduce)': {
          '*': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },
  },
});

// Light theme configuration
export const lightTheme = createTheme(createBaseTheme({
  mode: 'light',
  primary: {
    main: UI_CONSTANTS.themeConfig.colors.primary,
    contrastText: '#ffffff',
  },
  secondary: {
    main: UI_CONSTANTS.themeConfig.colors.secondary,
    contrastText: '#ffffff',
  },
  error: {
    main: UI_CONSTANTS.themeConfig.colors.error,
    contrastText: '#ffffff',
  },
  warning: {
    main: UI_CONSTANTS.themeConfig.colors.warning,
    contrastText: '#000000',
  },
  info: {
    main: UI_CONSTANTS.themeConfig.colors.info,
    contrastText: '#ffffff',
  },
  success: {
    main: UI_CONSTANTS.themeConfig.colors.success,
    contrastText: '#ffffff',
  },
  background: {
    default: '#ffffff',
    paper: '#f5f5f5',
  },
  text: {
    primary: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.6)',
    disabled: 'rgba(0, 0, 0, 0.38)',
  },
  divider: 'rgba(0, 0, 0, 0.12)',
}));

// Dark theme configuration
export const darkTheme = createTheme(createBaseTheme({
  mode: 'dark',
  primary: {
    main: UI_CONSTANTS.themeConfig.colors.primary,
    contrastText: '#ffffff',
  },
  secondary: {
    main: UI_CONSTANTS.themeConfig.colors.secondary,
    contrastText: '#ffffff',
  },
  error: {
    main: UI_CONSTANTS.themeConfig.colors.error,
    contrastText: '#ffffff',
  },
  warning: {
    main: UI_CONSTANTS.themeConfig.colors.warning,
    contrastText: '#000000',
  },
  info: {
    main: UI_CONSTANTS.themeConfig.colors.info,
    contrastText: '#ffffff',
  },
  success: {
    main: UI_CONSTANTS.themeConfig.colors.success,
    contrastText: '#ffffff',
  },
  background: {
    default: '#121212',
    paper: '#1e1e1e',
  },
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.7)',
    disabled: 'rgba(255, 255, 255, 0.5)',
  },
  divider: 'rgba(255, 255, 255, 0.12)',
}));