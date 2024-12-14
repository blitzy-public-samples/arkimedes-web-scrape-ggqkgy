/**
 * @fileoverview Authentication service implementation for the web scraping platform frontend.
 * Implements OAuth 2.0 + OIDC with enhanced security features including encrypted token storage,
 * service account support, and advanced token refresh mechanisms.
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.6.0
import jwtDecode from 'jwt-decode'; // ^4.0.0
import CryptoJS from 'crypto-js'; // ^4.2.0

import { User, LoginCredentials, AuthToken } from '../types/auth';
import { setItem, getItem, removeItem } from '../utils/storage';
import { API_CONFIG, API_ENDPOINTS } from '../config/api';

// Constants for token storage and management
const AUTH_TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
const TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes in milliseconds
const MAX_REFRESH_RETRIES = 3;

/**
 * Interface for token validation result
 */
interface TokenValidation {
  isValid: boolean;
  needsRefresh: boolean;
  error?: string;
}

/**
 * Encrypts sensitive data before storage
 * @param data - Data to encrypt
 */
const encryptData = (data: string): string => {
  const encryptionKey = process.env.VITE_ENCRYPTION_KEY || 'default-key';
  return CryptoJS.AES.encrypt(data, encryptionKey).toString();
};

/**
 * Decrypts stored sensitive data
 * @param encryptedData - Data to decrypt
 */
const decryptData = (encryptedData: string): string => {
  const encryptionKey = process.env.VITE_ENCRYPTION_KEY || 'default-key';
  const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
};

/**
 * Validates JWT token and checks if refresh is needed
 * @param token - Token to validate
 */
const validateToken = (token: string): TokenValidation => {
  try {
    const decoded = jwtDecode(token);
    const currentTime = Date.now() / 1000;

    if (!decoded.exp) {
      return { isValid: false, needsRefresh: false, error: 'Token has no expiration' };
    }

    if (decoded.exp < currentTime) {
      return { isValid: false, needsRefresh: true, error: 'Token expired' };
    }

    const timeUntilExpiry = (decoded.exp - currentTime) * 1000;
    const needsRefresh = timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD;

    return { isValid: true, needsRefresh };
  } catch (error) {
    return { isValid: false, needsRefresh: false, error: 'Invalid token format' };
  }
};

/**
 * Handles secure storage of authentication data
 * @param token - Authentication token to store
 * @param user - User data to store
 */
const storeAuthData = async (token: AuthToken, user: User): Promise<void> => {
  const encryptedToken = encryptData(JSON.stringify(token));
  const encryptedUser = encryptData(JSON.stringify(user));

  const tokenResult = await setItem(AUTH_TOKEN_KEY, encryptedToken, true);
  const userResult = await setItem(USER_KEY, encryptedUser, true);

  if (!tokenResult.success || !userResult.success) {
    throw new Error('Failed to store authentication data');
  }
};

/**
 * Retrieves stored authentication data
 */
const getStoredAuthData = async (): Promise<{ token: AuthToken | null; user: User | null }> => {
  const tokenResult = await getItem<string>(AUTH_TOKEN_KEY, true);
  const userResult = await getItem<string>(USER_KEY, true);

  let token: AuthToken | null = null;
  let user: User | null = null;

  if (tokenResult.success && tokenResult.data) {
    token = JSON.parse(decryptData(tokenResult.data));
  }

  if (userResult.success && userResult.data) {
    user = JSON.parse(decryptData(userResult.data));
  }

  return { token, user };
};

/**
 * Authenticates user with credentials and handles MFA if enabled
 * @param credentials - Login credentials
 */
export const login = async (
  credentials: LoginCredentials
): Promise<{ user: User; token: AuthToken }> => {
  try {
    const response = await axios.post(
      `${API_CONFIG.baseURL}${API_ENDPOINTS.auth.login.path}`,
      credentials,
      {
        headers: API_CONFIG.headers,
      }
    );

    const { user, token } = response.data;

    // Handle MFA challenge if required
    if (user.mfaEnabled && !credentials.mfaCode) {
      throw new Error('MFA_REQUIRED');
    }

    // Validate received token
    const validation = validateToken(token.accessToken);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid token received');
    }

    // Store authentication data securely
    await storeAuthData(token, user);

    return { user, token };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('Invalid credentials');
      }
      throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
};

/**
 * Enhanced token refresh with automatic refresh before expiry and retry mechanism
 */
export const refreshToken = async (): Promise<AuthToken> => {
  const { token: currentToken } = await getStoredAuthData();
  if (!currentToken) {
    throw new Error('No token available for refresh');
  }

  const validation = validateToken(currentToken.accessToken);
  if (!validation.needsRefresh && validation.isValid) {
    return currentToken;
  }

  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < MAX_REFRESH_RETRIES) {
    try {
      const response = await axios.post(
        `${API_CONFIG.baseURL}${API_ENDPOINTS.auth.refresh.path}`,
        { refreshToken: currentToken.refreshToken },
        {
          headers: {
            ...API_CONFIG.headers,
            Authorization: `Bearer ${currentToken.accessToken}`,
          },
        }
      );

      const newToken: AuthToken = response.data.token;
      const validation = validateToken(newToken.accessToken);
      
      if (!validation.isValid) {
        throw new Error('Received invalid token during refresh');
      }

      // Update stored token
      const { user } = await getStoredAuthData();
      if (user) {
        await storeAuthData(newToken, user);
      }

      return newToken;
    } catch (error) {
      lastError = error as Error;
      retryCount++;
      
      if (retryCount < MAX_REFRESH_RETRIES) {
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, retryCount) * 1000)
        );
      }
    }
  }

  throw new Error(`Token refresh failed after ${MAX_REFRESH_RETRIES} attempts: ${lastError?.message}`);
};

/**
 * Logs out the user and cleans up stored authentication data
 */
export const logout = async (): Promise<void> => {
  try {
    const { token } = await getStoredAuthData();
    if (token) {
      await axios.post(
        `${API_CONFIG.baseURL}${API_ENDPOINTS.auth.logout.path}`,
        {},
        {
          headers: {
            ...API_CONFIG.headers,
            Authorization: `Bearer ${token.accessToken}`,
          },
        }
      );
    }
  } finally {
    // Clean up stored data regardless of logout API call success
    await removeItem(AUTH_TOKEN_KEY);
    await removeItem(USER_KEY);
  }
};