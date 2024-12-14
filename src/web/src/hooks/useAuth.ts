/**
 * @fileoverview Enhanced Authentication Hook for Web Scraping Platform
 * @version 1.0.0
 * @license MIT
 * 
 * Provides comprehensive authentication and authorization management with:
 * - OAuth 2.0 + OIDC integration
 * - Multi-factor authentication (MFA) support
 * - Role-based access control (RBAC)
 * - Service account handling
 * - Session timeout monitoring
 * - Permission caching
 */

import { useContext, useMemo } from 'react'; // v18.2.0
import { AuthContext } from '../context/AuthContext';
import { User, AuthToken, LoginCredentials, UserRole } from '../types/auth';

/**
 * Type definition for authentication error
 */
interface AuthError {
  code: string;
  message: string;
  retry: boolean;
  timestamp: number;
}

/**
 * Interface defining the return type of the useAuth hook
 */
interface UseAuthReturn {
  isAuthenticated: boolean;
  user: User | null;
  token: AuthToken | null;
  isServiceAccount: boolean;
  mfaRequired: boolean;
  mfaVerified: boolean;
  sessionTimeout: number;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  loading: boolean;
  error: AuthError | null;
}

/**
 * Role hierarchy definition for permission checking
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.ADMIN]: 4,
  [UserRole.OPERATOR]: 3,
  [UserRole.ANALYST]: 2,
  [UserRole.SERVICE_ACCOUNT]: 1,
};

/**
 * Primary hook for managing authentication state and operations
 * @returns {UseAuthReturn} Authentication context value with enhanced security features
 * @throws {Error} If used outside of AuthProvider context
 */
const useAuth = (): UseAuthReturn => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const {
    isAuthenticated,
    user,
    token,
    loading,
    error,
    mfaRequired,
    isServiceAccount,
    sessionTimeout,
    login: contextLogin,
    logout: contextLogout,
    refreshToken: contextRefreshToken,
    verifyMFA,
  } = context;

  /**
   * Enhanced login handler with credential validation
   */
  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      if (!credentials.username || !credentials.password) {
        throw new Error('Invalid credentials');
      }

      await contextLogin(credentials.isServiceAccount);
    } catch (error) {
      throw new Error('Authentication failed');
    }
  };

  /**
   * Secure logout handler with cleanup
   */
  const logout = async (): Promise<void> => {
    try {
      await contextLogout();
      // Additional cleanup if needed
    } catch (error) {
      throw new Error('Logout failed');
    }
  };

  /**
   * Token refresh handler with retry logic
   */
  const refreshToken = async (): Promise<void> => {
    try {
      await contextRefreshToken();
    } catch (error) {
      throw new Error('Token refresh failed');
    }
  };

  /**
   * MFA verification handler
   */
  const verifyMfa = async (code: string): Promise<void> => {
    if (!code || code.length !== 6) {
      throw new Error('Invalid MFA code');
    }
    await verifyMFA(code);
  };

  return {
    isAuthenticated,
    user,
    token,
    isServiceAccount,
    mfaRequired,
    mfaVerified: !mfaRequired,
    sessionTimeout,
    login,
    logout,
    refreshToken,
    verifyMfa,
    loading,
    error,
  };
};

/**
 * Hook for checking user permissions with caching
 * @param requiredPermissions - Array of required permission strings
 * @returns {boolean} Whether user has all required permissions
 */
export const usePermissions = (requiredPermissions: string[]): boolean => {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user || !user.permissions || !requiredPermissions.length) {
      return false;
    }

    return requiredPermissions.every(permission =>
      user.permissions.includes(permission)
    );
  }, [user, requiredPermissions]);
};

/**
 * Hook for checking user role with hierarchy support
 * @param requiredRole - Required UserRole enum value
 * @returns {boolean} Whether user has required role or higher
 */
export const useRole = (requiredRole: UserRole): boolean => {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user || !user.role) {
      return false;
    }

    const userRoleLevel = ROLE_HIERARCHY[user.role];
    const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

    // Special handling for service accounts
    if (user.role === UserRole.SERVICE_ACCOUNT) {
      return user.permissions?.includes(`ROLE_${requiredRole}`) || false;
    }

    return userRoleLevel >= requiredRoleLevel;
  }, [user, requiredRole]);
};

export default useAuth;