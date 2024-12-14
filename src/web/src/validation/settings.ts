/**
 * @fileoverview Implements comprehensive validation schemas for application settings
 * using Zod with enhanced error messages and strict type safety.
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.0
import { 
  SystemSettings, 
  ProxySettings, 
  StorageSettings,
  ProxyProvider 
} from '../types/settings';
import { validateUrl } from '../utils/validation';

// Constants for validation boundaries
const MIN_CONCURRENT_TASKS = 1;
const MAX_CONCURRENT_TASKS = 100;
const MIN_REQUEST_TIMEOUT = 1000;
const MAX_REQUEST_TIMEOUT = 60000;
const MAX_RETRY_ATTEMPTS = 5;
const MIN_ROTATION_INTERVAL = 60;
const MAX_ROTATION_INTERVAL = 3600;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

/**
 * Validation schema for system-wide performance settings
 */
export const systemSettingsSchema = z.object({
  maxConcurrentTasks: z.number()
    .int('Maximum concurrent tasks must be a whole number')
    .min(MIN_CONCURRENT_TASKS, `Must allow at least ${MIN_CONCURRENT_TASKS} concurrent task`)
    .max(MAX_CONCURRENT_TASKS, `Cannot exceed ${MAX_CONCURRENT_TASKS} concurrent tasks for system stability`)
    .default(10),

  requestTimeout: z.number()
    .int('Request timeout must be a whole number')
    .min(MIN_REQUEST_TIMEOUT, `Timeout must be at least ${MIN_REQUEST_TIMEOUT}ms for network latency`)
    .max(MAX_REQUEST_TIMEOUT, `Timeout cannot exceed ${MAX_REQUEST_TIMEOUT}ms to prevent resource exhaustion`)
    .default(5000),

  retryAttempts: z.number()
    .int('Retry attempts must be a whole number')
    .min(0, 'Retry attempts cannot be negative')
    .max(MAX_RETRY_ATTEMPTS, `Maximum ${MAX_RETRY_ATTEMPTS} retries allowed to prevent infinite loops`)
    .default(3)
}).strict().refine(
  (data) => {
    // Cross-field validation: Ensure retry timing doesn't exceed reasonable bounds
    return data.retryAttempts * data.requestTimeout <= MAX_REQUEST_TIMEOUT * 2;
  },
  {
    message: 'Total retry duration exceeds maximum allowed time window',
    path: ['retryAttempts']
  }
);

/**
 * Validation schema for proxy service configuration
 */
export const proxySettingsSchema = z.object({
  provider: z.nativeEnum(ProxyProvider, {
    errorMap: () => ({ message: 'Invalid proxy provider selected' })
  }),

  enabled: z.boolean()
    .default(true)
    .describe('Enable/disable proxy rotation'),

  rotationInterval: z.number()
    .int('Rotation interval must be a whole number')
    .min(MIN_ROTATION_INTERVAL, `Minimum rotation interval is ${MIN_ROTATION_INTERVAL} seconds`)
    .max(MAX_ROTATION_INTERVAL, `Maximum rotation interval is ${MAX_ROTATION_INTERVAL} seconds`)
    .default(300),

  customProxies: z.array(z.string()
    .url('Invalid proxy URL format')
    .refine(async (url) => {
      const result = await validateUrl(url, { requireHTTPS: true });
      return result.isValid;
    }, 'Invalid proxy URL or proxy not accessible'))
    .optional()
    .default([])
}).strict().refine(
  (data) => {
    // Ensure custom proxies are provided when using CUSTOM provider
    return data.provider !== ProxyProvider.CUSTOM || 
           (data.customProxies && data.customProxies.length > 0);
  },
  {
    message: 'Custom proxy list required when using CUSTOM provider',
    path: ['customProxies']
  }
);

/**
 * Validation schema for storage and retention configuration
 */
export const storageSettingsSchema = z.object({
  retentionPeriod: z.number()
    .int('Retention period must be a whole number')
    .min(MIN_RETENTION_DAYS, `Minimum retention period is ${MIN_RETENTION_DAYS} day`)
    .max(MAX_RETENTION_DAYS, `Maximum retention period is ${MAX_RETENTION_DAYS} days`)
    .default(90),

  autoArchive: z.boolean()
    .default(false)
    .describe('Enable/disable automatic data archival'),

  archiveLocation: z.string()
    .url('Invalid archive location URL')
    .refine(async (url) => {
      const result = await validateUrl(url);
      return result.isValid;
    }, 'Invalid archive location or location not accessible')
}).strict().refine(
  (data) => {
    // Ensure archive location is provided when auto-archive is enabled
    return !data.autoArchive || (data.archiveLocation && data.archiveLocation.length > 0);
  },
  {
    message: 'Archive location required when auto-archive is enabled',
    path: ['archiveLocation']
  }
);

/**
 * Combined validation schema for all application settings
 * with cross-schema validation rules
 */
export const settingsSchema = z.object({
  system: systemSettingsSchema,
  proxy: proxySettingsSchema,
  storage: storageSettingsSchema
}).strict().refine(
  (data) => {
    // Cross-schema validation: Ensure storage capacity for concurrent tasks
    const estimatedStoragePerTask = 100; // MB
    const totalStorageRequired = data.system.maxConcurrentTasks * estimatedStoragePerTask;
    return totalStorageRequired <= 10000; // 10GB limit
  },
  {
    message: 'Concurrent task configuration exceeds available storage capacity',
    path: ['system.maxConcurrentTasks']
  }
);

// Type inference helpers
export type ValidSystemSettings = z.infer<typeof systemSettingsSchema>;
export type ValidProxySettings = z.infer<typeof proxySettingsSchema>;
export type ValidStorageSettings = z.infer<typeof storageSettingsSchema>;
export type ValidSettings = z.infer<typeof settingsSchema>;