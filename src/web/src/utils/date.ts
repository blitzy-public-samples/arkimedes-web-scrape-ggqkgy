// Date utility module for web scraping platform frontend
// Dependencies:
// - dayjs: ^1.11.9
// - dayjs/plugin/utc: ^1.11.9
// - dayjs/plugin/timezone: ^1.11.9
// - dayjs/plugin/duration: ^1.11.9
// - dayjs/plugin/relativeTime: ^1.11.9

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

// Configure dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);
dayjs.extend(relativeTime);

// Global constants
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
export const DEFAULT_LOCALE = 'en-US';
export const TIMEZONE_COOKIE_KEY = 'user_timezone';

// Error messages
const ERROR_MESSAGES = {
  INVALID_DATE: 'Invalid date',
  INVALID_FORMAT: 'Invalid format',
  INVALID_DURATION: 'Invalid duration',
} as const;

// Types
type DateInput = string | Date | null;
type FormatInput = string;
type LocaleInput = string | undefined;

/**
 * Memoization decorator for date formatting functions
 * Caches results based on input parameters to improve performance
 */
function memoize(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  const cache = new Map();

  descriptor.value = function (...args: any[]) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = originalMethod.apply(this, args);
    cache.set(key, result);
    return result;
  };

  return descriptor;
}

/**
 * Formats a date string into a standardized display format with locale support
 * @param date - Input date string or Date object
 * @param format - Desired output format
 * @param locale - Optional locale string (e.g., 'en-US')
 * @returns Formatted date string or error placeholder
 */
@memoize
export function formatDate(
  date: DateInput,
  format: FormatInput = DEFAULT_DATE_FORMAT,
  locale: LocaleInput = DEFAULT_LOCALE
): string {
  try {
    // Handle null or undefined inputs
    if (!date) {
      return ERROR_MESSAGES.INVALID_DATE;
    }

    // Create dayjs instance with timezone awareness
    const dayjsDate = dayjs(date).tz(dayjs.tz.guess());

    // Validate date
    if (!dayjsDate.isValid()) {
      return ERROR_MESSAGES.INVALID_DATE;
    }

    // Apply locale if provided
    if (locale) {
      dayjsDate.locale(locale);
    }

    // Format date with error handling
    return dayjsDate.format(format);
  } catch (error) {
    console.error('Error formatting date:', error);
    return ERROR_MESSAGES.INVALID_DATE;
  }
}

/**
 * Formats a duration between two dates with support for ongoing tasks
 * @param startDate - Start date of the duration
 * @param endDate - End date (null for ongoing tasks)
 * @param format - Optional custom format for duration
 * @returns Formatted duration string
 */
@memoize
export function formatDuration(
  startDate: DateInput,
  endDate: DateInput,
  format?: FormatInput
): string {
  try {
    // Validate start date
    if (!startDate) {
      return ERROR_MESSAGES.INVALID_DURATION;
    }

    const start = dayjs(startDate);
    if (!start.isValid()) {
      return ERROR_MESSAGES.INVALID_DURATION;
    }

    // Handle ongoing tasks (null end date)
    if (!endDate) {
      const duration = dayjs.duration(dayjs().diff(start));
      return `${duration.humanize()} (ongoing)`;
    }

    const end = dayjs(endDate);
    if (!end.isValid()) {
      return ERROR_MESSAGES.INVALID_DURATION;
    }

    // Calculate duration
    const durationMs = end.diff(start);
    if (durationMs < 0) {
      return ERROR_MESSAGES.INVALID_DURATION;
    }

    const duration = dayjs.duration(durationMs);

    // Format duration based on length
    if (format) {
      return duration.format(format);
    } else if (durationMs < 60000) { // Less than 1 minute
      return `${duration.asSeconds().toFixed(1)}s`;
    } else if (durationMs < 3600000) { // Less than 1 hour
      return `${duration.minutes()}m ${duration.seconds()}s`;
    } else if (durationMs < 86400000) { // Less than 1 day
      return `${duration.hours()}h ${duration.minutes()}m`;
    } else {
      return `${duration.days()}d ${duration.hours()}h`;
    }
  } catch (error) {
    console.error('Error formatting duration:', error);
    return ERROR_MESSAGES.INVALID_DURATION;
  }
}

// Additional utility functions for internal use
const isValidDateInput = (date: DateInput): boolean => {
  if (!date) return false;
  return dayjs(date).isValid();
};

const isValidFormatInput = (format: FormatInput): boolean => {
  try {
    dayjs().format(format);
    return true;
  } catch {
    return false;
  }
};

// Export types for consumers
export type { DateInput, FormatInput, LocaleInput };