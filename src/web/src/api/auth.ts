/**
 * @fileoverview Authentication API client implementation for the web scraping platform.
 * Implements OAuth 2.0 + OIDC authentication with JWT tokens and MFA support.
 * @version 1.0.0
 */

import axios, { AxiosInstance } from 'axios'; // ^1.6.0
import jwtDecode from 'jwt-decode'; // ^4.0.0
import {
  User,
  LoginCredentials,
  AuthToken,
  MFASetupResponse,
  CustomJwtPayload
} from '../types/auth';
import { API_CONFIG, API_ENDPOINTS } from '../config/api';

// Constants for token management and rate limiting
const TOKEN_EXPIRY_BUFFER = 300; // 5 minutes in seconds
const MFA_MAX_ATTEMPTS = 3;
const MFA_BACKOFF_BASE = 2000; // Base delay in milliseconds

/**
 * Creates an axios instance with authentication and rate limiting configuration
 */
const createAuthClient = (token?: string): AxiosInstance => {
  const client = axios.create({
    ...API_CONFIG,
    headers: {
      ...API_CONFIG.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
      'X-Rate-Limit': `${API_CONFIG.rateLimiting.maxRequests}/${API_CONFIG.rateLimiting.perMinute}`
    }
  });

  // Add retry interceptor
  client.interceptors.response.use(
    response => response,
    async error => {
      const { config, response } = error;
      
      if (!config || !response) {
        return Promise.reject(error);
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers['retry-after'] || API_CONFIG.rateLimiting.retryAfter;
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        return client(config);
      }

      // Handle token expiration
      if (response.status === 401 && !config._retry) {
        config._retry = true;
        try {
          const newToken = await refreshToken(localStorage.getItem('refreshToken') || '');
          config.headers.Authorization = `Bearer ${newToken.accessToken}`;
          return client(config);
        } catch (refreshError) {
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
};

/**
 * Validates JWT token structure and expiration
 */
const validateToken = (token: string): boolean => {
  try {
    const decoded = jwtDecode<CustomJwtPayload>(token);
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp ? decoded.exp > currentTime + TOKEN_EXPIRY_BUFFER : false;
  } catch {
    return false;
  }
};

/**
 * Authenticates user with credentials and handles MFA if enabled
 */
export const login = async (credentials: LoginCredentials): Promise<{ user: User; token: AuthToken }> => {
  const client = createAuthClient();
  
  try {
    const { data } = await client.post(
      API_ENDPOINTS.auth.login.path,
      credentials
    );

    if (data.mfaRequired && !credentials.mfaCode) {
      throw new Error('MFA_REQUIRED');
    }

    if (!validateToken(data.token.accessToken)) {
      throw new Error('INVALID_TOKEN');
    }

    // Store refresh token securely
    localStorage.setItem('refreshToken', data.token.refreshToken);

    return {
      user: data.user,
      token: data.token
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('INVALID_CREDENTIALS');
      }
      throw new Error(error.response?.data?.message || 'LOGIN_FAILED');
    }
    throw error;
  }
};

/**
 * Logs out user and invalidates current session
 */
export const logout = async (): Promise<void> => {
  const client = createAuthClient(localStorage.getItem('accessToken') || '');
  
  try {
    await client.post(API_ENDPOINTS.auth.logout.path);
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
};

/**
 * Refreshes access token using refresh token with enhanced validation
 */
export const refreshToken = async (refreshToken: string): Promise<AuthToken> => {
  if (!refreshToken) {
    throw new Error('MISSING_REFRESH_TOKEN');
  }

  const client = createAuthClient();
  
  try {
    const { data } = await client.post(
      API_ENDPOINTS.auth.refresh.path,
      { refreshToken }
    );

    if (!validateToken(data.accessToken)) {
      throw new Error('INVALID_TOKEN');
    }

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error('TOKEN_REFRESH_FAILED');
    }
    throw error;
  }
};

/**
 * Initiates MFA setup for user with enhanced security
 */
export const setupMFA = async (): Promise<MFASetupResponse> => {
  const client = createAuthClient(localStorage.getItem('accessToken') || '');
  
  try {
    const { data } = await client.post(API_ENDPOINTS.auth.mfa.setup.path);
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error('MFA_SETUP_FAILED');
    }
    throw error;
  }
};

/**
 * Verifies MFA code during login or setup with rate limiting
 */
export const verifyMFA = async (code: string): Promise<boolean> => {
  const client = createAuthClient(localStorage.getItem('accessToken') || '');
  let attempts = 0;
  
  const verify = async (): Promise<boolean> => {
    try {
      const { data } = await client.post(API_ENDPOINTS.auth.mfa.verify.path, { code });
      return data.verified;
    } catch (error) {
      attempts++;
      
      if (attempts >= MFA_MAX_ATTEMPTS) {
        throw new Error('MFA_MAX_ATTEMPTS_EXCEEDED');
      }

      // Implement exponential backoff
      const delay = Math.min(
        MFA_BACKOFF_BASE * Math.pow(2, attempts - 1),
        API_CONFIG.retryConfig.maxDelayMs
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return verify();
    }
  };

  return verify();
};