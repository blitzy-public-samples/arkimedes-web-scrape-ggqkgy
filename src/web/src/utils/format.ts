/**
 * @fileoverview Enterprise-grade utility functions for data formatting and string manipulation
 * Provides consistent, localized, and accessible formatting across the web scraping platform frontend
 * @version 1.0.0
 */

import numeral from 'numeral'; // v2.0.6
import { memoize } from 'lodash'; // v4.17.21
import { TaskStatus } from '../types/common';

/**
 * Interface for task status formatting result
 */
interface FormattedTaskStatus {
  text: string;
  color: string;
  ariaLabel: string;
}

/**
 * Color mapping for task statuses following Material Design color system
 */
const STATUS_COLORS = {
  [TaskStatus.PENDING]: '#FB8C00', // Orange 600
  [TaskStatus.RUNNING]: '#2196F3', // Blue 500
  [TaskStatus.COMPLETED]: '#4CAF50', // Green 500
  [TaskStatus.FAILED]: '#F44336', // Red 500
  [TaskStatus.CANCELLED]: '#9E9E9E', // Grey 500
} as const;

/**
 * Formats a number with specified format pattern using memoization for performance
 * @param number - Number or string to format
 * @param format - Numeral.js format pattern
 * @param locale - Locale identifier (e.g., 'en-US')
 * @returns Formatted number string with locale support
 * @throws Error if number is invalid or format pattern is unsupported
 */
export const formatNumber = memoize((
  number: number | string,
  format: string = '0,0.00',
  locale: string = 'en-US'
): string => {
  try {
    // Validate input
    if (number === null || number === undefined) {
      throw new Error('Invalid number input');
    }

    // Set locale for numeral
    numeral.locale(locale);

    // Convert string to number if needed
    const numberValue = typeof number === 'string' ? parseFloat(number) : number;
    
    if (isNaN(numberValue)) {
      throw new Error('Invalid number format');
    }

    return numeral(numberValue).format(format);
  } catch (error) {
    console.error('Error formatting number:', error);
    return '—'; // Return em dash for invalid numbers
  }
}, (number, format, locale) => `${number}-${format}-${locale}`);

/**
 * Formats a decimal to percentage string with locale support
 * @param value - Decimal value between 0 and 1
 * @param decimals - Number of decimal places
 * @param locale - Locale identifier
 * @returns Localized percentage string
 * @throws Error if value is outside valid range
 */
export const formatPercentage = memoize((
  value: number,
  decimals: number = 2,
  locale: string = 'en-US'
): string => {
  try {
    // Validate value range
    if (value < 0 || value > 1) {
      throw new Error('Percentage value must be between 0 and 1');
    }

    // Convert to percentage and format
    const percentage = value * 100;
    const formatPattern = `0,0.${'0'.repeat(decimals)}%`;

    return formatNumber(percentage, formatPattern, locale);
  } catch (error) {
    console.error('Error formatting percentage:', error);
    return '0%';
  }
}, (value, decimals, locale) => `${value}-${decimals}-${locale}`);

/**
 * Formats task status enum to display string with color and accessibility support
 * @param status - TaskStatus enum value
 * @param verbose - Whether to use verbose status text
 * @returns Formatted status object with text, color, and ARIA label
 */
export const formatTaskStatus = (
  status: TaskStatus,
  verbose: boolean = false
): FormattedTaskStatus => {
  try {
    // Validate status
    if (!Object.values(TaskStatus).includes(status)) {
      throw new Error('Invalid task status');
    }

    // Define status text mapping
    const statusText = {
      [TaskStatus.PENDING]: verbose ? 'Task Pending' : 'Pending',
      [TaskStatus.RUNNING]: verbose ? 'Task Running' : 'Running',
      [TaskStatus.COMPLETED]: verbose ? 'Task Completed' : 'Completed',
      [TaskStatus.FAILED]: verbose ? 'Task Failed' : 'Failed',
      [TaskStatus.CANCELLED]: verbose ? 'Task Cancelled' : 'Cancelled',
    };

    // Generate ARIA label
    const ariaLabel = `Task status: ${statusText[status]}`;

    return {
      text: statusText[status],
      color: STATUS_COLORS[status],
      ariaLabel,
    };
  } catch (error) {
    console.error('Error formatting task status:', error);
    return {
      text: 'Unknown',
      color: '#9E9E9E', // Grey 500
      ariaLabel: 'Task status: Unknown',
    };
  }
};

/**
 * Type guard to check if a value is a valid TaskStatus
 * @param value - Value to check
 * @returns Boolean indicating if value is a valid TaskStatus
 */
export const isValidTaskStatus = (value: any): value is TaskStatus => {
  return Object.values(TaskStatus).includes(value as TaskStatus);
};