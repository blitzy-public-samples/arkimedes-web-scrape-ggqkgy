/**
 * @fileoverview React component for configuring web scraping tasks with comprehensive validation,
 * real-time feedback, and optimized performance. Implements Material Design patterns.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  Grid,
  TextField,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  FormControlLabel,
  Switch,
  CircularProgress
} from '@mui/material'; // v5.14.0
import { useForm, Controller } from 'react-hook-form'; // v7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // v3.3.0

import { TaskConfiguration, TaskValidationError } from '../../types/task';
import { taskConfigurationSchema } from '../../validation/task';
import ExtractorConfig from './extractors/ExtractorConfig';
import { useDebounce } from '../../hooks/useDebounce';

// Constants for configuration
const VALIDATION_DEBOUNCE_MS = 300;
const DEFAULT_SCHEDULE = {
  frequency: 'hourly',
  startDate: new Date().toISOString(),
  endDate: null,
  timeZone: 'UTC'
};

const VALIDATION_ERROR_MESSAGES = {
  invalidUrl: 'Please enter a valid URL',
  invalidSchedule: 'Invalid schedule configuration',
  invalidExtractor: 'Invalid extractor configuration'
};

interface TaskConfigProps {
  initialConfig?: TaskConfiguration;
  onChange: (config: TaskConfiguration) => void;
  onValidationError: (errors: TaskValidationError[]) => void;
  validationDebounce?: number;
  enableRealTimeValidation?: boolean;
}

/**
 * TaskConfig component for configuring web scraping tasks with comprehensive validation
 */
const TaskConfig: React.FC<TaskConfigProps> = ({
  initialConfig,
  onChange,
  onValidationError,
  validationDebounce = VALIDATION_DEBOUNCE_MS,
  enableRealTimeValidation = true
}) => {
  // Form state management
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<TaskValidationError[]>([]);

  // Form setup with validation
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isDirty }
  } = useForm<TaskConfiguration>({
    resolver: zodResolver(taskConfigurationSchema),
    defaultValues: {
      url: '',
      schedule: DEFAULT_SCHEDULE,
      extractors: [],
      priority: 'medium',
      useProxy: false,
      followPagination: false,
      maxPages: 100,
      timeout: 30000,
      retryAttempts: 3,
      headers: {},
      cookies: {},
      javascript: false,
      authentication: {
        required: false
      },
      ...initialConfig
    }
  });

  // Watch form values for real-time validation
  const formValues = watch();
  const debouncedValues = useDebounce(formValues, validationDebounce);

  // Validate configuration with performance optimization
  const validateConfiguration = useCallback(async (config: TaskConfiguration) => {
    setIsValidating(true);
    const errors: TaskValidationError[] = [];

    try {
      await taskConfigurationSchema.parseAsync(config);
    } catch (error) {
      if (error instanceof Error) {
        errors.push({
          field: 'configuration',
          message: error.message,
          code: 'VALIDATION_ERROR',
          severity: 'error',
          suggestions: ['Review the configuration and try again']
        });
      }
    }

    setValidationErrors(errors);
    onValidationError(errors);
    setIsValidating(false);
  }, [onValidationError]);

  // Effect for real-time validation
  useEffect(() => {
    if (enableRealTimeValidation && isDirty) {
      validateConfiguration(debouncedValues);
    }
  }, [debouncedValues, enableRealTimeValidation, isDirty, validateConfiguration]);

  // Handle form submission
  const onSubmit = useCallback(async (data: TaskConfiguration) => {
    const errors = await validateConfiguration(data);
    if (!errors || errors.length === 0) {
      onChange(data);
    }
  }, [onChange, validateConfiguration]);

  // Handle extractor configuration changes
  const handleExtractorChange = useCallback((extractors: TaskConfiguration['extractors']) => {
    const updatedConfig = { ...formValues, extractors };
    validateConfiguration(updatedConfig);
    onChange(updatedConfig);
  }, [formValues, onChange, validateConfiguration]);

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ width: '100%' }}>
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Basic Configuration
        </Typography>

        <Grid container spacing={3}>
          {/* Target URL */}
          <Grid item xs={12}>
            <Controller
              name="url"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Target URL"
                  fullWidth
                  required
                  error={!!errors.url}
                  helperText={errors.url?.message || 'Enter the URL to scrape'}
                />
              )}
            />
          </Grid>

          {/* Priority */}
          <Grid item xs={12} md={6}>
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Priority</InputLabel>
                  <Select {...field} label="Priority">
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          {/* Retry Attempts */}
          <Grid item xs={12} md={6}>
            <Controller
              name="retryAttempts"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Retry Attempts"
                  fullWidth
                  InputProps={{ inputProps: { min: 0, max: 5 } }}
                />
              )}
            />
          </Grid>

          {/* Pagination Controls */}
          <Grid item xs={12} md={6}>
            <Controller
              name="followPagination"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch {...field} checked={field.value} />}
                  label="Follow Pagination"
                />
              )}
            />
          </Grid>

          {/* Max Pages */}
          <Grid item xs={12} md={6}>
            <Controller
              name="maxPages"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Maximum Pages"
                  fullWidth
                  disabled={!watch('followPagination')}
                  InputProps={{ inputProps: { min: 1, max: 1000 } }}
                />
              )}
            />
          </Grid>

          {/* JavaScript Required */}
          <Grid item xs={12} md={6}>
            <Controller
              name="javascript"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch {...field} checked={field.value} />}
                  label="JavaScript Required"
                />
              )}
            />
          </Grid>

          {/* Proxy Usage */}
          <Grid item xs={12} md={6}>
            <Controller
              name="useProxy"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch {...field} checked={field.value} />}
                  label="Use Proxy"
                />
              )}
            />
          </Grid>
        </Grid>
      </Card>

      {/* Extraction Rules */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Data Extraction Rules
        </Typography>
        <ExtractorConfig
          initialConfig={watch('extractors')}
          onChange={handleExtractorChange}
          onValidationError={(errors) => {
            setValidationErrors((prev) => [
              ...prev,
              {
                field: 'extractors',
                message: 'Invalid extractor configuration',
                code: 'EXTRACTOR_ERROR',
                severity: 'error',
                suggestions: errors.map(e => e.message)
              }
            ]);
          }}
        />
      </Card>

      {/* Validation Feedback */}
      {validationErrors.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {validationErrors.length} validation error(s) found. Please review your configuration.
        </Alert>
      )}

      {/* Form Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          type="submit"
          variant="contained"
          disabled={isValidating || validationErrors.length > 0}
          startIcon={isValidating && <CircularProgress size={20} />}
        >
          {isValidating ? 'Validating...' : 'Save Configuration'}
        </Button>
      </Box>
    </Box>
  );
};

export default React.memo(TaskConfig);