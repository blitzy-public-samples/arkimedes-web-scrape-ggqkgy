/**
 * @fileoverview Comprehensive test suite for the core API service module
 * Validates RESTful operations, request/response handling, authentication,
 * rate limiting, circuit breaking, monitoring integration, and error management
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'; // ^29.7.0
import axios from 'axios'; // ^1.5.0
import MockAdapter from 'axios-mock-adapter'; // ^1.22.0
import { Registry, Counter, Histogram } from 'prom-client'; // ^14.2.0

import { apiService } from '../../src/services/api';
import { API_CONFIG } from '../../src/config/api';
import { getStoredToken } from '../../src/utils/auth';
import { ApiError, ApiResponse } from '../../src/types/api';

// Test constants
const TEST_TIMEOUT = 5000;
const MOCK_BASE_URL = 'http://localhost:8000';
const RATE_LIMIT_WINDOW = 60000;
const ERROR_THRESHOLD = 0.5;
const CIRCUIT_RESET_TIMEOUT = 30000;

// Mock implementations
jest.mock('../../src/utils/auth');
const mockGetStoredToken = getStoredToken as jest.MockedFunction<typeof getStoredToken>;

describe('ApiService', () => {
    let mockAxios: MockAdapter;
    let mockMetricsRegistry: Registry;

    beforeEach(() => {
        // Initialize mock axios adapter
        mockAxios = new MockAdapter(axios);
        
        // Reset API service state
        mockAxios.reset();
        
        // Initialize mock metrics registry
        mockMetricsRegistry = new Registry();
        
        // Mock auth token
        mockGetStoredToken.mockReturnValue({
            accessToken: 'mock-token',
            refreshToken: 'mock-refresh-token',
            tokenType: 'Bearer',
            expiresIn: 3600,
            scope: 'all'
        });
    });

    afterEach(() => {
        mockAxios.restore();
        mockMetricsRegistry.clear();
        jest.clearAllMocks();
    });

    describe('Basic HTTP Operations', () => {
        test('should perform GET request successfully', async () => {
            const mockData = { id: 1, name: 'Test' };
            mockAxios.onGet(`${MOCK_BASE_URL}/test`).reply(200, mockData);

            const response = await apiService.get<typeof mockData>('/test');
            expect(response).toEqual(mockData);
        });

        test('should perform POST request with data', async () => {
            const mockRequest = { name: 'Test' };
            const mockResponse = { id: 1, ...mockRequest };
            mockAxios.onPost(`${MOCK_BASE_URL}/test`, mockRequest).reply(201, mockResponse);

            const response = await apiService.post<typeof mockResponse>('/test', mockRequest);
            expect(response).toEqual(mockResponse);
        });

        test('should handle request errors appropriately', async () => {
            mockAxios.onGet(`${MOCK_BASE_URL}/error`).reply(500, {
                message: 'Internal Server Error'
            });

            await expect(apiService.get('/error')).rejects.toThrow();
        });
    });

    describe('Authentication Integration', () => {
        test('should include authentication token in requests', async () => {
            mockAxios.onGet(`${MOCK_BASE_URL}/auth-test`).reply(config => {
                expect(config.headers?.Authorization).toBe('Bearer mock-token');
                return [200, { authenticated: true }];
            });

            await apiService.get('/auth-test');
        });

        test('should handle unauthorized responses', async () => {
            mockAxios.onGet(`${MOCK_BASE_URL}/unauthorized`).reply(401, {
                message: 'Unauthorized'
            });

            await expect(apiService.get('/unauthorized')).rejects.toMatchObject({
                code: 'SERVER_ERROR_401'
            });
        });
    });

    describe('Rate Limiting', () => {
        test('should handle rate limiting correctly', async () => {
            const rateLimitHeaders = {
                'X-RateLimit-Limit': '1000',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Date.now() + 60000)
            };

            mockAxios.onGet(`${MOCK_BASE_URL}/rate-limited`).reply(429, {
                message: 'Too Many Requests'
            }, rateLimitHeaders);

            await expect(apiService.get('/rate-limited')).rejects.toMatchObject({
                code: 'SERVER_ERROR_429'
            });
        });

        test('should track rate limit metrics', async () => {
            const endpoint = '/metrics-test';
            mockAxios.onGet(`${MOCK_BASE_URL}${endpoint}`).reply(429);

            try {
                await apiService.get(endpoint);
            } catch (error) {
                const metrics = await apiService.getMetrics().getMetricsAsJSON();
                const rateLimitMetric = metrics.find(m => m.name === 'rate_limit_hits_total');
                expect(rateLimitMetric).toBeDefined();
            }
        });
    });

    describe('Circuit Breaker', () => {
        test('should open circuit after error threshold', async () => {
            const endpoint = '/circuit-test';
            mockAxios.onGet(`${MOCK_BASE_URL}${endpoint}`).reply(500);

            // Generate errors to trigger circuit breaker
            const requests = Array(20).fill(null).map(() => apiService.get(endpoint));
            await Promise.allSettled(requests);

            // Verify circuit is open
            await expect(apiService.get(endpoint)).rejects.toThrow('Circuit breaker is open');
        });

        test('should transition to half-open state after timeout', async () => {
            jest.useFakeTimers();
            const endpoint = '/circuit-timeout';
            
            // Setup initial failed state
            mockAxios.onGet(`${MOCK_BASE_URL}${endpoint}`).reply(500);
            await expect(apiService.get(endpoint)).rejects.toThrow();

            // Advance timers and test recovery
            jest.advanceTimersByTime(CIRCUIT_RESET_TIMEOUT);
            mockAxios.onGet(`${MOCK_BASE_URL}${endpoint}`).reply(200, { recovered: true });
            
            const response = await apiService.get(endpoint);
            expect(response).toEqual({ recovered: true });
            
            jest.useRealTimers();
        });
    });

    describe('Monitoring Integration', () => {
        test('should collect request duration metrics', async () => {
            const endpoint = '/metrics-duration';
            mockAxios.onGet(`${MOCK_BASE_URL}${endpoint}`).reply(200, { success: true });

            await apiService.get(endpoint);

            const metrics = await apiService.getMetrics().getMetricsAsJSON();
            const durationMetric = metrics.find(m => m.name === 'api_response_time_seconds');
            expect(durationMetric).toBeDefined();
        });

        test('should track error metrics', async () => {
            const endpoint = '/metrics-error';
            mockAxios.onGet(`${MOCK_BASE_URL}${endpoint}`).reply(500);

            try {
                await apiService.get(endpoint);
            } catch (error) {
                const metrics = await apiService.getMetrics().getMetricsAsJSON();
                const errorMetric = metrics.find(m => m.name === 'api_errors_total');
                expect(errorMetric).toBeDefined();
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle network errors', async () => {
            mockAxios.onGet(`${MOCK_BASE_URL}/network-error`).networkError();

            await expect(apiService.get('/network-error')).rejects.toMatchObject({
                code: 'NETWORK_ERROR'
            });
        });

        test('should handle timeout errors', async () => {
            mockAxios.onGet(`${MOCK_BASE_URL}/timeout`).timeout();

            await expect(apiService.get('/timeout')).rejects.toMatchObject({
                code: 'NETWORK_ERROR'
            });
        });

        test('should include detailed error information', async () => {
            const errorResponse = {
                message: 'Validation Error',
                details: { field: 'name', error: 'Required' }
            };

            mockAxios.onPost(`${MOCK_BASE_URL}/validation`).reply(400, errorResponse);

            try {
                await apiService.post('/validation', {});
            } catch (error) {
                const apiError = error as ApiError;
                expect(apiError.code).toBe('SERVER_ERROR_400');
                expect(apiError.details).toEqual(errorResponse);
            }
        });
    });
});