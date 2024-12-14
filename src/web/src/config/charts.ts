/**
 * @fileoverview Chart.js configuration for dashboard visualizations
 * Implements Material Design theming, accessibility features, and responsive options
 * @version 1.0.0
 */

import { Chart } from 'chart.js/auto'; // chart.js v4.4.0
import { palette } from './theme';

// Global chart constants
export const CHART_FONT_FAMILY = "'Inter', system-ui, -apple-system, sans-serif";
export const CHART_GRID_COLOR = 'rgba(0, 0, 0, 0.1)';
export const CHART_ANIMATION_DURATION = 750;

export const CHART_BREAKPOINTS = {
  mobile: 320,
  tablet: 768,
  desktop: 1024,
  large: 1440,
} as const;

/**
 * Default chart theme configuration with Material Design integration
 */
export const chartTheme = {
  colors: {
    primary: palette.primary.main,
    secondary: palette.secondary.main,
    error: palette.error.main,
    background: palette.background.default,
    grid: CHART_GRID_COLOR,
    text: palette.text?.primary,
  },
  fonts: {
    family: CHART_FONT_FAMILY,
    sizes: {
      title: 16,
      label: 14,
      tick: 12,
    },
  },
  darkMode: {
    grid: 'rgba(255, 255, 255, 0.1)',
    text: palette.text?.primary,
  },
  accessibility: {
    announceOnShow: true,
    announceZero: true,
    minContrastRatio: 4.5,
  },
} as const;

/**
 * Generates responsive configuration based on screen size
 * @param width - Viewport width
 * @param height - Viewport height
 * @param options - Additional configuration options
 */
export const getResponsiveConfig = (
  width: number,
  height: number,
  options: Record<string, any> = {}
): Record<string, any> => {
  const isMobile = width <= CHART_BREAKPOINTS.tablet;
  const isTablet = width <= CHART_BREAKPOINTS.desktop;

  return {
    responsive: true,
    maintainAspectRatio: !isMobile,
    devicePixelRatio: window.devicePixelRatio || 1,
    animation: {
      duration: isMobile ? CHART_ANIMATION_DURATION / 2 : CHART_ANIMATION_DURATION,
    },
    font: {
      size: isMobile ? 12 : isTablet ? 14 : 16,
    },
    interaction: {
      mode: isMobile ? 'nearest' : 'index',
      intersect: false,
    },
    ...options,
  };
};

/**
 * Error handler for chart rendering issues
 * @param error - Error object
 */
export const handleChartError = (error: Error): void => {
  console.error('Chart rendering error:', error);
  // Implement error reporting/monitoring
};

/**
 * Default configuration for line charts
 */
export const lineChartConfig = {
  options: {
    ...defaultChartOptions,
    elements: {
      line: {
        tension: 0.4,
        borderWidth: 2,
      },
      point: {
        radius: 4,
        hitRadius: 8,
        hoverRadius: 6,
      },
    },
  },
};

/**
 * Default configuration for bar charts
 */
export const barChartConfig = {
  options: {
    ...defaultChartOptions,
    elements: {
      bar: {
        borderWidth: 1,
        borderRadius: 4,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
      },
    },
  },
};

/**
 * Default configuration for gauge charts
 */
export const gaugeChartConfig = {
  options: {
    ...defaultChartOptions,
    circumference: 180,
    rotation: -90,
    cutout: '75%',
    elements: {
      arc: {
        borderWidth: 0,
      },
    },
  },
};

/**
 * Base chart configuration with accessibility and theming
 */
const defaultChartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  animation: {
    duration: CHART_ANIMATION_DURATION,
    easing: 'easeInOutQuart',
  },
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        font: {
          family: CHART_FONT_FAMILY,
          size: chartTheme.fonts.sizes.label,
        },
        padding: 16,
        usePointStyle: true,
      },
    },
    tooltip: {
      enabled: true,
      mode: 'index',
      intersect: false,
      padding: 12,
      titleFont: {
        family: CHART_FONT_FAMILY,
        size: chartTheme.fonts.sizes.title,
      },
      bodyFont: {
        family: CHART_FONT_FAMILY,
        size: chartTheme.fonts.sizes.label,
      },
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: '#ffffff',
      bodyColor: '#ffffff',
      borderColor: 'rgba(0, 0, 0, 0.1)',
      borderWidth: 1,
      cornerRadius: 4,
      displayColors: true,
      // Accessibility features
      accessibility: {
        enabled: true,
        announceOnShow: chartTheme.accessibility.announceOnShow,
      },
    },
  },
  scales: {
    x: {
      grid: {
        color: chartTheme.colors.grid,
        drawBorder: false,
      },
      ticks: {
        font: {
          family: CHART_FONT_FAMILY,
          size: chartTheme.fonts.sizes.tick,
        },
        color: chartTheme.colors.text,
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: chartTheme.colors.grid,
        drawBorder: false,
      },
      ticks: {
        font: {
          family: CHART_FONT_FAMILY,
          size: chartTheme.fonts.sizes.tick,
        },
        color: chartTheme.colors.text,
      },
    },
  },
  interaction: {
    mode: 'nearest',
    intersect: false,
    axis: 'xy',
  },
  elements: {
    point: {
      hitRadius: 8,
      hoverRadius: 6,
    },
  },
};

export default {
  chartTheme,
  lineChartConfig,
  barChartConfig,
  gaugeChartConfig,
  getResponsiveConfig,
  handleChartError,
};