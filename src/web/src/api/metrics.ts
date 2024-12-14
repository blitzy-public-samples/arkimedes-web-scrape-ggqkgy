/**
 * @fileoverview API client module for collecting and retrieving system, task, and scraping performance metrics
 * Implements comprehensive metrics collection with enhanced error handling, validation, and caching
 * @version 1.0.0
 */

import dayjs from 'dayjs'; // ^1.11.0
import { apiService } from '../services/api';
import { ApiResponse, PaginatedRequest } from '../types/api';
import { ID } from '../types/common';

/**
 * Enum for different types of metrics
 */
export enum MetricTypes {
  SYSTEM = 'system',
  TASK = 'task',
  SCRAPING = 'scraping'
}

/**
 * Interface for system performance metrics
 */
export interface SystemMetrics {
  cpu: {
    usage: number;
    load: number;
    cores: number;
    temperature: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    swap: number;
  };
  storage: {
    used: number;
    total: number;
    percentage: number;
    iops: number;
  };
  network: {
    bandwidth: number;
    latency: number;
    packets: number;
  };
  timestamp: string;
}

/**
 * Interface for task performance metrics
 */
export interface TaskMetrics {
  taskId: ID;
  executionTime: number;
  successRate: number;
  errorCount: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    network: number;
  };
  timestamp: string;
}

/**
 * Interface for scraping performance metrics
 */
export interface ScrapingMetrics {
  taskId: ID;
  pagesScraped: number;
  dataPoints: number;
  bytesProcessed: number;
  responseTime: number;
  proxyPerformance: {
    successRate: number;
    failureCount: number;
    avgLatency: number;
  };
  timestamp: string;
}

/**
 * Interface for metric query options
 */
export interface MetricOptions {
  startTime?: string;
  endTime?: string;
  interval?: string;
  aggregation?: 'avg' | 'max' | 'min' | 'sum';
  includeRawData?: boolean;
}

// Cache TTL constants
const METRIC_CACHE_TTL = 300; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const METRIC_BATCH_SIZE = 100;

/**
 * Decorator for request validation
 */
function validateRequest(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    const [params, options] = args;
    
    // Validate pagination parameters
    if (params && !isValidPaginationParams(params)) {
      throw new Error('Invalid pagination parameters');
    }

    // Validate metric options
    if (options && !isValidMetricOptions(options)) {
      throw new Error('Invalid metric options');
    }

    return originalMethod.apply(this, args);
  };
  return descriptor;
}

/**
 * Decorator for metric response caching
 */
function cacheMetrics(type: MetricTypes, ttl: number = METRIC_CACHE_TTL) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheKey = `metrics_${type}`;
    
    descriptor.value = async function(...args: any[]) {
      const cachedData = getCachedMetrics(cacheKey);
      if (cachedData && !isMetricsCacheExpired(cachedData.timestamp, ttl)) {
        return cachedData.data;
      }

      const result = await originalMethod.apply(this, args);
      cacheMetricsData(cacheKey, result);
      return result;
    };
    return descriptor;
  };
}

/**
 * Retrieves system-wide performance metrics
 * @param params - Pagination parameters
 * @param options - Metric query options
 * @returns Promise resolving to system metrics
 */
@validateRequest
@cacheMetrics(MetricTypes.SYSTEM)
export async function getSystemMetrics(
  params: PaginatedRequest,
  options?: MetricOptions
): Promise<ApiResponse<SystemMetrics>> {
  try {
    const response = await apiService.get<SystemMetrics>(
      '/api/v1/metrics/system',
      {
        params: {
          ...params,
          ...options,
          timestamp: dayjs().toISOString()
        }
      }
    );
    return response;
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    throw error;
  }
}

/**
 * Retrieves task performance metrics
 * @param taskId - Optional task ID to filter metrics
 * @param params - Pagination parameters
 * @param options - Metric query options
 * @returns Promise resolving to task metrics
 */
@validateRequest
@cacheMetrics(MetricTypes.TASK)
export async function getTaskMetrics(
  taskId?: ID,
  params?: PaginatedRequest,
  options?: MetricOptions
): Promise<ApiResponse<TaskMetrics[]>> {
  try {
    const response = await apiService.get<TaskMetrics[]>(
      taskId ? `/api/v1/metrics/tasks/${taskId}` : '/api/v1/metrics/tasks',
      {
        params: {
          ...params,
          ...options,
          timestamp: dayjs().toISOString()
        }
      }
    );
    return response;
  } catch (error) {
    console.error('Error fetching task metrics:', error);
    throw error;
  }
}

/**
 * Retrieves scraping performance metrics
 * @param taskId - Optional task ID to filter metrics
 * @param params - Pagination parameters
 * @param options - Metric query options
 * @returns Promise resolving to scraping metrics
 */
@validateRequest
@cacheMetrics(MetricTypes.SCRAPING)
export async function getScrapingMetrics(
  taskId?: ID,
  params?: PaginatedRequest,
  options?: MetricOptions
): Promise<ApiResponse<ScrapingMetrics[]>> {
  try {
    const response = await apiService.get<ScrapingMetrics[]>(
      taskId ? `/api/v1/metrics/scraping/${taskId}` : '/api/v1/metrics/scraping',
      {
        params: {
          ...params,
          ...options,
          timestamp: dayjs().toISOString()
        }
      }
    );
    return response;
  } catch (error) {
    console.error('Error fetching scraping metrics:', error);
    throw error;
  }
}

// Helper functions

function isValidPaginationParams(params: PaginatedRequest): boolean {
  return !!(
    params &&
    typeof params.page === 'number' &&
    typeof params.limit === 'number' &&
    params.page > 0 &&
    params.limit > 0 &&
    params.limit <= METRIC_BATCH_SIZE
  );
}

function isValidMetricOptions(options: MetricOptions): boolean {
  if (!options) return true;
  
  const validAggregations = ['avg', 'max', 'min', 'sum'];
  
  return !!(
    (!options.startTime || dayjs(options.startTime).isValid()) &&
    (!options.endTime || dayjs(options.endTime).isValid()) &&
    (!options.aggregation || validAggregations.includes(options.aggregation))
  );
}

function getCachedMetrics(key: string): { data: any; timestamp: string } | null {
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Error retrieving cached metrics:', error);
    return null;
  }
}

function cacheMetricsData(key: string, data: any): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        data,
        timestamp: dayjs().toISOString()
      })
    );
  } catch (error) {
    console.error('Error caching metrics data:', error);
  }
}

function isMetricsCacheExpired(timestamp: string, ttl: number): boolean {
  const cacheTime = dayjs(timestamp);
  const now = dayjs();
  return now.diff(cacheTime, 'second') > ttl;
}

export type { SystemMetrics, TaskMetrics, ScrapingMetrics, MetricOptions };