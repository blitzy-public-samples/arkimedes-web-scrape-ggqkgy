/**
 * @fileoverview Core validation utilities implementing robust form validation,
 * data sanitization, and security-focused validation patterns.
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.0
import { isValid } from 'date-fns'; // v2.30.0
import DOMPurify from 'dompurify'; // v3.0.6
import { DateRange } from '../types/common';

// Regular expressions for validation
const URL_REGEX = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Constants
const MAX_INPUT_LENGTH = 1000;
const ALLOWED_PROTOCOLS = ['http', 'https'];
const DISPOSABLE_EMAIL_DOMAINS = ['tempmail.com', 'throwaway.com'];

// Types
interface SanitizeOptions {
  maxLength?: number;
  allowedTags?: string[];
  allowedAttributes?: string[];
  stripHTML?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  sanitizedValue: string;
  errors: string[];
  metadata: Record<string, any>;
}

interface URLValidationOptions {
  requireHTTPS?: boolean;
  checkDNS?: boolean;
  allowedDomains?: string[];
}

interface EmailValidationOptions {
  checkMX?: boolean;
  allowDisposable?: boolean;
  domainWhitelist?: string[];
}

interface TimeRangeValidationOptions {
  maxRange?: number;
  allowFutureDates?: boolean;
  timezone?: string;
}

/**
 * Enhanced input sanitization with configurable security rules and XSS protection
 * @param input - Raw input string to sanitize
 * @param options - Sanitization configuration options
 * @returns Sanitized input with validation metadata
 */
