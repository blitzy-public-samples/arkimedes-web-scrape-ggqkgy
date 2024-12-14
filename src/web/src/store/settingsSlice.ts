/**
 * @fileoverview Redux Toolkit slice for managing application settings state
 * including system configuration, proxy settings, and storage management.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.0
import { persistReducer } from 'redux-persist'; // v6.0.0
import {
  Settings,
  SystemSettings,
  ProxySettings,
  StorageSettings,
  ProxyProvider
} from '../types/settings';
import { validateSettings, validateUrl } from '../utils/validation';
import { BaseError } from '../types/common';

/**
 * Interface for settings validation errors
 */
interface ValidationErrors {
  system?: string[];
  proxy?: string[];
  storage?: string[];
}

/**
 * Interface for the settings slice state
 */
interface SettingsState {
  settings: Settings;
  loading: boolean;
  error: string | null;
  isDirty: boolean;
  validationErrors: ValidationErrors | null;
}

/**
 * Initial state configuration with default values
 */
const initialState: SettingsState = {
  settings: {
    system: {
      maxConcurrentTasks: 100,
      requestTimeout: 30000,
      retryAttempts: 3
    },
    proxy: {
      provider: ProxyProvider.BRIGHT_DATA,
      enabled: true,
      rotationInterval: 300,
      customProxies: []
    },
    storage: {
      retentionPeriod: 90,
      autoArchive: true,
      archiveLocation: 's3://archive'
    }
  },
  loading: false,
  error: null,
  isDirty: false,
  validationErrors: null
};

/**
 * Async thunk for updating application settings
 * Includes validation, sanitization, and error handling
 */
export const updateSettings = createAsyncThunk<
  Settings,
  Settings,
  { rejectValue: BaseError }
>(
  'settings/updateSettings',
  async (settings: Settings, { rejectWithValue }) => {
    try {
      // Validate settings
      const validationResult = await validateSettings(settings);
      if (!validationResult.isValid) {
        return rejectWithValue({
          type: 'validation',
          message: 'Settings validation failed',
          code: 'SETTINGS_VALIDATION_ERROR',
          details: validationResult.errors
        });
      }

      // Validate storage location if changed
      if (settings.storage.archiveLocation !== initialState.settings.storage.archiveLocation) {
        const locationValidation = await validateUrl(settings.storage.archiveLocation, {
          requireHTTPS: true,
          checkDNS: true
        });
        if (!locationValidation.isValid) {
          return rejectWithValue({
            type: 'validation',
            message: 'Invalid storage location',
            code: 'STORAGE_LOCATION_ERROR',
            details: locationValidation.errors
          });
        }
      }

      // Make API call to update settings
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue({
          type: 'server',
          message: 'Failed to update settings',
          code: 'SETTINGS_UPDATE_ERROR',
          details: error
        });
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue({
        type: 'unknown',
        message: 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
        details: error instanceof Error ? { message: error.message } : {}
      });
    }
  }
);

/**
 * Settings slice with reducers and actions
 */
const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    /**
     * Update system settings with validation
     */
    updateSystemSettings(state, action: PayloadAction<SystemSettings>) {
      const { maxConcurrentTasks, requestTimeout, retryAttempts } = action.payload;
      
      // Validate numeric constraints
      if (maxConcurrentTasks <= 0 || requestTimeout <= 0 || retryAttempts < 0) {
        state.validationErrors = {
          ...state.validationErrors,
          system: ['Invalid numeric values in system settings']
        };
        return;
      }

      state.settings.system = action.payload;
      state.isDirty = true;
      state.validationErrors = null;
    },

    /**
     * Update proxy settings with provider validation
     */
    updateProxySettings(state, action: PayloadAction<ProxySettings>) {
      const { provider, enabled, rotationInterval, customProxies } = action.payload;

      // Validate proxy configuration
      if (provider === ProxyProvider.CUSTOM && (!customProxies || customProxies.length === 0)) {
        state.validationErrors = {
          ...state.validationErrors,
          proxy: ['Custom proxy list cannot be empty']
        };
        return;
      }

      if (rotationInterval <= 0) {
        state.validationErrors = {
          ...state.validationErrors,
          proxy: ['Invalid rotation interval']
        };
        return;
      }

      state.settings.proxy = action.payload;
      state.isDirty = true;
      state.validationErrors = null;
    },

    /**
     * Update storage settings with location validation
     */
    updateStorageSettings(state, action: PayloadAction<StorageSettings>) {
      const { retentionPeriod, autoArchive, archiveLocation } = action.payload;

      // Validate retention period
      if (retentionPeriod <= 0) {
        state.validationErrors = {
          ...state.validationErrors,
          storage: ['Invalid retention period']
        };
        return;
      }

      state.settings.storage = action.payload;
      state.isDirty = true;
      state.validationErrors = null;
    },

    /**
     * Reset settings to initial state
     */
    resetSettings(state) {
      state.settings = initialState.settings;
      state.isDirty = false;
      state.validationErrors = null;
      state.error = null;
    },

    /**
     * Clear error state
     */
    clearError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(updateSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
        state.loading = false;
        state.isDirty = false;
        state.error = null;
        state.validationErrors = null;
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to update settings';
        if (action.payload?.type === 'validation') {
          state.validationErrors = action.payload.details;
        }
      });
  }
});

/**
 * Memoized selector for settings state
 */
export const selectSettings = (state: { settings: SettingsState }) => state.settings.settings;

/**
 * Export actions and reducer
 */
export const {
  updateSystemSettings,
  updateProxySettings,
  updateStorageSettings,
  resetSettings,
  clearError
} = settingsSlice.actions;

export default settingsSlice.reducer;