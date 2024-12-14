/**
 * @fileoverview Core API configuration constants and settings for the web scraping platform frontend.
 * Implements REST/HTTP/2 standards with OpenAPI 3.0 specification compliance.
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.5.0
import { ApiVersion, RequestConfig } from '../types/api';

/**
 * Interface defining comprehensive API endpoint paths with methods
 */
interface ApiEndpoints {
  auth: Record<string, { path: string; method: string }>;
  tasks: Record<string, { path: string; method: string }>;
  data: Record<string, { path: string; method: string }>;
  metrics: Record<string, { path: string; method: string }>;
}

/**
 * Type definition for rate limiting configuration
 */
type RateLimitConfig = {
  maxRequests: number;
  perMinute: number;
  burstLimit: number;
  retryAfter: number;
};

/**
 * Type definition for retry configuration
 */
type RetryConfig = {
  retries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
};

/**
 * Base URL for API requests
 */
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Default request timeout in milliseconds
 */
const API_TIMEOUT = 30000;

/**
 * Default headers for API requests
 */
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'X-API-Version': 'v1'
} as const;

/**
 * Rate limiting configuration based on token bucket algorithm
 */
const RATE_LIMIT: RateLimitConfig = {
  maxRequests: 1000,
  perMinute: 60000,
  burstLimit: 50,
  retryAfter: 60000
};

/**
 * Retry configuration for failed requests
 */
const RETRY_CONFIG: RetryConfig = {
  retries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffFactor: 2
};

/**
 * Core API configuration object
 */
export const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: DEFAULT_HEADERS,
  version: 'v1' as ApiVersion,
  rateLimiting: RATE_LIMIT,
  retryConfig: RETRY_CONFIG,
  validateStatus: (status: number): boolean => status >= 200 && status < 300,
  errorHandler: (error: any) => {
    if (axios.isAxiosError(error)) {
      // Handle rate limiting
      if (error.response?.status === 429) {
        return new Error(`Rate limit exceeded. Retry after ${RATE_LIMIT.retryAfter}ms`);
      }
      return error;
    }
    return new Error('An unexpected error occurred');
  }
} as const;

/**
 * API endpoints configuration with versioning
 */
export const API_ENDPOINTS: ApiEndpoints = {
  auth: {
    login: { path: '/auth/login', method: 'POST' },
    logout: { path: '/auth/logout', method: 'POST' },
    refresh: { path: '/auth/refresh', method: 'POST' },
    verify: { path: '/auth/verify', method: 'GET' }
  },
  tasks: {
    list: { path: '/tasks', method: 'GET' },
    create: { path: '/tasks', method: 'POST' },
    get: { path: '/tasks/:id', method: 'GET' },
    update: { path: '/tasks/:id', method: 'PUT' },
    delete: { path: '/tasks/:id', method: 'DELETE' },
    start: { path: '/tasks/:id/start', method: 'POST' },
    stop: { path: '/tasks/:id/stop', method: 'POST' },
    status: { path: '/tasks/:id/status', method: 'GET' }
  },
  data: {
    list: { path: '/data', method: 'GET' },
    export: { path: '/data/export', method: 'POST' },
    get: { path: '/data/:id', method: 'GET' },
    delete: { path: '/data/:id', method: 'DELETE' },
    validate: { path: '/data/validate', method: 'POST' }
  },
  metrics: {
    summary: { path: '/metrics/summary', method: 'GET' },
    performance: { path: '/metrics/performance', method: 'GET' },
    errors: { path: '/metrics/errors', method: 'GET' },
    status: { path: '/metrics/status', method: 'GET' }
  }
} as const;

/**
 * Type for the API configuration
 */
export type ApiConfigType = typeof API_CONFIG;

/**
 * Create axios instance with default configuration
 */
export const apiInstance = axios.create({
  ...API_CONFIG,
  headers: DEFAULT_HEADERS
});

// Add response interceptor for rate limiting
apiInstance.interceptors.response.use(
  response => response,
  error => {
    return Promise.reject(API_CONFIG.errorHandler(error));
  }
);