export const sanitizeInput = (
  input: string,
  options: SanitizeOptions = {}
): ValidationResult => {
  const {
    maxLength = MAX_INPUT_LENGTH,
    allowedTags = [],
    allowedAttributes = [],
    stripHTML = true
  } = options;

  const errors: string[] = [];
  let sanitizedValue = input;

  try {
    // Validate input type and length
    if (typeof input !== 'string') {
      errors.push('Input must be a string');
      return {
        isValid: false,
        sanitizedValue: '',
        errors,
        metadata: { originalType: typeof input }
      };
    }

    // Truncate if exceeds max length
    if (input.length > maxLength) {
      sanitizedValue = input.slice(0, maxLength);
      errors.push(`Input truncated to ${maxLength} characters`);
    }

    // Configure DOMPurify
    const purifyConfig = {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttributes,
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: true
    };

    // Apply HTML sanitization
    sanitizedValue = stripHTML
      ? DOMPurify.sanitize(sanitizedValue, { ...purifyConfig, ALLOWED_TAGS: [] })
      : DOMPurify.sanitize(sanitizedValue, purifyConfig);

    return {
      isValid: errors.length === 0,
      sanitizedValue,
      errors,
      metadata: {
        originalLength: input.length,
        finalLength: sanitizedValue.length,
        wasModified: input !== sanitizedValue
      }
    };
  } catch (error) {
    errors.push(`Sanitization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      sanitizedValue: '',
      errors,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
};

/**
 * Comprehensive URL validation with protocol and domain verification
 * @param url - URL string to validate
 * @param options - URL validation options
 * @returns Validation result with detailed error information
 */
export const validateUrl = async (
  url: string,
  options: URLValidationOptions = {}
): Promise<ValidationResult> => {
  const {
    requireHTTPS = false,
    checkDNS = false,
    allowedDomains = []
  } = options;

  const errors: string[] = [];
  let sanitizedValue = url;

  try {
    // Basic URL format validation
    if (!URL_REGEX.test(url)) {
      errors.push('Invalid URL format');
      return {
        isValid: false,
        sanitizedValue: url,
        errors,
        metadata: { format: 'invalid' }
      };
    }

    const urlObject = new URL(url);

    // Protocol validation
    if (requireHTTPS && urlObject.protocol !== 'https:') {
      errors.push('HTTPS protocol is required');
    }

    if (!ALLOWED_PROTOCOLS.includes(urlObject.protocol.slice(0, -1))) {
      errors.push('Invalid protocol');
    }

    // Domain validation
    if (allowedDomains.length > 0 && !allowedDomains.includes(urlObject.hostname)) {
      errors.push('Domain not allowed');
    }

    // DNS lookup if required
    if (checkDNS) {
      try {
        await fetch(`https://${urlObject.hostname}`, { method: 'HEAD', mode: 'no-cors' });
      } catch {
        errors.push('Domain not accessible');
      }
    }

    return {
      isValid: errors.length === 0,
      sanitizedValue: url,
      errors,
      metadata: {
        protocol: urlObject.protocol,
        hostname: urlObject.hostname,
        pathname: urlObject.pathname
      }
    };
  } catch (error) {
    errors.push(`URL validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      sanitizedValue: url,
      errors,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
};

/**
 * Advanced email validation with domain verification and disposable email detection
 * @param email - Email address to validate
 * @param options - Email validation options
 * @returns Validation result with domain verification status
 */
export const validateEmail = async (
  email: string,
  options: EmailValidationOptions = {}
): Promise<ValidationResult> => {
  const {
    checkMX = false,
    allowDisposable = false,
    domainWhitelist = []
  } = options;

  const errors: string[] = [];
  let sanitizedValue = email.toLowerCase().trim();

  try {
    // Basic email format validation
    if (!EMAIL_REGEX.test(sanitizedValue)) {
      errors.push('Invalid email format');
      return {
        isValid: false,
        sanitizedValue,
        errors,
        metadata: { format: 'invalid' }
      };
    }

    const [, domain] = sanitizedValue.split('@');

    // Domain whitelist check
    if (domainWhitelist.length > 0 && !domainWhitelist.includes(domain)) {
      errors.push('Email domain not allowed');
    }

    // Disposable email check
    if (!allowDisposable && DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
      errors.push('Disposable email addresses not allowed');
    }

    // MX record check if required
    if (checkMX) {
      // Note: In a real implementation, you would use a proper DNS lookup service
      // This is a simplified example
      try {
        await fetch(`https://${domain}`, { method: 'HEAD', mode: 'no-cors' });
      } catch {
        errors.push('Email domain not accessible');
      }
    }

    return {
      isValid: errors.length === 0,
      sanitizedValue,
      errors,
      metadata: {
        domain,
        isDisposable: DISPOSABLE_EMAIL_DOMAINS.includes(domain)
      }
    };
  } catch (error) {
    errors.push(`Email validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      sanitizedValue,
      errors,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
};

/**
 * Time range validation with timezone support and business rules
 * @param range - Date range to validate
 * @param options - Time range validation options
 * @returns Validation result with timezone information
 */
export const validateTimeRange = (
  range: DateRange,
  options: TimeRangeValidationOptions = {}
): ValidationResult => {
  const {
    maxRange = 365, // days
    allowFutureDates = false,
    timezone = 'UTC'
  } = options;

  const errors: string[] = [];
  const { startDate, endDate } = range;

  try {
    // Create Date objects with timezone consideration
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    // Validate date formats
    if (!isValid(start) || !isValid(end)) {
      errors.push('Invalid date format');
      return {
        isValid: false,
        sanitizedValue: JSON.stringify(range),
        errors,
        metadata: { format: 'invalid' }
      };
    }

    // Validate range order
    if (start > end) {
      errors.push('Start date must be before end date');
    }

    // Validate future dates
    if (!allowFutureDates && (start > now || end > now)) {
      errors.push('Future dates not allowed');
    }

    // Validate range duration
    const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (rangeDays > maxRange) {
      errors.push(`Date range exceeds maximum of ${maxRange} days`);
    }

    return {
      isValid: errors.length === 0,
      sanitizedValue: JSON.stringify(range),
      errors,
      metadata: {
        timezone,
        rangeDays,
        isHistorical: end < now
      }
    };
  } catch (error) {
    errors.push(`Time range validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isValid: false,
      sanitizedValue: JSON.stringify(range),
      errors,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
};