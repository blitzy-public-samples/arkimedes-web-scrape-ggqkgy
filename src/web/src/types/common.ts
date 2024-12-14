/**
 * @fileoverview Core TypeScript type definitions, interfaces and enums shared across 
 * the web scraping platform frontend. Provides type safety and standardized data structures.
 * @version 1.0.0
 */

/**
 * Type alias for UUID strings used for consistent entity identification
 */
export type ID = string;

/**
 * Enum for tracking task execution status throughout the application
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

/**
 * Enum for managing data loading states in UI components
 */
export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED'
}

/**
 * Interface for handling date range selections in filters and reports
 */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Enum for application theme options supporting light, dark, and system preferences
 */
export enum Theme {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  SYSTEM = 'SYSTEM'
}

/**
 * Enum for defining sort directions in data tables and lists
 */
export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC'
}

/**
 * Union type for categorizing different types of errors across the application
 */
export type ErrorType = 'validation' | 'network' | 'auth' | 'server' | 'unknown';

/**
 * Generic type for handling nullable values with type safety
 */
export type Nullable<T> = T | null;

/**
 * Generic type for handling optional values with type safety
 */
export type Optional<T> = T | undefined;

/**
 * Base interface for standardized error handling across the application
 */
export interface BaseError {
  /** Category of the error */
  type: ErrorType;
  /** Human-readable error message */
  message: string;
  /** Unique error code for tracking and documentation */
  code: string;
  /** Additional error context and metadata */
  details: Record<string, any>;
}

/**
 * Interface for defining component dimensions in the UI
 */
export interface Dimensions {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Interface for defining positioning coordinates
 */
export interface Position {
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
}

/**
 * Global constants for pagination, date and time formatting
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const DATE_FORMAT = 'YYYY-MM-DD';
export const TIME_FORMAT = 'HH:mm:ss';