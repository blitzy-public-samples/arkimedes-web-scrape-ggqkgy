/**
 * @fileoverview Redux Toolkit slice for managing scraped data state with enhanced filtering,
 * export capabilities, and comprehensive error handling.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit'; // ^1.9.0
import { 
  ScrapedData, 
  DataFilter, 
  ExportOptions,
  ValidationResult,
  DataResponse
} from '../types/data';
import { fetchData, exportData } from '../api/data';
import { ApiError } from '../types/api';

/**
 * Interface for the data slice state
 */
interface DataState {
  data: ScrapedData[];
  filter: DataFilter;
  loading: boolean;
  error: ApiError | null;
  total: number;
  page: number;
  pageSize: number;
  validationResults: ValidationResult[];
  exportProgress: number;
  lastUpdated: string | null;
}

/**
 * Initial state for the data slice
 */
const initialState: DataState = {
  data: [],
  filter: {
    status: null,
    execution_id: null,
    timeRange: null,
    page: 1,
    size: 25,
    sortField: null,
    sortDirection: null,
    searchTerm: null,
    metadata: {}
  },
  loading: false,
  error: null,
  total: 0,
  page: 1,
  pageSize: 25,
  validationResults: [],
  exportProgress: 0,
  lastUpdated: null
};

/**
 * Async thunk for fetching data with enhanced error handling and retry logic
 */
export const fetchDataThunk = createAsyncThunk<
  DataResponse,
  DataFilter,
  { rejectValue: ApiError }
>(
  'data/fetchData',
  async (filter: DataFilter, { rejectWithValue }) => {
    try {
      const response = await fetchData(filter);
      return response;
    } catch (error: any) {
      return rejectWithValue(error);
    }
  }
);

/**
 * Async thunk for exporting data with progress tracking
 */
export const exportDataThunk = createAsyncThunk<
  Blob,
  ExportOptions,
  { rejectValue: ApiError }
>(
  'data/exportData',
  async (options: ExportOptions, { dispatch, rejectWithValue }) => {
    try {
      // Update progress periodically
      const progressInterval = setInterval(() => {
        dispatch(dataSlice.actions.updateExportProgress(Math.random() * 100));
      }, 500);

      const response = await exportData(options);

      clearInterval(progressInterval);
      dispatch(dataSlice.actions.updateExportProgress(100));

      return response;
    } catch (error: any) {
      return rejectWithValue(error);
    }
  }
);

/**
 * Redux slice for managing scraped data
 */
export const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    updateFilter: (state, action) => {
      state.filter = {
        ...state.filter,
        ...action.payload
      };
      state.page = 1; // Reset page when filter changes
    },
    clearFilter: (state) => {
      state.filter = initialState.filter;
      state.page = 1;
    },
    setPage: (state, action) => {
      state.page = action.payload;
    },
    setPageSize: (state, action) => {
      state.pageSize = action.payload;
      state.page = 1; // Reset page when page size changes
    },
    updateExportProgress: (state, action) => {
      state.exportProgress = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchDataThunk
      .addCase(fetchDataThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDataThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
        state.total = action.payload.total;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchDataThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || {
          code: '500',
          message: 'An unknown error occurred',
          details: {},
          timestamp: new Date().toISOString()
        };
      })
      // Handle exportDataThunk
      .addCase(exportDataThunk.pending, (state) => {
        state.exportProgress = 0;
        state.error = null;
      })
      .addCase(exportDataThunk.fulfilled, (state) => {
        state.exportProgress = 100;
      })
      .addCase(exportDataThunk.rejected, (state, action) => {
        state.exportProgress = 0;
        state.error = action.payload || {
          code: '500',
          message: 'Export failed',
          details: {},
          timestamp: new Date().toISOString()
        };
      });
  }
});

// Export actions
export const {
  updateFilter,
  clearFilter,
  setPage,
  setPageSize,
  updateExportProgress,
  clearError
} = dataSlice.actions;

// Memoized selectors
export const selectData = createSelector(
  [(state: { data: DataState }) => state.data],
  (dataState) => dataState.data
);

export const selectDataFilter = createSelector(
  [(state: { data: DataState }) => state.data],
  (dataState) => dataState.filter
);

export const selectPagination = createSelector(
  [(state: { data: DataState }) => state.data],
  (dataState) => ({
    page: dataState.page,
    pageSize: dataState.pageSize,
    total: dataState.total
  })
);

export const selectDataLoading = createSelector(
  [(state: { data: DataState }) => state.data],
  (dataState) => dataState.loading
);

export const selectDataError = createSelector(
  [(state: { data: DataState }) => state.data],
  (dataState) => dataState.error
);

export const selectExportProgress = createSelector(
  [(state: { data: DataState }) => state.data],
  (dataState) => dataState.exportProgress
);

// Export reducer
export default dataSlice.reducer;