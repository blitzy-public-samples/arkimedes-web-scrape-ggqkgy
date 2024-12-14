/**
 * @fileoverview Core theme configuration implementing Material Design 3.0 specifications
 * with comprehensive support for light/dark themes, accessibility compliance, and responsive design.
 * @version 1.0.0
 */

import { createTheme, Theme, ThemeOptions, PaletteOptions } from '@mui/material';
import { UI_CONSTANTS } from './constants';

const { mobile, tablet, desktop, widescreen } = UI_CONSTANTS.breakpoints;

// Global theme constants
const FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';
const HEADING_FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';
const SPACING_UNIT = 8;
const TRANSITION_DURATION = 200;

// Type definitions for theme customization
export type ThemeMode = 'light' | 'dark';
export type CustomSpacing = Record<string, number>;
export type CustomTransitions = Record<string, string>;

// Extended theme interface with custom properties
export interface CustomTheme extends Theme {
  custom: Record<string, unknown>;
  spacing: CustomSpacing;
  transitions: CustomTransitions;
}

/**
 * Creates foundational theme configuration with shared settings
 * @param palette - Theme-specific palette options
 * @returns Complete theme configuration
 */
const createBaseTheme = (palette: PaletteOptions): ThemeOptions => ({
  palette,
  typography: {
    fontFamily: FONT_FAMILY,
    h1: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
      fontWeight: 700,
    },
    h2: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: 'clamp(2rem, 4vw, 3rem)',
      fontWeight: 600,
    },
    h3: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
      fontWeight: 600,
    },
    h4: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: 'clamp(1.5rem, 2.5vw, 2rem)',
      fontWeight: 500,
    },
    h5: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: 'clamp(1.25rem, 2vw, 1.5rem)',
      fontWeight: 500,
    },
    h6: {
      fontFamily: HEADING_FONT_FAMILY,
      fontSize: 'clamp(1rem, 1.5vw, 1.25rem)',
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
  },
  breakpoints: {
    values: {
      xs: mobile,
      sm: tablet,
      md: desktop,
      lg: widescreen,
      xl: widescreen + 200,
    },
  },
  spacing: SPACING_UNIT,
  shape: {
    borderRadius: 8,
  },
  transitions: {
    duration: {
      shortest: TRANSITION_DURATION / 2,
      shorter: TRANSITION_DURATION * 0.75,
      short: TRANSITION_DURATION,
      standard: TRANSITION_DURATION,
      complex: TRANSITION_DURATION * 1.25,
      enteringScreen: TRANSITION_DURATION * 1.5,
      leavingScreen: TRANSITION_DURATION,
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': {
          boxSizing: 'border-box',
        },
        body: {
          margin: 0,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: '8px',
          padding: '8px 16px',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'medium',
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
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
  },
  warning: {
    main: UI_CONSTANTS.themeConfig.colors.warning,
  },
  info: {
    main: UI_CONSTANTS.themeConfig.colors.info,
  },
  success: {
    main: UI_CONSTANTS.themeConfig.colors.success,
  },
  background: {
    default: '#f5f5f5',
    paper: '#ffffff',
  },
  text: {
    primary: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.6)',
    disabled: 'rgba(0, 0, 0, 0.38)',
  },
  divider: 'rgba(0, 0, 0, 0.12)',
}));

// Dark theme configuration with WCAG compliant contrast ratios
export const darkTheme = createTheme(createBaseTheme({
  mode: 'dark',
  primary: {
    main: '#90caf9', // Enhanced contrast for dark mode
    contrastText: '#000000',
  },
  secondary: {
    main: '#f48fb1', // Enhanced contrast for dark mode
    contrastText: '#000000',
  },
  error: {
    main: '#f44336',
  },
  warning: {
    main: '#ffa726',
  },
  info: {
    main: '#29b6f6',
  },
  success: {
    main: '#66bb6a',
  },
  background: {
    default: '#121212',
    paper: '#1e1e1e',
  },
  text: {
    primary: 'rgba(255, 255, 255, 0.87)',
    secondary: 'rgba(255, 255, 255, 0.6)',
    disabled: 'rgba(255, 255, 255, 0.38)',
  },
  divider: 'rgba(255, 255, 255, 0.12)',
}));