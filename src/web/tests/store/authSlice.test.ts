// @reduxjs/toolkit v2.0.0
import { configureStore } from '@reduxjs/toolkit';
// @testing-library/react v14.0.0
import { renderHook } from '@testing-library/react';
// vitest v0.34.0
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import authReducer, {
  loginThunk,
  refreshTokenThunk,
  logout,
  clearError,
  setSessionTimeout,
  selectAuthWithPermissions,
  checkPermission
} from '../../src/store/authSlice';

import {
  AuthState,
  User,
  AuthToken,
  UserRole,
  LoginCredentials
} from '../../src/types/auth';

// Mock auth service and token storage
vi.mock('../../src/services/auth');
vi.mock('../../src/utils/tokenStorage');

// Test data constants
const mockUser: User = {
  id: 'test-user-id',
  username: 'testuser',
  email: 'test@example.com',
  role: UserRole.OPERATOR,
  permissions: ['task:read', 'task:write', 'data:read', 'data:write'],
  mfaEnabled: true,
  lastLogin: '2024-01-20T00:00:00Z',
  isServiceAccount: false
};

const mockToken: AuthToken = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600,
  tokenType: 'Bearer',
  scope: 'full_access'
};

// Helper function to setup test store
const setupTestStore = (initialState?: Partial<AuthState>) => {
  return configureStore({
    reducer: {
      auth: authReducer
    },
    preloadedState: {
      auth: {
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null,
        mfaRequired: false,
        sessionTimeout: null,
        ...initialState
      }
    }
  });
};

describe('Authentication State Management', () => {
  let store: ReturnType<typeof setupTestStore>;

  beforeEach(() => {
    store = setupTestStore();
    vi.clearAllMocks();
  });

  it('should start with initial unauthenticated state', () => {
    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.error).toBeNull();
  });

  it('should handle successful login', async () => {
    const credentials: LoginCredentials = {
      username: 'testuser',
      password: 'password123'
    };

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { user: mockUser, token: mockToken }
    });

    await store.dispatch(loginThunk({ credentials }));
    const state = store.getState().auth;

    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
    expect(state.token).toBeDefined();
    expect(state.error).toBeNull();
  });

  it('should handle login with MFA requirement', async () => {
    const credentials: LoginCredentials = {
      username: 'testuser',
      password: 'password123'
    };

    vi.mocked(axios.post).mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          code: 'MFA_REQUIRED',
          message: 'MFA verification required'
        }
      }
    });

    await store.dispatch(loginThunk({ credentials }));
    const state = store.getState().auth;

    expect(state.mfaRequired).toBe(true);
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBeDefined();
  });

  it('should handle login failure', async () => {
    const credentials: LoginCredentials = {
      username: 'testuser',
      password: 'wrongpassword'
    };

    vi.mocked(axios.post).mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          message: 'Invalid credentials'
        }
      }
    });

    await store.dispatch(loginThunk({ credentials }));
    const state = store.getState().auth;

    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBeDefined();
    expect(state.user).toBeNull();
  });

  it('should handle token refresh', async () => {
    const newToken: AuthToken = {
      ...mockToken,
      accessToken: 'new-access-token'
    };

    store = setupTestStore({
      isAuthenticated: true,
      user: mockUser,
      token: mockToken
    });

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { token: newToken }
    });

    await store.dispatch(refreshTokenThunk());
    const state = store.getState().auth;

    expect(state.token).toEqual(newToken);
    expect(state.isAuthenticated).toBe(true);
  });

  it('should handle logout', () => {
    store = setupTestStore({
      isAuthenticated: true,
      user: mockUser,
      token: mockToken
    });

    store.dispatch(logout());
    const state = store.getState().auth;

    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });
});

describe('Role-Based Access Control', () => {
  it('should correctly check permissions for admin role', () => {
    expect(checkPermission('any:permission', UserRole.ADMIN)).toBe(true);
  });

  it('should correctly check permissions for operator role', () => {
    expect(checkPermission('task:write', UserRole.OPERATOR)).toBe(true);
    expect(checkPermission('system:admin', UserRole.OPERATOR)).toBe(false);
  });

  it('should correctly check permissions for analyst role', () => {
    expect(checkPermission('data:read', UserRole.ANALYST)).toBe(true);
    expect(checkPermission('task:write', UserRole.ANALYST)).toBe(false);
  });

  it('should handle permission checks with auth selector', () => {
    const store = setupTestStore({
      isAuthenticated: true,
      user: mockUser
    });

    const state = store.getState();
    const authWithPermissions = selectAuthWithPermissions(state);

    expect(authWithPermissions.checkPermission('task:write')).toBe(true);
    expect(authWithPermissions.checkPermission('system:admin')).toBe(false);
  });
});

describe('Multi-Factor Authentication', () => {
  let store: ReturnType<typeof setupTestStore>;

  beforeEach(() => {
    store = setupTestStore();
  });

  it('should handle MFA verification success', async () => {
    const credentials: LoginCredentials = {
      username: 'testuser',
      password: 'password123'
    };

    const mfaToken = '123456';

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { user: mockUser, token: mockToken }
    });

    await store.dispatch(loginThunk({ credentials, mfaToken }));
    const state = store.getState().auth;

    expect(state.isAuthenticated).toBe(true);
    expect(state.mfaRequired).toBe(false);
    expect(state.user).toEqual(mockUser);
  });

  it('should handle invalid MFA code', async () => {
    const credentials: LoginCredentials = {
      username: 'testuser',
      password: 'password123'
    };

    const mfaToken = 'invalid';

    vi.mocked(axios.post).mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          code: 'INVALID_MFA',
          message: 'Invalid MFA code'
        }
      }
    });

    await store.dispatch(loginThunk({ credentials, mfaToken }));
    const state = store.getState().auth;

    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBeDefined();
    expect(state.error?.message).toContain('Invalid MFA code');
  });

  it('should handle MFA timeout', async () => {
    store = setupTestStore({
      mfaRequired: true
    });

    const timeoutDuration = 5 * 60 * 1000; // 5 minutes
    store.dispatch(setSessionTimeout(Date.now() + timeoutDuration));
    
    const state = store.getState().auth;
    expect(state.sessionTimeout).toBeDefined();
    expect(state.sessionTimeout).toBeGreaterThan(Date.now());
  });
});

describe('Error Handling', () => {
  let store: ReturnType<typeof setupTestStore>;

  beforeEach(() => {
    store = setupTestStore();
  });

  it('should clear error state', () => {
    store = setupTestStore({
      error: 'Previous error'
    });

    store.dispatch(clearError());
    const state = store.getState().auth;

    expect(state.error).toBeNull();
  });

  it('should handle network errors during login', async () => {
    const credentials: LoginCredentials = {
      username: 'testuser',
      password: 'password123'
    };

    vi.mocked(axios.post).mockRejectedValueOnce({
      message: 'Network Error'
    });

    await store.dispatch(loginThunk({ credentials }));
    const state = store.getState().auth;

    expect(state.error).toBeDefined();
    expect(state.error?.code).toBe('UNKNOWN');
  });

  it('should handle token refresh failures', async () => {
    store = setupTestStore({
      isAuthenticated: true,
      user: mockUser,
      token: mockToken
    });

    vi.mocked(axios.post).mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          message: 'Invalid refresh token'
        }
      }
    });

    await store.dispatch(refreshTokenThunk());
    const state = store.getState().auth;

    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });
});