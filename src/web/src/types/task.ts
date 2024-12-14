/**
 * @fileoverview TypeScript type definitions and interfaces for web scraping tasks.
 * Provides comprehensive type safety for task configuration, scheduling, and execution.
 * @version 1.0.0
 */

import { ID, TaskStatus, DateRange } from './common';
import { ApiResponse, PaginatedResponse } from './api';

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'medium' | 'high';

/**
 * Task scheduling frequencies
 */
export type TaskFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Sort direction for task listings
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Interface for task scheduling configuration
 */
export interface TaskSchedule {
  frequency: TaskFrequency;
  startDate: string;
  endDate: string | null;
  timeZone: string;
}

/**
 * Interface for data extraction rules
 */
export interface ExtractorRule {
  fieldName: string;
  selector: string;
  type: 'text' | 'number' | 'date' | 'url';
  required: boolean;
  validation: RegExp | null;
  transform: ((value: string) => any) | null;
}

/**
 * Interface for task configuration
 */
export interface TaskConfiguration {
  url: string;
  schedule: TaskSchedule;
  extractors: ExtractorRule[];
  priority: TaskPriority;
  useProxy: boolean;
  followPagination: boolean;
  maxPages: number;
  timeout: number;
  retryAttempts: number;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  javascript: boolean;
  authentication: {
    required: boolean;
    type?: 'basic' | 'oauth' | 'custom';
    credentials?: Record<string, string>;
  };
}

/**
 * Interface for task filtering options
 */
export interface TaskFilter {
  status: TaskStatus | null;
  priority: TaskPriority | null;
  dateRange: DateRange | null;
  search: string | null;
  sortBy: keyof Task;
  sortDirection: SortDirection;
  tags: string[];
  createdBy: ID | null;
  lastRunStatus: TaskStatus | null;
}

/**
 * Interface for task performance metrics
 */
export interface TaskMetrics {
  pagesProcessed: number;
  errorCount: number;
  duration: number;
  lastRunTime: string | null;
  successRate: number;
  avgProcessingTime: number;
  resourceUsage: {
    cpu: number;
    memory: number;
  };
  responseTime: {
    min: number;
    max: number;
    avg: number;
  };
  dataQuality: {
    validRecords: number;
    invalidRecords: number;
  };
}

/**
 * Interface for task validation errors
 */
export interface TaskValidationError {
  field: keyof TaskConfiguration;
  message: string;
  code: string;
  severity: 'error' | 'warning';
  suggestions: string[];
}

/**
 * Core task interface with enhanced metrics and validation
 */
export interface Task {
  id: ID;
  name: string;
  description?: string;
  configuration: TaskConfiguration;
  status: TaskStatus;
  metrics: TaskMetrics;
  validationErrors: TaskValidationError[];
  createdAt: string;
  updatedAt: string;
  createdBy: ID;
  tags: string[];
  version: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

/**
 * Type guard to validate Task interface
 * @param value - Value to check
 * @returns Boolean indicating if value is Task
 */
export function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const task = value as Partial<Task>;
  return (
    typeof task.id === 'string' &&
    typeof task.name === 'string' &&
    typeof task.configuration === 'object' &&
    typeof task.status === 'string' &&
    typeof task.metrics === 'object' &&
    Array.isArray(task.validationErrors)
  );
}

/**
 * Type guard for TaskConfiguration validation
 * @param value - Value to check
 * @returns Boolean indicating if value is valid TaskConfiguration
 */
export function isValidTaskConfiguration(value: unknown): value is TaskConfiguration {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const config = value as Partial<TaskConfiguration>;
  return (
    typeof config.url === 'string' &&
    typeof config.schedule === 'object' &&
    Array.isArray(config.extractors) &&
    typeof config.priority === 'string' &&
    typeof config.useProxy === 'boolean' &&
    typeof config.followPagination === 'boolean' &&
    typeof config.maxPages === 'number' &&
    typeof config.timeout === 'number' &&
    typeof config.retryAttempts === 'number'
  );
}

/**
 * Type for task creation request
 */
export type CreateTaskRequest = Omit<Task, 'id' | 'status' | 'metrics' | 'validationErrors' | 'createdAt' | 'updatedAt' | 'version' | 'lastRunAt' | 'nextRunAt'>;

/**
 * Type for task update request
 */
export type UpdateTaskRequest = Partial<CreateTaskRequest>;

/**
 * Type for task list response
 */
export type TaskListResponse = PaginatedResponse<Task>;

/**
 * Type for single task response
 */
export type TaskResponse = ApiResponse<Task>;