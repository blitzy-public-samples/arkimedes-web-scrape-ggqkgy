/**
 * @fileoverview Enhanced Authentication Context Provider for Web Scraping Platform
 * @version 1.0.0
 * @license MIT
 * 
 * Implements comprehensive authentication management with:
 * - OAuth 2.0 + OIDC integration via Auth0
 * - Multi-factor authentication (MFA) support
 * - Service account handling
 * - Role-based access control
 * - Secure token management
 * - Session timeout monitoring
 */

import React, { createContext, useContext, useEffect, useCallback, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react'; // v2.0.0
import jwtDecode from 'jwt-decode'; // v3.1.2
import { User, AuthToken, UserRole } from '../types/auth';

// Constants for authentication configuration
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const AUTH_CONTEXT_ERROR = 'useAuth must be used within an AuthProvider';

/**
 * Structured error type for authentication failures
 */
interface AuthError {
  code: string;
  message: string;
  retry: boolean;
  timestamp: number;
}

/**
 * Enhanced type definition for authentication context value
 */
interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: AuthToken | null;
  loading: boolean;
  error: AuthError | null;
  mfaRequired: boolean;
  isServiceAccount: boolean;
  sessionTimeout: number | null;
  login: (isServiceAccount?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setupMFA: () => Promise<{ qrCode: string; secret: string }>;
  verifyMFA: (code: string) => Promise<boolean>;
  resetError: () => void;
}

// Create the authentication context with enhanced type safety
const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Enhanced Authentication Provider Component
 * Manages authentication state and operations with comprehensive security features
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    isAuthenticated: auth0IsAuthenticated,
    user: auth0User,
    getAccessTokenSilently,
    loginWithRedirect,
    logout: auth0Logout,
  } = useAuth0();

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<AuthToken | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [mfaRequired, setMfaRequired] = useState<boolean>(false);
  const [isServiceAccount, setIsServiceAccount] = useState<boolean>(false);
  const [sessionTimeout, setSessionTimeout] = useState<number | null>(null);

  /**
   * Validates and processes the JWT token
   */
  const processToken = useCallback(async (accessToken: string): Promise<void> => {
    try {
      const decodedToken = jwtDecode<any>(accessToken);
      
      // Validate token expiration
      if (decodedToken.exp * 1000 < Date.now()) {
        throw new Error('Token expired');
      }

      // Set session timeout
      setSessionTimeout(decodedToken.exp * 1000 - Date.now());

      // Process user information from token
      const userInfo: User = {
        id: decodedToken.sub,
        role: decodedToken.role as UserRole,
        mfaEnabled: decodedToken.mfa_enabled || false,
        // ... other user properties
      };

      setUser(userInfo);
      setMfaRequired(decodedToken.mfa_required || false);
      setIsServiceAccount(userInfo.role === UserRole.SERVICE_ACCOUNT);

    } catch (err) {
      setError({
        code: 'TOKEN_PROCESSING_ERROR',
        message: 'Failed to process authentication token',
        retry: true,
        timestamp: Date.now(),
      });
    }
  }, []);

  /**
   * Refreshes the authentication token
   */
  const refreshToken = useCallback(async (): Promise<void> => {
    try {
      const accessToken = await getAccessTokenSilently();
      await processToken(accessToken);
    } catch (err) {
      setError({
        code: 'TOKEN_REFRESH_ERROR',
        message: 'Failed to refresh authentication token',
        retry: true,
        timestamp: Date.now(),
      });
    }
  }, [getAccessTokenSilently, processToken]);

  /**
   * Handles MFA setup process
   */
  const setupMFA = async (): Promise<{ qrCode: string; secret: string }> => {
    if (!user) {
      throw new Error('User must be authenticated to setup MFA');
    }

    try {
      const response = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token?.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to setup MFA');
      }

      const mfaSetup = await response.json();
      return {
        qrCode: mfaSetup.qrCode,
        secret: mfaSetup.secret,
      };
    } catch (err) {
      setError({
        code: 'MFA_SETUP_ERROR',
        message: 'Failed to setup MFA',
        retry: true,
        timestamp: Date.now(),
      });
      throw err;
    }
  };

  /**
   * Verifies MFA code
   */
  const verifyMFA = async (code: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token?.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error('Invalid MFA code');
      }

      setMfaRequired(false);
      return true;
    } catch (err) {
      setError({
        code: 'MFA_VERIFICATION_ERROR',
        message: 'Failed to verify MFA code',
        retry: true,
        timestamp: Date.now(),
      });
      return false;
    }
  };

  /**
   * Initializes authentication session
   */
  useEffect(() => {
    let retryCount = 0;
    let refreshInterval: NodeJS.Timeout;

    const initializeAuth = async () => {
      try {
        if (auth0IsAuthenticated && auth0User) {
          const accessToken = await getAccessTokenSilently();
          await processToken(accessToken);
          setLoading(false);
        }
      } catch (err) {
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          retryCount++;
          setTimeout(initializeAuth, 1000 * retryCount);
        } else {
          setError({
            code: 'AUTH_INITIALIZATION_ERROR',
            message: 'Failed to initialize authentication',
            retry: false,
            timestamp: Date.now(),
          });
          setLoading(false);
        }
      }
    };

    if (auth0IsAuthenticated) {
      initializeAuth();
      refreshInterval = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL);
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [auth0IsAuthenticated, auth0User, getAccessTokenSilently, processToken, refreshToken]);

  const contextValue: AuthContextType = {
    isAuthenticated: auth0IsAuthenticated && !mfaRequired,
    user,
    token,
    loading,
    error,
    mfaRequired,
    isServiceAccount,
    sessionTimeout,
    login: async (isServiceAccount = false) => {
      await loginWithRedirect({
        appState: { isServiceAccount },
      });
    },
    logout: async () => {
      await auth0Logout({ returnTo: window.location.origin });
      setUser(null);
      setToken(null);
    },
    refreshToken,
    setupMFA,
    verifyMFA,
    resetError: () => setError(null),
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook for accessing authentication context
 * Provides type-safe access to authentication state and operations
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(AUTH_CONTEXT_ERROR);
  }
  return context;
};

export default AuthContext;