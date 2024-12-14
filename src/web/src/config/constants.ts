/**
 * @fileoverview Core application constants and configuration values for the web scraping platform frontend.
 * Defines UI components, data management, and system configuration parameters.
 * @version 1.0.0
 */

import { TaskStatus, Theme, LoadingState } from '../types/common';
import { TaskPriority, TaskFrequency } from '../types/task';

/**
 * Core application configuration
 */
export const APP_CONFIG = {
  appName: 'Web Scraping Platform',
  version: '1.0.0',
  apiVersion: 'v1',
} as const;

/**
 * UI-related constants including responsive breakpoints and theme settings
 */
export const UI_CONSTANTS = {
  breakpoints: {
    mobile: 320,
    tablet: 768,
    desktop: 1024,
    widescreen: 1440,
  },
  maxWidth: 1200,
  themeConfig: {
    colors: {
      primary: '#1976d2',
      secondary: '#dc004e',
      error: '#f44336',
      warning: '#ff9800',
      info: '#2196f3',
      success: '#4caf50',
    },
    accessibility: {
      minContrastRatio: 4.5,
      focusRingWidth: 2,
      animationDuration: 200,
    },
  },
} as const;

/**
 * Data handling constants including pagination and caching settings
 */
export const DATA_CONSTANTS = {
  pagination: {
    pageSize: 25,
    maxResults: 100,
  },
  cacheConfig: {
    duration: 3600000, // 1 hour in milliseconds
    maxEntries: 1000,
    strategy: 'LRU' as const,
  },
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HH:mm:ss',
} as const;

/**
 * Task-related constants
 */
export const TASK_CONSTANTS = {
  priorities: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  } as const,
  frequencies: {
    ONCE: 'once',
    HOURLY: 'hourly',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
  } as const,
  maxRetries: 3,
  apiTimeout: 30000, // 30 seconds
} as const;

/**
 * Type definitions for configuration interfaces
 */
export interface AppConfig {
  appName: string;
  version: string;
  apiVersion: string;
}

export interface UIConstants {
  breakpoints: Record<string, number>;
  maxWidth: number;
  themeConfig: ThemeConfig;
}

export interface CacheConfig {
  duration: number;
  maxEntries: number;
  strategy: 'LRU' | 'FIFO';
}

export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'widescreen';
export type ThemeConfig = Record<string, string | number>;

/**
 * System configuration constants
 */
export const SYSTEM_CONFIG = {
  api: {
    baseUrl: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000/api',
    timeout: TASK_CONSTANTS.apiTimeout,
    retryAttempts: TASK_CONSTANTS.maxRetries,
  },
  monitoring: {
    errorThreshold: 50, // Percentage
    performanceThreshold: 1000, // milliseconds
    metricsInterval: 60000, // 1 minute
  },
  features: {
    enableDarkMode: true,
    enableNotifications: true,
    enableOfflineMode: false,
  },
} as const;

/**
 * Validation constants
 */
export const VALIDATION_CONSTANTS = {
  taskName: {
    minLength: 3,
    maxLength: 100,
  },
  description: {
    maxLength: 500,
  },
  url: {
    maxLength: 2048,
  },
  fieldName: {
    maxLength: 50,
    pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/,
  },
} as const;

/**
 * Export all constants as a single object for convenience
 */
export const CONSTANTS = {
  APP: APP_CONFIG,
  UI: UI_CONSTANTS,
  DATA: DATA_CONSTANTS,
  TASK: TASK_CONSTANTS,
  SYSTEM: SYSTEM_CONFIG,
  VALIDATION: VALIDATION_CONSTANTS,
} as const;