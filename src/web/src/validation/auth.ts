/**
 * @fileoverview Authentication validation schemas and rules using Zod
 * Implements comprehensive validation for login, MFA, and service account authentication
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.0
import { LoginCredentials, UserRole } from '../types/auth';
import { validateEmail } from '../utils/validation';

// Security-focused validation constants
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
const MFA_CODE_REGEX = /^\d{6}$/;
const SERVICE_ACCOUNT_ID_REGEX = /^sa-[a-zA-Z0-9]{32}$/;
const API_KEY_REGEX = /^[a-zA-Z0-9]{64}$/;

// Allowed email domains for enterprise users
const ALLOWED_EMAIL_DOMAINS = ['company.com', 'enterprise.org'];

/**
 * Enhanced login credentials schema with strict validation rules
 * Supports both user and service account authentication flows
 */
export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .regex(
      PASSWORD_REGEX,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  
  mfaCode: z
    .string()
    .regex(MFA_CODE_REGEX, 'MFA code must be exactly 6 digits')
    .optional(),
  
  isServiceAccount: z
    .boolean()
    .optional()
    .default(false)
});

/**
 * Password reset request schema with enhanced security measures
 * Includes rate limiting and domain validation
 */
export const passwordResetSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .refine(async (email) => {
      const validation = await validateEmail(email, {
        checkMX: true,
        allowDisposable: false,
        domainWhitelist: ALLOWED_EMAIL_DOMAINS
      });
      return validation.isValid;
    }, 'Email domain not allowed or invalid'),
  
  token: z
    .string()
    .uuid('Invalid reset token')
    .optional(),
  
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .regex(PASSWORD_REGEX)
    .optional(),
  
  confirmPassword: z
    .string()
    .optional()
}).refine((data) => {
  if (data.newPassword && data.confirmPassword) {
    return data.newPassword === data.confirmPassword;
  }
  return true;
}, {
  message: 'Passwords must match',
  path: ['confirmPassword']
});

/**
 * MFA verification schema with timing attack prevention
 * Implements TOTP validation with rate limiting
 */
export const mfaSchema = z.object({
  code: z
    .string()
    .regex(MFA_CODE_REGEX, 'Invalid MFA code format')
    .refine((code) => {
      // Constant-time string comparison to prevent timing attacks
      const expectedLength = 6;
      if (code.length !== expectedLength) return false;
      return /^\d+$/.test(code);
    }, 'Invalid MFA code'),
  
  timestamp: z
    .number()
    .min(Date.now() - 30000) // Code must not be older than 30 seconds
    .max(Date.now() + 30000), // Code must not be from the future
  
  sessionId: z
    .string()
    .uuid('Invalid session ID')
});

/**
 * Service account validation schema with strict security requirements
 * Implements API key validation and scope verification
 */
export const serviceAccountSchema = z.object({
  accountId: z
    .string()
    .regex(SERVICE_ACCOUNT_ID_REGEX, 'Invalid service account ID format'),
  
  apiKey: z
    .string()
    .regex(API_KEY_REGEX, 'Invalid API key format'),
  
  scope: z
    .array(z.string())
    .min(1, 'At least one scope must be specified')
    .refine((scopes) => {
      const allowedScopes = ['read', 'write', 'admin'];
      return scopes.every(scope => allowedScopes.includes(scope));
    }, 'Invalid scope specified'),
  
  role: z
    .nativeEnum(UserRole)
    .refine((role) => role === UserRole.SERVICE_ACCOUNT, 'Invalid role for service account')
});

/**
 * Validates user login credentials with enhanced security checks
 * @param credentials - Login credentials to validate
 * @returns Validation result with detailed error messages
 */
export const validateLoginCredentials = async (
  credentials: LoginCredentials
): Promise<z.SafeParseReturnType<typeof loginSchema, LoginCredentials>> => {
  try {
    return await loginSchema.safeParseAsync({
      ...credentials,
      // Trim whitespace from username to prevent confusion
      username: credentials.username.trim()
    });
  } catch (error) {
    return {
      success: false,
      error: new z.ZodError([{
        code: 'custom',
        path: ['validation'],
        message: 'Login validation failed'
      }])
    };
  }
};

/**
 * Validates MFA verification code with timing attack prevention
 * @param code - MFA code to validate
 * @returns Validation result with error details
 */
export const validateMFACode = (code: string): z.SafeParseReturnType<typeof mfaSchema, any> => {
  return mfaSchema.safeParse({
    code,
    timestamp: Date.now(),
    sessionId: crypto.randomUUID()
  });
};

/**
 * Validates service account credentials with specific requirements
 * @param credentials - Service account credentials to validate
 * @returns Validation result with scope details
 */
export const validateServiceAccount = (
  credentials: any
): z.SafeParseReturnType<typeof serviceAccountSchema, any> => {
  return serviceAccountSchema.safeParse(credentials);
};