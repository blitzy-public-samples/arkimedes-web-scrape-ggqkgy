/**
 * @fileoverview Root Redux store configuration with performance optimizations,
 * error handling, and monitoring capabilities for the web scraping platform.
 * @version 1.0.0
 */

// @reduxjs/toolkit v2.0.0
import { configureStore, Middleware } from '@reduxjs/toolkit';
// react-redux v9.0.0
import { TypedUseSelectorHook } from 'react-redux';

// Import reducers
import authReducer from './authSlice';
import dataReducer from './dataSlice';
import taskReducer from './taskSlice';
import settingsReducer from './settingsSlice';

/**
 * Custom error monitoring middleware for Redux actions
 */
const errorMonitoringMiddleware: Middleware = (store) => (next) => (action) => {
  try {
    return next(action);
  } catch (error) {
    console.error('[Redux Error]', {
      action: action.type,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

/**
 * Performance monitoring middleware for Redux actions
 */
const performanceMiddleware: Middleware = (store) => (next) => (action) => {
  const start = performance.now();
  const result = next(action);
  const duration = performance.now() - start;

  // Log slow actions (> 100ms)
  if (duration > 100) {
    console.warn('[Redux Performance]', {
      action: action.type,
      duration: `${duration.toFixed(2)}ms`,
      timestamp: new Date().toISOString()
    });
  }

  return result;
};

/**
 * Configures and creates the Redux store with performance optimizations
 * and monitoring capabilities.
 */
const configureAppStore = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      data: dataReducer,
      tasks: taskReducer,
      settings: settingsReducer
    },
    middleware: (getDefaultMiddleware) => 
      getDefaultMiddleware({
        // Performance optimizations
        serializableCheck: {
          // Ignore these action types for serialization checks
          ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
          // Ignore these field paths in the state
          ignoredPaths: ['data.validationResults', 'tasks.metrics']
        },
        // Enable immutability checks only in development
        immutableCheck: process.env.NODE_ENV === 'development',
        // Thunk middleware configuration
        thunk: {
          extraArgument: {
            // Add any extra arguments for thunks here
          }
        }
      }).concat([
        errorMonitoringMiddleware,
        performanceMiddleware
      ]),
    devTools: process.env.NODE_ENV !== 'production',
    // Performance optimizations for production
    ...(process.env.NODE_ENV === 'production' && {
      devTools: false,
      // Disable runtime checks in production
      enhancers: []
    })
  });

  // Enable hot module replacement for reducers in development
  if (process.env.NODE_ENV === 'development' && module.hot) {
    module.hot.accept([
      './authSlice',
      './dataSlice',
      './taskSlice',
      './settingsSlice'
    ], () => {
      store.replaceReducer({
        auth: require('./authSlice').default,
        data: require('./dataSlice').default,
        tasks: require('./taskSlice').default,
        settings: require('./settingsSlice').default
      });
    });
  }

  return store;
};

// Create store instance
export const store = configureAppStore();

// Infer the `RootState` type from the store
export type RootState = ReturnType<typeof store.getState>;

// Infer the `AppDispatch` type from the store
export type AppDispatch = typeof store.dispatch;

// Type-safe hooks for use throughout the application
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Export store instance and types
export default store;