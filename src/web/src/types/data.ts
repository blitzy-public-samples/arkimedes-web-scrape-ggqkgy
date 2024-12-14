/**
 * @fileoverview TypeScript type definitions and interfaces for scraped data handling,
 * filtering, and API responses in the frontend application.
 * @version 1.0.0
 */

import { ID, DateRange, LoadingState } from './common';

/**
 * Union type representing possible data validation statuses
 */
export type DataStatus = 'pending' | 'valid' | 'invalid' | 'error';

/**
 * Union type for supported data export formats
 */
export type ExportFormat = 'json' | 'csv' | 'xml';

/**
 * Union type for sort direction options
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Type definition for individual field validation results
 */
export type ValidationResult = {
  field: string;
  status: 'valid' | 'invalid';
  message?: string;
};

/**
 * Interface for scraped data items with enhanced validation support
 */
export interface ScrapedData {
  /** Unique identifier for the data record */
  id: ID;
  /** Reference to the execution that produced this data */
  execution_id: ID;
  /** ISO timestamp when data was collected */
  collected_at: string;
  /** Schema/format version of the data */
  version: string;
  /** Current validation status */
  status: DataStatus;
  /** Original unprocessed data */
  raw_data: Record<string, unknown>;
  /** Processed and transformed data */
  transformed_data: Record<string, unknown>;
  /** Validation results for individual fields */
  validation_results: ValidationResult[];
  /** Additional metadata about the scraping process */
  metadata: Record<string, unknown>;
}

/**
 * Enhanced interface for data filtering options with sorting and pagination
 */
export interface DataFilter {
  /** Filter by validation status */
  status: DataStatus | null;
  /** Filter by specific execution */
  execution_id: ID | null;
  /** Filter by time range */
  timeRange: DateRange | null;
  /** Current page number (0-based) */
  page: number;
  /** Number of items per page */
  size: number;
  /** Field to sort by */
  sortField: string | null;
  /** Sort direction */
  sortDirection: SortDirection | null;
  /** Full-text search term */
  searchTerm: string | null;
  /** Additional metadata filters */
  metadata: Record<string, unknown>;
}

/**
 * Interface for paginated data API responses with metadata
 */
export interface DataResponse {
  /** Array of scraped data items */
  data: ScrapedData[];
  /** Total number of items matching the filter */
  total: number;
  /** Current page number */
  page: number;
  /** Items per page */
  size: number;
  /** Whether more pages are available */
  hasMore: boolean;
  /** Additional response metadata */
  metadata: Record<string, unknown>;
}

/**
 * Enhanced interface for data export configuration
 */
export interface ExportOptions {
  /** Export file format */
  format: ExportFormat;
  /** Filter criteria for data export */
  filter: DataFilter;
  /** Include raw data in export */
  includeRaw: boolean;
  /** Include transformed data in export */
  includeTransformed: boolean;
  /** Include validation results in export */
  includeValidation: boolean;
  /** Include metadata in export */
  includeMetadata: boolean;
  /** Specific fields to include in export */
  customFields: string[];
  /** Date format string for date fields */
  dateFormat: string;
}

/**
 * Constants for data handling configuration
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SORT_DIRECTION = 'asc' as const;
export const VALID_SORT_FIELDS = ['collected_at', 'status', 'version'] as const;