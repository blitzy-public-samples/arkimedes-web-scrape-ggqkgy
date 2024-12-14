// @reduxjs/toolkit v2.0.0
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
// axios-retry v3.8.0
import axiosRetry from 'axios-retry';
import { 
  AuthState, 
  AuthError, 
  LoginCredentials, 
  User, 
  AuthToken, 
  UserRole 
} from '../types/auth';
import { RootState } from './store';
import { encryptToken, decryptToken } from '../utils/encryption';

// Constants for authentication configuration
const AUTH_TIMEOUT_MINUTES = 30;
const MAX_RETRY_ATTEMPTS = 3;
const REFRESH_LOCK_KEY = 'auth_refresh_lock';

// Configure retry logic for authentication requests
axiosRetry(axios, { 
  retries: MAX_RETRY_ATTEMPTS,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           error.response?.status === 429;
  }
});

// Initial authentication state
const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
  error: null,
  mfaRequired: false,
  sessionTimeout: null
};

// Permission matrix for role-based access control
const permissionMatrix: Record<UserRole, string[]> = {
  [UserRole.ADMIN]: ['*'],
  [UserRole.OPERATOR]: ['task:read', 'task:write', 'data:read', 'data:write'],
  [UserRole.ANALYST]: ['task:read', 'data:read'],
  [UserRole.SERVICE_ACCOUNT]: ['data:write']
};

/**
 * Async thunk for handling user login with MFA support
 */
export const loginThunk = createAsyncThunk<
  { user: User; token: AuthToken },
  { credentials: LoginCredentials; mfaToken?: string },
  { rejectValue: AuthError }
>(
  'auth/login',
  async ({ credentials, mfaToken }, { rejectWithValue }) => {
    try {
      // Validate credentials
      if (!credentials.username || !credentials.password) {
        throw new Error('Invalid credentials');
      }

      const response = await axios.post('/api/v1/auth/login', {
        ...credentials,
        mfaToken
      });

      // Encrypt sensitive token data before storing
      const encryptedToken = encryptToken(response.data.token);

      return {
        user: response.data.user,
        token: encryptedToken
      };
    } catch (error) {
      return rejectWithValue({
        code: error.response?.status || 'UNKNOWN',
        message: error.response?.data?.message || 'Authentication failed',
        details: error.response?.data?.details || {}
      });
    }
  }
);

/**
 * Async thunk for automatic token refresh
 */
export const refreshTokenThunk = createAsyncThunk<
  AuthToken,
  void,
  { state: RootState; rejectValue: AuthError }
>(
  'auth/refresh',
  async (_, { getState, rejectWithValue }) => {
    // Implement refresh lock to prevent race conditions
    if (localStorage.getItem(REFRESH_LOCK_KEY)) {
      throw new Error('Token refresh already in progress');
    }

    try {
      localStorage.setItem(REFRESH_LOCK_KEY, 'true');
      const { auth } = getState();
      const decryptedToken = decryptToken(auth.token);

      const response = await axios.post('/api/v1/auth/refresh', {
        refreshToken: decryptedToken.refreshToken
      });

      return encryptToken(response.data.token);
    } catch (error) {
      return rejectWithValue({
        code: error.response?.status || 'UNKNOWN',
        message: 'Token refresh failed',
        details: error.response?.data?.details || {}
      });
    } finally {
      localStorage.removeItem(REFRESH_LOCK_KEY);
    }
  }
);

/**
 * Helper function to check user permissions based on role
 */
export const checkPermission = (permission: string, role: UserRole): boolean => {
  const userPermissions = permissionMatrix[role];
  return userPermissions.includes('*') || userPermissions.includes(permission);
};

/**
 * Authentication slice with enhanced security features
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.error = null;
      state.mfaRequired = false;
      state.sessionTimeout = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setSessionTimeout: (state, action: PayloadAction<number>) => {
      state.sessionTimeout = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      // Login thunk reducers
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.loading = false;
        state.error = null;
        state.mfaRequired = false;
        state.sessionTimeout = Date.now() + (AUTH_TIMEOUT_MINUTES * 60 * 1000);
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || null;
        state.mfaRequired = action.payload?.code === 'MFA_REQUIRED';
      })
      // Token refresh reducers
      .addCase(refreshTokenThunk.fulfilled, (state, action) => {
        state.token = action.payload;
        state.sessionTimeout = Date.now() + (AUTH_TIMEOUT_MINUTES * 60 * 1000);
      })
      .addCase(refreshTokenThunk.rejected, (state) => {
        // Force logout on refresh failure
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
      });
  }
});

// Export actions
export const { logout, clearError, setSessionTimeout } = authSlice.actions;

// Selector with permission checking capability
export const selectAuthWithPermissions = (state: RootState) => ({
  ...state.auth,
  checkPermission: (permission: string) => 
    state.auth.user ? checkPermission(permission, state.auth.user.role) : false
});

// Export reducer
export default authSlice.reducer;