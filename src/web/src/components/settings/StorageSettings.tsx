/**
 * @fileoverview Enhanced React component for managing data storage and retention configuration
 * with comprehensive validation, accessibility features, and user feedback.
 * @version 1.0.0
 */

import React, { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  TextField,
  Switch,
  Button,
  FormControl,
  FormHelperText,
  CircularProgress,
  Tooltip,
  Snackbar,
  Alert,
  Box,
  Typography,
  Stack
} from '@mui/material';
import { StorageSettings } from '../../types/settings';
import { storageSettingsSchema } from '../../validation/settings';
import { updateSettings } from '../../store/settingsSlice';
import { useDispatch } from 'react-redux';

// Constants for validation boundaries
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

interface StorageSettingsProps {
  initialValues: StorageSettings;
  onUpdate?: (settings: StorageSettings) => void;
  isLoading?: boolean;
}

/**
 * Enhanced StorageSettings component for managing data retention and archival configuration
 * with comprehensive validation and accessibility features.
 */
const StorageSettings: React.FC<StorageSettingsProps> = ({
  initialValues,
  onUpdate,
  isLoading = false
}) => {
  const dispatch = useDispatch();
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Initialize form with validation schema
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting }
  } = useForm<StorageSettings>({
    resolver: zodResolver(storageSettingsSchema),
    defaultValues: initialValues,
    mode: 'onChange'
  });

  /**
   * Enhanced form submission handler with loading state and error handling
   */
  const onSubmit = useCallback(async (data: StorageSettings) => {
    try {
      const result = await dispatch(updateSettings({ 
        ...initialValues, 
        storage: data 
      })).unwrap();

      setNotification({
        open: true,
        message: 'Storage settings updated successfully',
        severity: 'success'
      });

      onUpdate?.(result.storage);
    } catch (error) {
      setNotification({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to update storage settings',
        severity: 'error'
      });
    }
  }, [dispatch, initialValues, onUpdate]);

  /**
   * Reset form to initial values
   */
  const handleReset = useCallback(() => {
    reset(initialValues);
    setNotification({
      open: true,
      message: 'Settings reset to original values',
      severity: 'success'
    });
  }, [initialValues, reset]);

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack spacing={3}>
        <Typography variant="h6" component="h2">
          Storage Configuration
        </Typography>

        {/* Retention Period Input */}
        <FormControl error={!!errors.retentionPeriod}>
          <Controller
            name="retentionPeriod"
            control={control}
            render={({ field }) => (
              <Tooltip title={`Set data retention period (${MIN_RETENTION_DAYS}-${MAX_RETENTION_DAYS} days)`}>
                <TextField
                  {...field}
                  label="Retention Period (Days)"
                  type="number"
                  inputProps={{
                    min: MIN_RETENTION_DAYS,
                    max: MAX_RETENTION_DAYS,
                    'aria-label': 'Data retention period in days'
                  }}
                  error={!!errors.retentionPeriod}
                  disabled={isLoading || isSubmitting}
                  fullWidth
                />
              </Tooltip>
            )}
          />
          {errors.retentionPeriod && (
            <FormHelperText error>
              {errors.retentionPeriod.message}
            </FormHelperText>
          )}
        </FormControl>

        {/* Auto Archive Toggle */}
        <FormControl>
          <Controller
            name="autoArchive"
            control={control}
            render={({ field }) => (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Switch
                  {...field}
                  checked={field.value}
                  disabled={isLoading || isSubmitting}
                  inputProps={{
                    'aria-label': 'Enable automatic data archival'
                  }}
                />
                <Typography>
                  Enable Automatic Archival
                </Typography>
              </Stack>
            )}
          />
        </FormControl>

        {/* Archive Location Input */}
        <FormControl error={!!errors.archiveLocation}>
          <Controller
            name="archiveLocation"
            control={control}
            render={({ field }) => (
              <Tooltip title="Enter valid storage URL (e.g., s3://bucket/path)">
                <TextField
                  {...field}
                  label="Archive Location"
                  placeholder="s3://bucket/path"
                  error={!!errors.archiveLocation}
                  disabled={isLoading || isSubmitting || !field.value}
                  inputProps={{
                    'aria-label': 'Archive storage location URL'
                  }}
                  fullWidth
                />
              </Tooltip>
            )}
          />
          {errors.archiveLocation && (
            <FormHelperText error>
              {errors.archiveLocation.message}
            </FormHelperText>
          )}
        </FormControl>

        {/* Form Actions */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || isLoading || isSubmitting}
            aria-label="Reset form to initial values"
          >
            Reset
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!isDirty || isLoading || isSubmitting}
            startIcon={isSubmitting && <CircularProgress size={20} />}
            aria-label="Save storage settings"
          >
            Save Changes
          </Button>
        </Stack>
      </Stack>

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setNotification({ ...notification, open: false })}
          severity={notification.severity}
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default StorageSettings;