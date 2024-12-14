/**
 * @fileoverview A comprehensive data filtering component that provides advanced filtering
 * capabilities for the data explorer interface with accessibility compliance and
 * optimized performance.
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useEffect } from 'react'; // v18.2.0
import { 
  Grid, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  TextField,
  CircularProgress 
} from '@mui/material'; // v5.14.0
import { DatePicker } from '@mui/x-date-pickers'; // v6.10.0
import { useForm, Controller } from 'react-hook-form'; // v7.45.0
import debounce from 'lodash/debounce'; // v4.17.21

// Internal imports
import { DataFilter, DataStatus } from '../../types/data';
import { validateDataFilter } from '../../validation/data';
import SearchBar from '../common/SearchBar';
import ErrorBoundary from '../common/ErrorBoundary';

// Constants
const DEFAULT_DEBOUNCE_MS = 300;

const FILTER_ERROR_MESSAGES = {
  INVALID_STATUS: 'Invalid status selected',
  INVALID_DATE_RANGE: 'Invalid date range',
  INVALID_SEARCH: 'Invalid search query'
} as const;

// Status options for the dropdown
const STATUS_OPTIONS: DataStatus[] = ['pending', 'valid', 'invalid', 'error'];

/**
 * Props interface for the DataFilters component
 */
interface DataFiltersProps {
  /** Current filter state */
  filters: DataFilter;
  /** Callback for filter changes */
  onFilterChange: (filters: DataFilter) => void;
  /** Loading state indicator */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
}

/**
 * A comprehensive data filtering component that provides advanced filtering capabilities
 * with accessibility compliance and optimized performance.
 */
const DataFilters: React.FC<DataFiltersProps> = ({
  filters,
  onFilterChange,
  isLoading = false,
  error = null
}) => {
  // Initialize form with react-hook-form
  const { control, watch, setValue, formState: { errors } } = useForm<DataFilter>({
    defaultValues: filters,
    mode: 'onChange'
  });

  // Watch form values for changes
  const formValues = watch();

  // Debounced filter change handler
  const debouncedFilterChange = useMemo(
    () => debounce((newFilters: DataFilter) => {
      const validationResult = validateDataFilter(newFilters);
      if (validationResult.isValid) {
        onFilterChange(validationResult.sanitizedFilter as DataFilter);
      }
    }, DEFAULT_DEBOUNCE_MS),
    [onFilterChange]
  );

  // Effect to handle form value changes
  useEffect(() => {
    debouncedFilterChange(formValues);
    return () => {
      debouncedFilterChange.cancel();
    };
  }, [formValues, debouncedFilterChange]);

  // Handle status change
  const handleStatusChange = useCallback((status: DataStatus | null) => {
    setValue('status', status);
  }, [setValue]);

  // Handle search query change
  const handleSearchChange = useCallback((searchTerm: string) => {
    setValue('searchTerm', searchTerm);
  }, [setValue]);

  return (
    <ErrorBoundary>
      <Grid container spacing={3} aria-label="Data filters">
        {/* Status Filter */}
        <Grid item xs={12} md={4}>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth error={!!errors.status}>
                <InputLabel id="status-filter-label">Status</InputLabel>
                <Select
                  {...field}
                  labelId="status-filter-label"
                  label="Status"
                  disabled={isLoading}
                  value={field.value || ''}
                  onChange={(e) => handleStatusChange(e.target.value as DataStatus)}
                  aria-describedby={errors.status ? 'status-error-text' : undefined}
                >
                  <MenuItem value="">All</MenuItem>
                  {STATUS_OPTIONS.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
                {errors.status && (
                  <span id="status-error-text" className="error-text">
                    {FILTER_ERROR_MESSAGES.INVALID_STATUS}
                  </span>
                )}
              </FormControl>
            )}
          />
        </Grid>

        {/* Date Range Filter */}
        <Grid item xs={12} md={4}>
          <Controller
            name="timeRange"
            control={control}
            render={({ field }) => (
              <DatePicker
                {...field}
                label="Time Range"
                disabled={isLoading}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!errors.timeRange,
                    helperText: errors.timeRange ? FILTER_ERROR_MESSAGES.INVALID_DATE_RANGE : undefined
                  }
                }}
                onChange={(date) => {
                  field.onChange(date);
                }}
              />
            )}
          />
        </Grid>

        {/* Search Filter */}
        <Grid item xs={12} md={4}>
          <Controller
            name="searchTerm"
            control={control}
            render={({ field }) => (
              <SearchBar
                value={field.value || ''}
                onChange={handleSearchChange}
                placeholder="Search data..."
                isLoading={isLoading}
                error={!!errors.searchTerm}
                errorText={errors.searchTerm ? FILTER_ERROR_MESSAGES.INVALID_SEARCH : undefined}
                debounceMs={DEFAULT_DEBOUNCE_MS}
                fullWidth
                ariaLabel="Search data content"
              />
            )}
          />
        </Grid>

        {/* Loading Indicator */}
        {isLoading && (
          <Grid item xs={12} display="flex" justifyContent="center">
            <CircularProgress size={24} aria-label="Loading filters" />
          </Grid>
        )}

        {/* Error Display */}
        {error && (
          <Grid item xs={12}>
            <div role="alert" className="error-message">
              {error.message}
            </div>
          </Grid>
        )}
      </Grid>
    </ErrorBoundary>
  );
};

export default DataFilters;