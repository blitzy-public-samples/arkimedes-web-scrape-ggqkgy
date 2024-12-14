/**
 * @fileoverview Utility functions for API request handling, error management, response transformation,
 * and monitoring in the web scraping platform frontend.
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.6.0
import { API_CONFIG } from '../config/api';
import { ApiResponse, ApiError } from '../types/api';

/**
 * Error codes for API responses
 */
export enum ApiErrorCode {
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  RATE_LIMITED = 429,
  SERVER_ERROR = 500
}

/**
 * Configuration interface for retry behavior
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatuses: number[];
  enableMonitoring: boolean;
}

/**
 * Type definition for query parameters
 */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  enableMonitoring: true
};

/**
 * Standard error messages
 */
const ERROR_MESSAGES = {
  RATE_LIMITED: 'Rate limit exceeded. Please try again later.',
  NETWORK_ERROR: 'Network error occurred. Please check your connection.',
  TIMEOUT: 'Request timed out. Please try again.',
  SERVER_ERROR: 'Server error occurred. Please try again later.'
};

/**
 * Formats raw API responses into standardized ApiResponse format
 * @param response Raw API response
 * @returns Formatted API response with metadata
 */
export function formatApiResponse<T>(response: any): ApiResponse<T> {
  const timestamp = new Date().toISOString();
  
  return {
    status: 'success',
    data: response.data,
    meta: {
      timestamp,
      version: API_CONFIG.version,
      pagination: response.pagination || null,
      requestId: response.headers?.['x-request-id'] || crypto.randomUUID()
    }
  };
}

/**
 * Formats API errors into standardized ApiError format
 * @param error Raw error object
 * @returns Formatted error response
 */
export function formatApiError(error: any): ApiError {
  const timestamp = new Date().toISOString();
  let errorResponse: ApiError;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status || ApiErrorCode.SERVER_ERROR;
    const message = error.response?.data?.message || ERROR_MESSAGES.SERVER_ERROR;
    
    errorResponse = {
      code: status.toString(),
      message,
      details: {
        url: error.config?.url,
        method: error.config?.method,
        status
      },
      timestamp
    };

    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
    }

    // Log error metrics if monitoring is enabled
    if (API_CONFIG.retryConfig.enableMonitoring) {
      console.error('[API Error]', {
        code: errorResponse.code,
        message: errorResponse.message,
        timestamp
      });
    }
  } else {
    errorResponse = {
      code: ApiErrorCode.SERVER_ERROR.toString(),
      message: ERROR_MESSAGES.SERVER_ERROR,
      details: { error },
      timestamp
    };
  }

  return errorResponse;
}

/**
 * Builds URL query parameters from object
 * @param params Query parameters object
 * @returns Formatted query string
 */
export function buildQueryParams(params: QueryParams): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      searchParams.append(key, value.toString());
    }
  });
  
  return searchParams.toString();
}

/**
 * Executes API requests with retry logic and monitoring
 * @param requestFn Function that returns a promise with the API request
 * @param config Optional retry configuration
 * @returns Promise resolving to the API response
 */
export async function executeWithRetry<T>(
  requestFn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let attempt = 0;
  let lastError: any;

  while (attempt < retryConfig.maxRetries) {
    try {
      const response = await Promise.race([
        requestFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(ERROR_MESSAGES.TIMEOUT)), API_CONFIG.timeout)
        )
      ]);

      return response;
    } catch (error: any) {
      lastError = error;
      const status = axios.isAxiosError(error) ? error.response?.status : null;

      // Check if error is retryable
      if (!status || !retryConfig.retryableStatuses.includes(status)) {
        throw formatApiError(error);
      }

      attempt++;

      // Calculate exponential backoff delay
      const delay = Math.min(
        retryConfig.baseDelay * Math.pow(2, attempt - 1),
        retryConfig.maxDelay
      );

      // Log retry attempt if monitoring is enabled
      if (retryConfig.enableMonitoring) {
        console.warn('[API Retry]', {
          attempt,
          delay,
          status,
          timestamp: new Date().toISOString()
        });
      }

      // Handle rate limiting specifically
      if (status === ApiErrorCode.RATE_LIMITED) {
        const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '0') * 1000;
        await new Promise(resolve => setTimeout(resolve, retryAfter || delay));
      } else {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If all retries failed, throw the last error
  throw formatApiError(lastError);
}