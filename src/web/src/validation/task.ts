/**
 * @fileoverview Comprehensive validation schemas for web scraping task configuration
 * Implements strict type checking, security rules, and performance optimization
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.0
import { isValid, parseISO, isWithinInterval } from 'date-fns'; // v2.30.0
import { 
  Task, 
  TaskConfiguration, 
  TaskPriority, 
  TaskFrequency, 
  ExtractorRule,
  ProxyConfiguration 
} from '../types/task';
import { validateUrl, validateSelector } from '../utils/validation';

// Global constants for validation rules
const MAX_TASK_NAME_LENGTH = 100;
const MAX_EXTRACTORS = 50;
const MIN_SCHEDULE_INTERVAL = 3600; // 1 hour in seconds
const MAX_CONCURRENT_TASKS = 100;
const MAX_RETRIES = 3;

/**
 * Enhanced validation error with detailed context
 */
export class ValidationError extends Error {
  constructor(
    public field: string,
    public code: string,
    public context: Record<string, any>
  ) {
    super(`Validation failed for ${field}: ${code}`);
    this.name = 'ValidationError';
  }
}

/**
 * Validation schema for task name with security checks
 */
const taskNameSchema = z.string()
  .min(1, 'Task name is required')
  .max(MAX_TASK_NAME_LENGTH, `Task name cannot exceed ${MAX_TASK_NAME_LENGTH} characters`)
  .regex(/^[\w\s-]+$/, 'Task name can only contain letters, numbers, spaces, and hyphens')
  .transform((val) => val.trim());

/**
 * Validation schema for task schedule
 */
const scheduleSchema = z.object({
  frequency: z.enum(['once', 'hourly', 'daily', 'weekly', 'monthly'] as const),
  startDate: z.string().refine((date) => isValid(parseISO(date)), 'Invalid start date'),
  endDate: z.string().nullable(),
  timeZone: z.string().default('UTC'),
}).refine((data) => {
  if (data.endDate) {
    const start = parseISO(data.startDate);
    const end = parseISO(data.endDate);
    return isWithinInterval(end, { start, end: new Date() });
  }
  return true;
}, 'End date must be after start date and not in the future');

/**
 * Validation schema for data extraction rules
 */
const extractorRuleSchema = z.object({
  fieldName: z.string()
    .min(1, 'Field name is required')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid field name format'),
  selector: z.string()
    .min(1, 'Selector is required')
    .refine(validateSelector, 'Invalid selector syntax'),
  type: z.enum(['text', 'number', 'date', 'url']),
  required: z.boolean(),
  validation: z.string().nullable(),
  transform: z.function().nullable(),
}).refine((rule) => {
  // Additional selector performance checks
  const complexityScore = rule.selector.split(' ').length;
  return complexityScore <= 5;
}, 'Selector is too complex and may impact performance');

/**
 * Validation schema for proxy configuration
 */
const proxyConfigSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['system', 'custom']).optional(),
  url: z.string().url().optional(),
  credentials: z.record(z.string()).optional(),
}).refine((config) => {
  if (config.enabled && config.type === 'custom') {
    return !!config.url;
  }
  return true;
}, 'Custom proxy configuration requires a URL');

/**
 * Comprehensive task configuration validation schema
 */
export const taskConfigurationSchema = z.object({
  url: z.string()
    .url('Invalid URL format')
    .refine(async (url) => {
      const result = await validateUrl(url, { requireHTTPS: true });
      return result.isValid;
    }, 'URL validation failed'),
  schedule: scheduleSchema,
  extractors: z.array(extractorRuleSchema)
    .min(1, 'At least one extractor rule is required')
    .max(MAX_EXTRACTORS, `Maximum ${MAX_EXTRACTORS} extractor rules allowed`)
    .refine((rules) => {
      const fieldNames = new Set(rules.map(r => r.fieldName));
      return fieldNames.size === rules.length;
    }, 'Duplicate field names are not allowed'),
  priority: z.enum(['low', 'medium', 'high'] as const),
  useProxy: z.boolean(),
  proxyConfig: proxyConfigSchema.optional(),
  followPagination: z.boolean(),
  maxPages: z.number()
    .int()
    .min(1)
    .max(1000),
  timeout: z.number()
    .int()
    .min(1000)
    .max(300000), // 5 minutes
  retryAttempts: z.number()
    .int()
    .min(0)
    .max(MAX_RETRIES),
  headers: z.record(z.string()).optional(),
  cookies: z.record(z.string()).optional(),
  javascript: z.boolean(),
  authentication: z.object({
    required: z.boolean(),
    type: z.enum(['basic', 'oauth', 'custom']).optional(),
    credentials: z.record(z.string()).optional(),
  }),
});

/**
 * Complete task validation schema
 */
export const taskSchema = z.object({
  name: taskNameSchema,
  description: z.string().optional(),
  configuration: taskConfigurationSchema,
  tags: z.array(z.string()).default([]),
}).refine(async (task) => {
  // Validate concurrent task limits
  const activeTasks = 0; // This would be fetched from the task service
  return activeTasks < MAX_CONCURRENT_TASKS;
}, 'Maximum concurrent task limit reached');

/**
 * Type for validation result with metadata
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  metadata: {
    timestamp: string;
    validatedFields: string[];
    performance: {
      duration: number;
      complexityScore: number;
    };
  };
}

/**
 * Validates task configuration with enhanced error handling
 */
export async function validateTaskConfiguration(
  config: TaskConfiguration
): Promise<ValidationResult> {
  const startTime = Date.now();
  const errors: ValidationError[] = [];
  const validatedFields: string[] = [];

  try {
    await taskConfigurationSchema.parseAsync(config);
    return {
      isValid: true,
      errors: [],
      metadata: {
        timestamp: new Date().toISOString(),
        validatedFields: Object.keys(config),
        performance: {
          duration: Date.now() - startTime,
          complexityScore: calculateComplexityScore(config),
        },
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push(...error.errors.map(err => new ValidationError(
        err.path.join('.'),
        err.code,
        { message: err.message }
      )));
    }

    return {
      isValid: false,
      errors,
      metadata: {
        timestamp: new Date().toISOString(),
        validatedFields: Object.keys(config),
        performance: {
          duration: Date.now() - startTime,
          complexityScore: calculateComplexityScore(config),
        },
      },
    };
  }
}

/**
 * Calculates configuration complexity score for performance optimization
 */
function calculateComplexityScore(config: TaskConfiguration): number {
  return (
    config.extractors.length +
    (config.followPagination ? 2 : 0) +
    (config.javascript ? 2 : 0) +
    (config.authentication.required ? 3 : 0)
  );
}