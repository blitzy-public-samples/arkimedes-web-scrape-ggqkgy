/**
 * @fileoverview Core API service module implementing RESTful API communication with enhanced features
 * including circuit breaking, rate limiting, monitoring integration, and standardized error handling.
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'; // ^1.5.0
import { CommandFactory } from 'hystrix-js'; // ^0.4.0
import { Counter, Histogram, Registry } from 'prom-client'; // ^14.2.0

import { API_CONFIG } from '../config/api';
import { ApiResponse, ApiError, RequestConfig } from '../types/api';
import { getStoredToken } from '../utils/auth';

/**
 * Interface for enhanced API service metrics
 */
interface ApiMetrics {
  requestCounter: Counter<string>;
  responseTimeHistogram: Histogram<string>;
  errorCounter: Counter<string>;
  circuitBreakerCounter: Counter<string>;
  rateLimitCounter: Counter<string>;
}

/**
 * Enhanced API service class implementing enterprise features
 */
class ApiService {
  private readonly apiInstance: AxiosInstance;
  private readonly circuitBreaker: any; // hystrix-js types not available
  private readonly metrics: ApiMetrics;
  private readonly registry: Registry;

  constructor() {
    // Initialize Axios instance with enhanced configuration
    this.apiInstance = this.createApiInstance();
    
    // Initialize Prometheus registry
    this.registry = new Registry();
    
    // Initialize metrics collectors
    this.metrics = this.initializeMetrics();
    
    // Initialize circuit breaker
    this.circuitBreaker = this.initializeCircuitBreaker();
    
    // Configure interceptors
    this.configureInterceptors();
  }

  /**
   * Creates and configures an axios instance with enhanced features
   */
  private createApiInstance(): AxiosInstance {
    const instance = axios.create({
      baseURL: API_CONFIG.baseURL,
      timeout: API_CONFIG.timeout,
      headers: API_CONFIG.headers,
      validateStatus: API_CONFIG.validateStatus
    });

    return instance;
  }

  /**
   * Initializes Prometheus metrics collectors
   */
  private initializeMetrics(): ApiMetrics {
    const metrics = {
      requestCounter: new Counter({
        name: 'api_requests_total',
        help: 'Total number of API requests',
        labelNames: ['method', 'endpoint', 'status']
      }),
      responseTimeHistogram: new Histogram({
        name: 'api_response_time_seconds',
        help: 'API response time in seconds',
        labelNames: ['method', 'endpoint']
      }),
      errorCounter: new Counter({
        name: 'api_errors_total',
        help: 'Total number of API errors',
        labelNames: ['method', 'endpoint', 'error_type']
      }),
      circuitBreakerCounter: new Counter({
        name: 'circuit_breaker_trips_total',
        help: 'Total number of circuit breaker trips',
        labelNames: ['endpoint']
      }),
      rateLimitCounter: new Counter({
        name: 'rate_limit_hits_total',
        help: 'Total number of rate limit hits',
        labelNames: ['endpoint']
      })
    };

    // Register metrics
    Object.values(metrics).forEach(metric => this.registry.registerMetric(metric));

    return metrics;
  }

  /**
   * Initializes Hystrix circuit breaker
   */
  private initializeCircuitBreaker() {
    return CommandFactory.getOrCreate('ApiService')
      .circuitBreakerErrorThresholdPercentage(50)
      .circuitBreakerRequestVolumeThreshold(20)
      .circuitBreakerSleepWindowInMilliseconds(5000)
      .run(this.executeRequest.bind(this))
      .build();
  }

  /**
   * Configures request and response interceptors
   */
  private configureInterceptors(): void {
    // Request interceptor
    this.apiInstance.interceptors.request.use(
      async (config) => {
        const startTime = Date.now();
        config.metadata = { startTime };

        // Add authentication token
        const token = getStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token.accessToken}`;
        }

        return config;
      },
      (error) => Promise.reject(this.handleApiError(error))
    );

    // Response interceptor
    this.apiInstance.interceptors.response.use(
      (response) => {
        this.recordMetrics(response);
        return response;
      },
      (error) => Promise.reject(this.handleApiError(error))
    );
  }

  /**
   * Records API metrics for monitoring
   */
  private recordMetrics(response: any): void {
    const { config, status } = response;
    const { method, url, metadata } = config;
    const duration = (Date.now() - metadata.startTime) / 1000;

    this.metrics.requestCounter.inc({ method, endpoint: url, status });
    this.metrics.responseTimeHistogram.observe({ method, endpoint: url }, duration);
  }

  /**
   * Enhanced error handling with detailed categorization
   */
  private handleApiError(error: AxiosError): ApiError {
    const errorDetails: ApiError = {
      code: 'API_ERROR',
      message: 'An unexpected error occurred',
      details: {},
      timestamp: new Date().toISOString()
    };

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with error
        errorDetails.code = `SERVER_ERROR_${error.response.status}`;
        errorDetails.message = error.response.data?.message || error.message;
        errorDetails.details = error.response.data;

        // Record specific error metrics
        this.metrics.errorCounter.inc({
          method: error.config?.method,
          endpoint: error.config?.url,
          error_type: 'server_error'
        });

        // Handle rate limiting
        if (error.response.status === 429) {
          this.metrics.rateLimitCounter.inc({ endpoint: error.config?.url });
        }
      } else if (error.request) {
        // Request made but no response
        errorDetails.code = 'NETWORK_ERROR';
        errorDetails.message = 'Network error occurred';
        errorDetails.details = { request: error.request };

        this.metrics.errorCounter.inc({
          method: error.config?.method,
          endpoint: error.config?.url,
          error_type: 'network_error'
        });
      }
    }

    return errorDetails;
  }

  /**
   * Executes API request with circuit breaker and monitoring
   */
  private async executeRequest<T>(
    config: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.apiInstance.request(config);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  /**
   * Public API methods with enhanced features
   */
  public async get<T>(
    url: string,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.circuitBreaker.execute({ ...config, method: 'GET', url });
  }

  public async post<T>(
    url: string,
    data?: any,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.circuitBreaker.execute({ ...config, method: 'POST', url, data });
  }

  public async put<T>(
    url: string,
    data?: any,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.circuitBreaker.execute({ ...config, method: 'PUT', url, data });
  }

  public async delete<T>(
    url: string,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.circuitBreaker.execute({ ...config, method: 'DELETE', url });
  }

  /**
   * Returns metrics registry for monitoring integration
   */
  public getMetrics(): Registry {
    return this.registry;
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Export type definitions
export type { ApiMetrics };