/**
 * @fileoverview Advanced React hook for making API requests with comprehensive state management,
 * error handling, monitoring, metrics collection, caching, and automatic retries.
 * @version 1.0.0
 */

import { useState, useCallback, useRef } from 'react'; // ^18.2.0
import { get, post, put, delete as deleteRequest } from '../services/api';
import { ApiResponse, ApiError } from '../types/api';

/**
 * Default options for API requests
 */
const DEFAULT_OPTIONS = {
  retry: true,
  retryCount: 3,
  retryDelay: 1000,
  timeout: 30000,
  cache: true,
  cacheTime: 300000 // 5 minutes
} as const;

/**
 * Interface for request metrics tracking
 */
interface RequestMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  retryCount: number;
  cacheHit: boolean;
  success: boolean;
}

/**
 * Interface for cache entry with metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Interface for hook configuration options
 */
export interface UseApiOptions {
  retry?: boolean;
  retryCount?: number;
  retryDelay?: number;
  timeout?: number;
  cache?: boolean;
  cacheTime?: number;
}

/**
 * Interface for hook return value
 */
export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  metrics: RequestMetrics;
  get: (url: string) => Promise<void>;
  post: (url: string, data?: any) => Promise<void>;
  put: (url: string, data?: any) => Promise<void>;
  delete: (url: string) => Promise<void>;
  cancel: () => void;
  clearCache: () => void;
}

/**
 * Enhanced custom hook for making API requests with comprehensive features
 * @template T - Type of the expected response data
 * @param options - Configuration options for the hook
 * @returns Object containing request state, methods, and metrics
 */
export function useApi<T>(options: UseApiOptions = {}): UseApiResult<T> {
  // Merge options with defaults
  const config = { ...DEFAULT_OPTIONS, ...options };

  // State management
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [metrics, setMetrics] = useState<RequestMetrics>({
    startTime: 0,
    endTime: 0,
    duration: 0,
    retryCount: 0,
    cacheHit: false,
    success: false
  });

  // Refs for request management
  const abortControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
  const activeRequestsRef = useRef<Map<string, Promise<ApiResponse<T>>>>(new Map());

  /**
   * Clears the request cache
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  /**
   * Cancels any ongoing request
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Checks cache for valid entry
   */
  const checkCache = useCallback((url: string): T | null => {
    const cached = cacheRef.current.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    return null;
  }, []);

  /**
   * Updates cache with new data
   */
  const updateCache = useCallback((url: string, data: T) => {
    if (config.cache) {
      cacheRef.current.set(url, {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + config.cacheTime
      });
    }
  }, [config.cache, config.cacheTime]);

  /**
   * Implements exponential backoff for retries
   */
  const getRetryDelay = useCallback((attempt: number): number => {
    return Math.min(1000 * Math.pow(2, attempt), 10000);
  }, []);

  /**
   * Core request execution logic with retries and monitoring
   */
  const executeRequest = useCallback(async (
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    data?: any
  ): Promise<void> => {
    let attempt = 0;
    const startTime = Date.now();
    
    setLoading(true);
    setError(null);
    
    // Setup abort controller
    abortControllerRef.current = new AbortController();

    try {
      // Check cache for GET requests
      if (method === 'get' && config.cache) {
        const cachedData = checkCache(url);
        if (cachedData) {
          setData(cachedData);
          setMetrics({
            startTime,
            endTime: Date.now(),
            duration: 0,
            retryCount: 0,
            cacheHit: true,
            success: true
          });
          setLoading(false);
          return;
        }
      }

      // Deduplicate concurrent requests
      const requestKey = `${method}:${url}`;
      if (activeRequestsRef.current.has(requestKey)) {
        const response = await activeRequestsRef.current.get(requestKey);
        if (response) {
          setData(response.data);
          return;
        }
      }

      while (true) {
        try {
          const requestPromise = (method === 'get' ? get<T>(url) :
            method === 'post' ? post<T>(url, data) :
            method === 'put' ? put<T>(url, data) :
            deleteRequest<T>(url));

          activeRequestsRef.current.set(requestKey, requestPromise);
          
          const response = await requestPromise;
          
          setData(response.data);
          updateCache(url, response.data);
          
          setMetrics({
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
            retryCount: attempt,
            cacheHit: false,
            success: true
          });
          
          break;
        } catch (err) {
          const apiError = err as ApiError;
          
          if (!config.retry || attempt >= config.retryCount || 
              apiError.code === 'UNAUTHORIZED' || apiError.code === 'FORBIDDEN') {
            throw err;
          }
          
          attempt++;
          await new Promise(resolve => 
            setTimeout(resolve, getRetryDelay(attempt))
          );
        }
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError);
      setMetrics({
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        retryCount: attempt,
        cacheHit: false,
        success: false
      });
    } finally {
      setLoading(false);
      activeRequestsRef.current.delete(`${method}:${url}`);
      abortControllerRef.current = null;
    }
  }, [config.retry, config.retryCount, checkCache, updateCache, getRetryDelay]);

  // Memoized request methods
  const get = useCallback((url: string) => 
    executeRequest('get', url), [executeRequest]);
    
  const post = useCallback((url: string, data?: any) => 
    executeRequest('post', url, data), [executeRequest]);
    
  const put = useCallback((url: string, data?: any) => 
    executeRequest('put', url, data), [executeRequest]);
    
  const deleteMethod = useCallback((url: string) => 
    executeRequest('delete', url), [executeRequest]);

  return {
    data,
    loading,
    error,
    metrics,
    get,
    post,
    put,
    delete: deleteMethod,
    cancel,
    clearCache
  };
}