/**
 * @fileoverview Enhanced validation schemas and utilities for scraped data handling,
 * filtering, and export operations with comprehensive security measures.
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.0
import { 
  ScrapedData, 
  DataFilter, 
  ExportOptions,
  DataStatus,
  ExportFormat,
  SortDirection,
  ValidationResult
} from '../types/data';
import { sanitizeInput, validateTimeRange } from '../utils/validation';

// Constants for pagination and filtering
export const MAX_FILTER_PAGE_SIZE = 100;
export const MIN_FILTER_PAGE_SIZE = 10;
export const DEFAULT_FILTER_PAGE_SIZE = 25;

// Validation schemas with enhanced security checks
const validationResultSchema = z.object({
  field: z.string().min(1).max(100),
  status: z.enum(['valid', 'invalid']),
  message: z.string().optional()
});

export const scrapedDataSchema = z.object({
  id: z.string().uuid(),
  execution_id: z.string().uuid(),
  collected_at: z.string().datetime(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(['pending', 'valid', 'invalid', 'error']),
  raw_data: z.record(z.unknown()),
  transformed_data: z.record(z.unknown()),
  validation_results: z.array(validationResultSchema),
  metadata: z.record(z.unknown())
}).strict();

export const dataFilterSchema = z.object({
  status: z.enum(['pending', 'valid', 'invalid', 'error']).nullable(),
  execution_id: z.string().uuid().nullable(),
  timeRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }).nullable(),
  page: z.number().int().min(0),
  size: z.number().int().min(MIN_FILTER_PAGE_SIZE).max(MAX_FILTER_PAGE_SIZE),
  sortField: z.string().nullable(),
  sortDirection: z.enum(['asc', 'desc']).nullable(),
  searchTerm: z.string().max(100).nullable(),
  metadata: z.record(z.unknown())
}).strict();

export const exportOptionsSchema = z.object({
  format: z.enum(['json', 'csv', 'xml']),
  filter: dataFilterSchema,
  includeRaw: z.boolean(),
  includeTransformed: z.boolean(),
  includeValidation: z.boolean(),
  includeMetadata: z.boolean(),
  customFields: z.array(z.string().max(100)),
  dateFormat: z.string().max(50)
}).strict();

/**
 * Validates scraped data structure and content with enhanced security checks
 * @param data - Scraped data object to validate
 * @returns Detailed validation result with error context and security flags
 */
export const validateScrapedData = (data: ScrapedData): {
  isValid: boolean;
  errors: string[];
  sanitizedData: Partial<ScrapedData>;
  securityFlags: Record<string, boolean>;
} => {
  const errors: string[] = [];
  const securityFlags: Record<string, boolean> = {
    hasXSS: false,
    hasSQLInjection: false,
    hasUnsafeContent: false
  };

  try {
    // Schema validation
    const schemaResult = scrapedDataSchema.safeParse(data);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.errors.map(e => e.message));
      return { 
        isValid: false, 
        errors, 
        sanitizedData: {}, 
        securityFlags 
      };
    }

    // Deep sanitization of data fields
    const sanitizedData: Partial<ScrapedData> = {
      ...data,
      raw_data: {},
      transformed_data: {}
    };

    // Sanitize raw data fields
    for (const [key, value] of Object.entries(data.raw_data)) {
      if (typeof value === 'string') {
        const sanitizeResult = sanitizeInput(value, { stripHTML: true });
        sanitizedData.raw_data![key] = sanitizeResult.sanitizedValue;
        if (!sanitizeResult.isValid) {
          errors.push(`Raw data field "${key}": ${sanitizeResult.errors.join(', ')}`);
          securityFlags.hasUnsafeContent = true;
        }
      } else {
        sanitizedData.raw_data![key] = value;
      }
    }

    // Sanitize transformed data fields
    for (const [key, value] of Object.entries(data.transformed_data)) {
      if (typeof value === 'string') {
        const sanitizeResult = sanitizeInput(value, { stripHTML: true });
        sanitizedData.transformed_data![key] = sanitizeResult.sanitizedValue;
        if (!sanitizeResult.isValid) {
          errors.push(`Transformed data field "${key}": ${sanitizeResult.errors.join(', ')}`);
          securityFlags.hasUnsafeContent = true;
        }
      } else {
        sanitizedData.transformed_data![key] = value;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData,
      securityFlags
    };
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      errors,
      sanitizedData: {},
      securityFlags
    };
  }
};

/**
 * Validates data filter parameters with enhanced validation rules
 * @param filter - Data filter configuration to validate
 * @returns Detailed validation result with filter-specific checks
 */
export const validateDataFilter = (filter: DataFilter): {
  isValid: boolean;
  errors: string[];
  sanitizedFilter: Partial<DataFilter>;
} => {
  const errors: string[] = [];

  try {
    // Schema validation
    const schemaResult = dataFilterSchema.safeParse(filter);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.errors.map(e => e.message));
      return { 
        isValid: false, 
        errors, 
        sanitizedFilter: {} 
      };
    }

    // Time range validation if present
    if (filter.timeRange) {
      const timeRangeResult = validateTimeRange(filter.timeRange, {
        maxRange: 365,
        allowFutureDates: false
      });
      if (!timeRangeResult.isValid) {
        errors.push(...timeRangeResult.errors);
      }
    }

    // Sanitize search term if present
    const sanitizedFilter: Partial<DataFilter> = { ...filter };
    if (filter.searchTerm) {
      const sanitizeResult = sanitizeInput(filter.searchTerm, {
        maxLength: 100,
        stripHTML: true
      });
      sanitizedFilter.searchTerm = sanitizeResult.sanitizedValue;
      if (!sanitizeResult.isValid) {
        errors.push(...sanitizeResult.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedFilter
    };
  } catch (error) {
    errors.push(`Filter validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      errors,
      sanitizedFilter: {}
    };
  }
};

/**
 * Validates data export configuration with format-specific rules
 * @param options - Export configuration to validate
 * @returns Detailed validation result with export-specific checks
 */
export const validateExportOptions = (options: ExportOptions): {
  isValid: boolean;
  errors: string[];
  sanitizedOptions: Partial<ExportOptions>;
} => {
  const errors: string[] = [];

  try {
    // Schema validation
    const schemaResult = exportOptionsSchema.safeParse(options);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.errors.map(e => e.message));
      return { 
        isValid: false, 
        errors, 
        sanitizedOptions: {} 
      };
    }

    // Validate filter configuration
    const filterResult = validateDataFilter(options.filter);
    if (!filterResult.isValid) {
      errors.push(...filterResult.errors);
    }

    // Validate custom fields
    const sanitizedOptions: Partial<ExportOptions> = {
      ...options,
      customFields: options.customFields.map(field => {
        const sanitizeResult = sanitizeInput(field, {
          maxLength: 100,
          stripHTML: true
        });
        if (!sanitizeResult.isValid) {
          errors.push(`Custom field "${field}": ${sanitizeResult.errors.join(', ')}`);
        }
        return sanitizeResult.sanitizedValue;
      })
    };

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedOptions
    };
  } catch (error) {
    errors.push(`Export options validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      errors,
      sanitizedOptions: {}
    };
  }
};