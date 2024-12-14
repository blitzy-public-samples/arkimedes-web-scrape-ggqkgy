/**
 * @fileoverview API client module for handling scraped data operations in the web scraping platform frontend.
 * Provides functions for data retrieval, filtering, and export with enhanced validation, caching, and error handling.
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.6.0
import { API_CONFIG, API_ENDPOINTS } from '../config/api';
import { formatApiResponse, buildQueryParams, executeWithRetry } from '../utils/api';
import { 
  ScrapedData, 
  DataFilter, 
  DataResponse, 
  ExportOptions 
} from '../types/data';

/**
 * Cache configuration for data responses
 */
const CACHE_CONFIG = {
  TTL: 5 * 60 * 1000, // 5 minutes
  MAX_ITEMS: 100
};

/**
 * Simple in-memory cache for data responses
 */
const dataCache = new Map<string, { data: any; timestamp: number }>();

/**
 * Generates a cache key from filter parameters
 * @param filter Data filter parameters
 * @returns Cache key string
 */
const generateCacheKey = (filter: DataFilter): string => {
  return JSON.stringify({
    status: filter.status,
    execution_id: filter.execution_id,
    timeRange: filter.timeRange,
    page: filter.page,
    size: filter.size,
    sortField: filter.sortField,
    sortDirection: filter.sortDirection,
    searchTerm: filter.searchTerm
  });
};

/**
 * Checks if cached data is still valid
 * @param timestamp Cache entry timestamp
 * @returns Boolean indicating cache validity
 */
const isCacheValid = (timestamp: number): boolean => {
  return Date.now() - timestamp < CACHE_CONFIG.TTL;
};

/**
 * Retrieves paginated scraped data with advanced filtering, sorting, and validation
 * @param filter Filter criteria for data retrieval
 * @returns Promise resolving to paginated data response
 */
export const fetchData = async (filter: DataFilter): Promise<DataResponse> => {
  const cacheKey = generateCacheKey(filter);
  const cachedResponse = dataCache.get(cacheKey);

  // Return cached response if valid
  if (cachedResponse && isCacheValid(cachedResponse.timestamp)) {
    return cachedResponse.data;
  }

  // Build query parameters
  const queryParams = buildQueryParams({
    status: filter.status,
    execution_id: filter.execution_id,
    start_date: filter.timeRange?.startDate,
    end_date: filter.timeRange?.endDate,
    page: filter.page,
    size: filter.size,
    sort: filter.sortField ? `${filter.sortField},${filter.sortDirection}` : undefined,
    search: filter.searchTerm,
    ...filter.metadata
  });

  try {
    const response = await executeWithRetry(async () => {
      const result = await axios.get(
        `${API_CONFIG.baseURL}${API_ENDPOINTS.data.list.path}?${queryParams}`,
        {
          headers: API_CONFIG.headers,
          timeout: API_CONFIG.timeout
        }
      );
      return formatApiResponse<DataResponse>(result);
    });

    // Cache successful response
    if (dataCache.size >= CACHE_CONFIG.MAX_ITEMS) {
      const oldestKey = Array.from(dataCache.keys())[0];
      dataCache.delete(oldestKey);
    }
    dataCache.set(cacheKey, { data: response.data, timestamp: Date.now() });

    return response.data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
};

/**
 * Retrieves a single scraped data item by ID with validation and caching
 * @param id Unique identifier of the data item
 * @returns Promise resolving to single data item
 */
export const getDataById = async (id: string): Promise<ScrapedData> => {
  const cacheKey = `data_${id}`;
  const cachedResponse = dataCache.get(cacheKey);

  // Return cached response if valid
  if (cachedResponse && isCacheValid(cachedResponse.timestamp)) {
    return cachedResponse.data;
  }

  try {
    const response = await executeWithRetry(async () => {
      const result = await axios.get(
        `${API_CONFIG.baseURL}${API_ENDPOINTS.data.get.path.replace(':id', id)}`,
        {
          headers: API_CONFIG.headers,
          timeout: API_CONFIG.timeout
        }
      );
      return formatApiResponse<ScrapedData>(result);
    });

    // Cache successful response
    dataCache.set(cacheKey, { data: response.data, timestamp: Date.now() });

    return response.data;
  } catch (error) {
    console.error('Error fetching data by ID:', error);
    throw error;
  }
};

/**
 * Exports filtered data with format selection and progress tracking
 * @param options Export configuration options
 * @returns Promise resolving to exported data blob
 */
export const exportData = async (options: ExportOptions): Promise<Blob> => {
  try {
    const response = await executeWithRetry(async () => {
      const result = await axios.post(
        `${API_CONFIG.baseURL}${API_ENDPOINTS.data.export.path}`,
        {
          format: options.format,
          filter: options.filter,
          options: {
            includeRaw: options.includeRaw,
            includeTransformed: options.includeTransformed,
            includeValidation: options.includeValidation,
            includeMetadata: options.includeMetadata,
            fields: options.customFields,
            dateFormat: options.dateFormat
          }
        },
        {
          headers: {
            ...API_CONFIG.headers,
            'Accept': `application/${options.format}`
          },
          timeout: API_CONFIG.timeout * 2, // Double timeout for exports
          responseType: 'blob'
        }
      );
      return result.data;
    });

    return response;
  } catch (error) {
    console.error('Error exporting data:', error);
    throw error;
  }
};