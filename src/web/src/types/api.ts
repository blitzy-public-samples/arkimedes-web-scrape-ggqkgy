/**
 * @fileoverview Core TypeScript type definitions and interfaces for API requests, responses,
 * and common data structures used across the web scraping platform frontend.
 * Implements REST/HTTP/2 standards with OpenAPI 3.0 specification compliance.
 * @version 1.0.0
 */

import { ID } from './common';

/**
 * HTTP methods supported by the API
 * @version 1.0.0
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH'
} as const;

/**
 * Current API version
 * @version 1.0.0
 */
export const API_VERSION = 'v1' as const;

/**
 * Type for HTTP methods
 */
export type HttpMethod = typeof HTTP_METHODS[keyof typeof HTTP_METHODS];

/**
 * Type for API version
 */
export type ApiVersion = typeof API_VERSION;

/**
 * Type for sort order in requests
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Type for API error codes with branded type for type safety
 */
export type ApiErrorCode = string & { readonly brand: unique symbol };

/**
 * Interface for standardized API response metadata
 */
export interface ResponseMetadata {
  timestamp: string;
  version: ApiVersion;
  pagination: Pagination | null;
  requestId: string;
}

/**
 * Interface for pagination information
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Generic interface for all API responses
 */
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T;
  meta: ResponseMetadata;
}

/**
 * Interface for enhanced error responses
 */
export interface ApiError {
  code: string;
  message: string;
  details: Record<string, any>;
  stack?: string;
  timestamp: string;
}

/**
 * Type for request headers with required API version
 */
export type RequestHeaders = Record<string, string> & {
  'x-api-version': ApiVersion;
};

/**
 * Interface for API request configuration
 */
export interface RequestConfig {
  headers: Record<string, string>;
  params: Record<string, any>;
  timeout: number;
  retryAttempts: number;
  validateStatus: (status: number) => boolean;
}

/**
 * Interface for paginated request parameters
 */
export interface PaginatedRequest {
  page: number;
  limit: number;
  sort: string | null;
  order: SortOrder | null;
  filter: Record<string, any> | null;
}

/**
 * Type for paginated response with generic data type
 */
export type PaginatedResponse<T> = ApiResponse<{
  items: T[];
  pagination: Pagination;
}>;

/**
 * Default request configuration
 */
export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  headers: {},
  params: {},
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  validateStatus: (status: number) => status >= 200 && status < 300
};

/**
 * Default pagination parameters
 */
export const DEFAULT_PAGINATION: Omit<PaginatedRequest, 'filter'> = {
  page: 1,
  limit: 25,
  sort: null,
  order: null
};

/**
 * Utility type for extracting data type from ApiResponse
 */
export type ExtractResponseData<T> = T extends ApiResponse<infer D> ? D : never;

/**
 * Utility type for creating a partial version of PaginatedRequest
 */
export type PartialPaginatedRequest = Partial<PaginatedRequest>;

/**
 * Type guard for checking if a response is an error
 */
export function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    'message' in response
  );
}