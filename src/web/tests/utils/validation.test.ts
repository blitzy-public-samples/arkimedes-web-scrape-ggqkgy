/**
 * @fileoverview Test suite for core validation utilities
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'; // ^0.34.0
import {
  sanitizeInput,
  validateUrl,
  validateEmail,
  validateTimeRange
} from '../../src/utils/validation';
import type { DateRange } from '../../src/types/common';

// Test fixtures
const xssVectors = [
  '<script>alert(1)</script>',
  'javascript:alert(1)',
  '<img src="x" onerror="alert(1)">',
  '<svg onload="alert(1)">',
  '"><script>alert(1)</script>'
];

const validUrls = [
  'https://example.com',
  'http://localhost:3000',
  'https://sub.domain.com/path?query=1',
  'http://192.168.1.1:8080'
];

const invalidUrls = [
  'ftp://example.com',
  'not-a-url',
  'http://',
  'https://.com',
  'javascript:alert(1)'
];

const validEmails = [
  'user@domain.com',
  'user+tag@domain.com',
  'user.name@sub.domain.com',
  'user123@domain.co.uk'
];

const invalidEmails = [
  '@domain.com',
  'user@',
  'user@.com',
  'user@domain',
  'user space@domain.com'
];

const timeRanges: Record<string, DateRange> = {
  valid: {
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-01-31T23:59:59Z'
  },
  invalid: {
    startDate: '2024-01-31T00:00:00Z',
    endDate: '2024-01-01T23:59:59Z'
  },
  future: {
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-12-31T23:59:59Z'
  }
};

describe('sanitizeInput', () => {
  it('should remove HTML tags by default', () => {
    const input = '<p>Test content</p>';
    const result = sanitizeInput(input);
    expect(result.sanitizedValue).toBe('Test content');
    expect(result.isValid).toBe(true);
  });

  it('should handle XSS attack vectors', () => {
    xssVectors.forEach(vector => {
      const result = sanitizeInput(vector);
      expect(result.sanitizedValue).not.toContain('script');
      expect(result.sanitizedValue).not.toContain('alert');
      expect(result.isValid).toBe(true);
    });
  });

  it('should enforce maximum input length', () => {
    const longInput = 'a'.repeat(2000);
    const result = sanitizeInput(longInput);
    expect(result.sanitizedValue.length).toBe(1000);
    expect(result.errors).toContain('Input truncated to 1000 characters');
  });

  it('should handle null/undefined input', () => {
    // @ts-expect-error testing invalid input
    const result = sanitizeInput(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Input must be a string');
  });

  it('should preserve allowed HTML tags when configured', () => {
    const input = '<p><b>Bold</b> text</p>';
    const result = sanitizeInput(input, {
      stripHTML: false,
      allowedTags: ['b']
    });
    expect(result.sanitizedValue).toBe('<b>Bold</b> text');
    expect(result.isValid).toBe(true);
  });
});

describe('validateUrl', () => {
  it('should validate correct URLs', async () => {
    for (const url of validUrls) {
      const result = await validateUrl(url);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('should reject invalid URLs', async () => {
    for (const url of invalidUrls) {
      const result = await validateUrl(url);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid URL format');
    }
  });

  it('should enforce HTTPS when required', async () => {
    const result = await validateUrl('http://example.com', { requireHTTPS: true });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('HTTPS protocol is required');
  });

  it('should validate against allowed domains', async () => {
    const result = await validateUrl('https://example.com', {
      allowedDomains: ['allowed.com']
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Domain not allowed');
  });

  it('should include URL metadata in result', async () => {
    const result = await validateUrl('https://example.com/path?query=1');
    expect(result.metadata).toEqual({
      protocol: 'https:',
      hostname: 'example.com',
      pathname: '/path'
    });
  });
});

describe('validateEmail', () => {
  it('should validate correct email addresses', async () => {
    for (const email of validEmails) {
      const result = await validateEmail(email);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('should reject invalid email addresses', async () => {
    for (const email of invalidEmails) {
      const result = await validateEmail(email);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    }
  });

  it('should detect disposable email domains', async () => {
    const result = await validateEmail('user@tempmail.com', {
      allowDisposable: false
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Disposable email addresses not allowed');
  });

  it('should validate against domain whitelist', async () => {
    const result = await validateEmail('user@example.com', {
      domainWhitelist: ['allowed.com']
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Email domain not allowed');
  });

  it('should normalize email addresses', async () => {
    const result = await validateEmail('User@DOMAIN.com');
    expect(result.sanitizedValue).toBe('user@domain.com');
    expect(result.isValid).toBe(true);
  });
});

describe('validateTimeRange', () => {
  it('should validate correct date ranges', () => {
    const result = validateTimeRange(timeRanges.valid);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid date ranges', () => {
    const result = validateTimeRange(timeRanges.invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Start date must be before end date');
  });

  it('should reject future dates when not allowed', () => {
    const result = validateTimeRange(timeRanges.future, {
      allowFutureDates: false
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Future dates not allowed');
  });

  it('should enforce maximum range limit', () => {
    const result = validateTimeRange(timeRanges.valid, { maxRange: 7 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Date range exceeds maximum of 7 days');
  });

  it('should include timezone information in metadata', () => {
    const result = validateTimeRange(timeRanges.valid, {
      timezone: 'America/New_York'
    });
    expect(result.metadata.timezone).toBe('America/New_York');
    expect(result.isValid).toBe(true);
  });
});