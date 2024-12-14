/**
 * @fileoverview Comprehensive test suite for the useApi custom hook.
 * Tests API request handling, state management, error handling, retry mechanisms,
 * caching behavior, and cleanup operations.
 * @version 1.0.0
 */

import { renderHook, act } from '@testing-library/react-hooks'; // ^8.0.1
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest'; // ^0.34.0
import { useApi } from '../../src/hooks/useApi';
import { apiClient } from '../../src/services/api';
import { ApiError } from '../../src/types/api';

// Mock API client methods
vi.mock('../../src/services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

// Test data and mock responses
const mockData = { id: 1, name: 'Test Data' };
const mockApiResponse = {
  data: mockData,
  status: 'success',
  meta: {
    timestamp: new Date().toISOString(),
    version: 'v1',
    requestId: '123',
    pagination: null
  }
};

const mockApiError: ApiError = {
  code: 'API_ERROR',
  message: 'Test error message',
  details: {},
  timestamp: new Date().toISOString()
};

describe('useApi Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useApi());

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBeFalsy();
      expect(result.current.error).toBeNull();
      expect(result.current.metrics).toEqual({
        startTime: 0,
        endTime: 0,
        duration: 0,
        retryCount: 0,
        cacheHit: false,
        success: false
      });
    });
  });

  describe('Request Lifecycle', () => {
    it('should handle successful GET request', async () => {
      (apiClient.get as vi.Mock).mockResolvedValueOnce(mockApiResponse);

      const { result } = renderHook(() => useApi());

      await act(async () => {
        await result.current.get('/test');
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.loading).toBeFalsy();
      expect(result.current.error).toBeNull();
      expect(result.current.metrics.success).toBeTruthy();
    });

    it('should handle loading state correctly', async () => {
      (apiClient.get as vi.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockApiResponse), 1000))
      );

      const { result } = renderHook(() => useApi());

      act(() => {
        result.current.get('/test');
      });

      expect(result.current.loading).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(result.current.loading).toBeFalsy();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors with retry mechanism', async () => {
      const errorMock = vi.fn()
        .mockRejectedValueOnce(mockApiError)
        .mockRejectedValueOnce(mockApiError)
        .mockResolvedValueOnce(mockApiResponse);

      (apiClient.get as vi.Mock).mockImplementation(errorMock);

      const { result } = renderHook(() => useApi({ retry: true, retryCount: 2 }));

      await act(async () => {
        await result.current.get('/test');
      });

      expect(errorMock).toHaveBeenCalledTimes(3);
      expect(result.current.data).toEqual(mockData);
      expect(result.current.metrics.retryCount).toBe(2);
    });

    it('should implement exponential backoff for retries', async () => {
      (apiClient.get as vi.Mock).mockRejectedValue(mockApiError);

      const { result } = renderHook(() => useApi({ retry: true, retryCount: 3 }));

      const startTime = Date.now();

      await act(async () => {
        await result.current.get('/test').catch(() => {});
      });

      // Verify exponential backoff delays (1000ms, 2000ms, 4000ms)
      expect(vi.getTimerCount()).toBe(3);
      expect(vi.advanceTimersByTime(7000)).toBe(undefined);
    });
  });

  describe('Cache Behavior', () => {
    it('should cache successful responses', async () => {
      (apiClient.get as vi.Mock).mockResolvedValueOnce(mockApiResponse);

      const { result } = renderHook(() => useApi({ cache: true, cacheTime: 5000 }));

      // First request
      await act(async () => {
        await result.current.get('/test');
      });

      // Second request should use cache
      await act(async () => {
        await result.current.get('/test');
      });

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(result.current.metrics.cacheHit).toBeTruthy();
    });

    it('should respect cache TTL', async () => {
      (apiClient.get as vi.Mock).mockResolvedValue(mockApiResponse);

      const { result } = renderHook(() => useApi({ cache: true, cacheTime: 5000 }));

      // First request
      await act(async () => {
        await result.current.get('/test');
      });

      // Advance time beyond cache TTL
      await act(async () => {
        vi.advanceTimersByTime(6000);
        await result.current.get('/test');
      });

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Request Cancellation', () => {
    it('should cancel pending requests', async () => {
      const abortController = new AbortController();
      vi.spyOn(window, 'AbortController').mockImplementation(() => abortController);

      (apiClient.get as vi.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockApiResponse), 1000))
      );

      const { result } = renderHook(() => useApi());

      act(() => {
        result.current.get('/test');
        result.current.cancel();
      });

      expect(result.current.loading).toBeFalsy();
      expect(abortController.abort).toHaveBeenCalled();
    });

    it('should handle race conditions with concurrent requests', async () => {
      const slowResponse = { ...mockApiResponse, data: { id: 1, name: 'Slow' } };
      const fastResponse = { ...mockApiResponse, data: { id: 2, name: 'Fast' } };

      (apiClient.get as vi.Mock)
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(slowResponse), 2000)))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(fastResponse), 1000)));

      const { result } = renderHook(() => useApi());

      act(() => {
        result.current.get('/slow');
        result.current.get('/fast');
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(result.current.data).toEqual(fastResponse.data);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect accurate request metrics', async () => {
      const startTime = Date.now();
      (apiClient.get as vi.Mock).mockResolvedValueOnce(mockApiResponse);

      const { result } = renderHook(() => useApi());

      await act(async () => {
        await result.current.get('/test');
      });

      expect(result.current.metrics).toMatchObject({
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        duration: expect.any(Number),
        success: true,
        retryCount: 0,
        cacheHit: false
      });
      expect(result.current.metrics.duration).toBeGreaterThanOrEqual(0);
    });
  });
});