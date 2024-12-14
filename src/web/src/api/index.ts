/**
 * @fileoverview Central API module that exports all API client functions for the web scraping platform frontend.
 * Implements REST/HTTP/2 standards with OpenAPI 3.0 specification compliance.
 * @version 1.0.0
 */

// Import authentication functions
import {
  login,
  logout,
  refreshToken,
  setupMFA,
  verifyMFA
} from './auth';

// Import data operation functions
import {
  fetchData,
  getDataById,
  exportData
} from './data';

// Import task management functions
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  startTask,
  stopTask,
  getTaskStatus
} from './tasks';

// Import metrics collection functions
import {
  getSystemMetrics,
  getTaskMetrics,
  getScrapingMetrics,
  MetricTypes,
  type SystemMetrics,
  type TaskMetrics,
  type ScrapingMetrics,
  type MetricOptions
} from './metrics';

/**
 * Authentication API namespace
 * Provides comprehensive authentication and MFA functionality
 */
export const auth = {
  login,
  logout,
  refreshToken,
  setupMFA,
  verifyMFA
} as const;

/**
 * Data operations API namespace
 * Handles data retrieval, filtering, and export operations
 */
export const data = {
  fetchData,
  getDataById,
  exportData
} as const;

/**
 * Task management API namespace
 * Manages scraping task lifecycle and configuration
 */
export const tasks = {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  startTask,
  stopTask,
  getTaskStatus
} as const;

/**
 * Metrics collection API namespace
 * Provides system, task, and scraping performance metrics
 */
export const metrics = {
  getSystemMetrics,
  getTaskMetrics,
  getScrapingMetrics,
  MetricTypes
} as const;

// Export type definitions for enhanced type safety
export type {
  // Auth types
  User,
  LoginCredentials,
  AuthToken,
  MFASetupResponse,
  CustomJwtPayload
} from '../types/auth';

// Data types
export type {
  ScrapedData,
  DataFilter,
  DataResponse,
  ExportOptions,
  DataStatus,
  ValidationResult
} from '../types/data';

// Task types
export type {
  Task,
  TaskConfiguration,
  TaskFilter,
  TaskSchedule,
  TaskPriority,
  TaskMetrics as TaskPerformanceMetrics,
  TaskValidationError
} from '../types/task';

// Metrics types
export type {
  SystemMetrics,
  TaskMetrics,
  ScrapingMetrics,
  MetricOptions
};

// API common types
export type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  RequestConfig
} from '../types/api';

/**
 * Version information for the API module
 */
export const VERSION = {
  api: 'v1',
  lastUpdated: '2024-01-20',
  deprecationPolicy: 'Minimum 6 months notice for breaking changes'
} as const;

/**
 * API module configuration and constants
 */
export { API_CONFIG, API_ENDPOINTS } from '../config/api';