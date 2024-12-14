/**
 * @fileoverview API client module for task management operations in the web scraping platform frontend.
 * Implements REST/HTTP/2 standards with OpenAPI 3.0 specification compliance.
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.4.0
import rateLimit from 'axios-rate-limit'; // ^1.3.0
import axiosRetry from 'axios-retry'; // ^3.5.0

import { Task, TaskConfiguration, TaskFilter } from '../types/task';
import { ApiResponse, PaginatedResponse, ApiError } from '../types/api';
import { API_CONFIG, API_ENDPOINTS, apiInstance } from '../config/api';

/**
 * Rate-limited axios instance for task operations
 */
const taskClient = rateLimit(apiInstance, { 
  maxRequests: API_CONFIG.rateLimiting.maxRequests,
  perMilliseconds: API_CONFIG.rateLimiting.perMinute
});

// Configure retry logic for failed requests
axiosRetry(taskClient, {
  retries: API_CONFIG.retryConfig.retries,
  retryDelay: (retryCount) => {
    return Math.min(
      API_CONFIG.retryConfig.initialDelayMs * Math.pow(API_CONFIG.retryConfig.backoffFactor, retryCount - 1),
      API_CONFIG.retryConfig.maxDelayMs
    );
  },
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           error.response?.status === 429; // Retry on rate limit
  }
});

/**
 * Constructs query parameters for task listing
 * @param filter - Task filter criteria
 * @param page - Page number
 * @param limit - Items per page
 */
const buildQueryParams = (filter: TaskFilter, page: number, limit: number) => {
  return {
    page,
    limit,
    status: filter.status || undefined,
    priority: filter.priority || undefined,
    startDate: filter.dateRange?.startDate,
    endDate: filter.dateRange?.endDate,
    search: filter.search || undefined,
    sortBy: filter.sortBy,
    sortDirection: filter.sortDirection,
    tags: filter.tags?.join(','),
    createdBy: filter.createdBy,
    lastRunStatus: filter.lastRunStatus
  };
};

/**
 * Fetches paginated list of tasks with optional filtering
 * @param filter - Task filter criteria
 * @param page - Page number (1-based)
 * @param limit - Items per page
 * @returns Promise with paginated task list
 * @throws ApiError on request failure
 */
export async function getTasks(
  filter: TaskFilter,
  page: number = 1,
  limit: number = 25
): Promise<PaginatedResponse<Task>> {
  try {
    const response = await taskClient.get<PaginatedResponse<Task>>(
      API_ENDPOINTS.tasks.list.path,
      {
        params: buildQueryParams(filter, page, limit),
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}

/**
 * Retrieves a specific task by ID
 * @param id - Task identifier
 * @returns Promise with task details
 * @throws ApiError on request failure
 */
export async function getTaskById(id: string): Promise<ApiResponse<Task>> {
  try {
    const response = await taskClient.get<ApiResponse<Task>>(
      API_ENDPOINTS.tasks.get.path.replace(':id', id),
      {
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}

/**
 * Creates a new task with the provided configuration
 * @param taskConfig - Task configuration
 * @returns Promise with created task details
 * @throws ApiError on request failure or validation errors
 */
export async function createTask(
  taskConfig: TaskConfiguration
): Promise<ApiResponse<Task>> {
  try {
    const response = await taskClient.post<ApiResponse<Task>>(
      API_ENDPOINTS.tasks.create.path,
      taskConfig,
      {
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}

/**
 * Updates an existing task configuration
 * @param id - Task identifier
 * @param taskConfig - Updated task configuration
 * @returns Promise with updated task details
 * @throws ApiError on request failure or validation errors
 */
export async function updateTask(
  id: string,
  taskConfig: Partial<TaskConfiguration>
): Promise<ApiResponse<Task>> {
  try {
    const response = await taskClient.put<ApiResponse<Task>>(
      API_ENDPOINTS.tasks.update.path.replace(':id', id),
      taskConfig,
      {
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}

/**
 * Deletes a task by ID
 * @param id - Task identifier
 * @returns Promise with deletion confirmation
 * @throws ApiError on request failure
 */
export async function deleteTask(id: string): Promise<ApiResponse<void>> {
  try {
    const response = await taskClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.tasks.delete.path.replace(':id', id),
      {
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}

/**
 * Starts task execution
 * @param id - Task identifier
 * @returns Promise with task execution details
 * @throws ApiError on request failure
 */
export async function startTask(id: string): Promise<ApiResponse<Task>> {
  try {
    const response = await taskClient.post<ApiResponse<Task>>(
      API_ENDPOINTS.tasks.start.path.replace(':id', id),
      {},
      {
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}

/**
 * Stops task execution
 * @param id - Task identifier
 * @returns Promise with task status
 * @throws ApiError on request failure
 */
export async function stopTask(id: string): Promise<ApiResponse<Task>> {
  try {
    const response = await taskClient.post<ApiResponse<Task>>(
      API_ENDPOINTS.tasks.stop.path.replace(':id', id),
      {},
      {
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}

/**
 * Gets task execution status
 * @param id - Task identifier
 * @returns Promise with task status
 * @throws ApiError on request failure
 */
export async function getTaskStatus(id: string): Promise<ApiResponse<Task>> {
  try {
    const response = await taskClient.get<ApiResponse<Task>>(
      API_ENDPOINTS.tasks.status.path.replace(':id', id),
      {
        validateStatus: API_CONFIG.validateStatus
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw API_CONFIG.errorHandler(error);
  }
}