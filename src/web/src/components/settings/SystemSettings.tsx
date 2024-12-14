/**
 * @fileoverview System Settings component implementing a comprehensive settings management
 * interface with real-time validation, accessibility features, and error handling.
 * @version 1.0.0
 */

import React, { useEffect, useMemo, useCallback, memo } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Typography,
  Tooltip,
  Alert,
  CircularProgress
} from '@mui/material'; // v5.14.0
import { InfoOutlined } from '@mui/icons-material'; // v5.14.0
import { debounce } from 'lodash'; // v4.17.21
import { SystemSettings as ISystemSettings } from '../../types/settings';
import { updateSettings, selectSettings } from '../../store/settingsSlice';
import { BaseError } from '../../types/common';

// Interface for form validation errors
interface ValidationErrors {
  maxConcurrentTasks?: string;
  requestTimeout?: string;
  retryAttempts?: string;
}

// Form field constraints
const CONSTRAINTS = {
  maxConcurrentTasks: { min: 1, max: 1000 },
  requestTimeout: { min: 1000, max: 60000 },
  retryAttempts: { min: 0, max: 10 }
};

// Helper tooltips for form fields
const FIELD_TOOLTIPS = {
  maxConcurrentTasks: 'Maximum number of scraping tasks that can run simultaneously (1-1000)',
  requestTimeout: 'Global timeout for HTTP requests in milliseconds (1000-60000)',
  retryAttempts: 'Number of retry attempts for failed operations (0-10)'
};

/**
 * System Settings component with validation and accessibility features
 */
const SystemSettings: React.FC = memo(() => {
  const dispatch = useDispatch();
  const currentSettings = useSelector(selectSettings);
  const [formData, setFormData] = React.useState<ISystemSettings>(currentSettings.system);
  const [errors, setErrors] = React.useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState(false);

  // Initialize form with current settings
  useEffect(() => {
    setFormData(currentSettings.system);
  }, [currentSettings]);

  // Validate form data against constraints
  const validateSettings = useCallback((data: ISystemSettings): ValidationErrors => {
    const newErrors: ValidationErrors = {};

    if (data.maxConcurrentTasks < CONSTRAINTS.maxConcurrentTasks.min || 
        data.maxConcurrentTasks > CONSTRAINTS.maxConcurrentTasks.max) {
      newErrors.maxConcurrentTasks = `Must be between ${CONSTRAINTS.maxConcurrentTasks.min} and ${CONSTRAINTS.maxConcurrentTasks.max}`;
    }

    if (data.requestTimeout < CONSTRAINTS.requestTimeout.min || 
        data.requestTimeout > CONSTRAINTS.requestTimeout.max) {
      newErrors.requestTimeout = `Must be between ${CONSTRAINTS.requestTimeout.min} and ${CONSTRAINTS.requestTimeout.max}`;
    }

    if (data.retryAttempts < CONSTRAINTS.retryAttempts.min || 
        data.retryAttempts > CONSTRAINTS.retryAttempts.max) {
      newErrors.retryAttempts = `Must be between ${CONSTRAINTS.retryAttempts.min} and ${CONSTRAINTS.retryAttempts.max}`;
    }

    return newErrors;
  }, []);

  // Debounced validation for real-time feedback
  const debouncedValidate = useMemo(
    () => debounce((data: ISystemSettings) => {
      const validationErrors = validateSettings(data);
      setErrors(validationErrors);
    }, 300),
    [validateSettings]
  );

  // Handle form field changes
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const numericValue = parseInt(value, 10);
    
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: isNaN(numericValue) ? value : numericValue
      };
      debouncedValidate(newData);
      return newData;
    });
  }, [debouncedValidate]);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const validationErrors = validateSettings(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await dispatch(updateSettings({
        ...currentSettings,
        system: formData
      })).unwrap();

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (error) {
      const baseError = error as BaseError;
      setSubmitError(baseError.message || 'Failed to update settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" component="h2" gutterBottom>
          System Settings
        </Typography>

        <form onSubmit={handleSubmit} noValidate>
          <Grid container spacing={3}>
            {/* Max Concurrent Tasks */}
            <Grid item xs={12}>
              <Box display="flex" alignItems="center">
                <TextField
                  fullWidth
                  id="maxConcurrentTasks"
                  name="maxConcurrentTasks"
                  label="Maximum Concurrent Tasks"
                  type="number"
                  value={formData.maxConcurrentTasks}
                  onChange={handleChange}
                  error={!!errors.maxConcurrentTasks}
                  helperText={errors.maxConcurrentTasks}
                  inputProps={{
                    min: CONSTRAINTS.maxConcurrentTasks.min,
                    max: CONSTRAINTS.maxConcurrentTasks.max,
                    'aria-describedby': 'maxConcurrentTasks-tooltip'
                  }}
                />
                <Tooltip title={FIELD_TOOLTIPS.maxConcurrentTasks}>
                  <InfoOutlined sx={{ ml: 1 }} color="action" />
                </Tooltip>
              </Box>
            </Grid>

            {/* Request Timeout */}
            <Grid item xs={12}>
              <Box display="flex" alignItems="center">
                <TextField
                  fullWidth
                  id="requestTimeout"
                  name="requestTimeout"
                  label="Request Timeout (ms)"
                  type="number"
                  value={formData.requestTimeout}
                  onChange={handleChange}
                  error={!!errors.requestTimeout}
                  helperText={errors.requestTimeout}
                  inputProps={{
                    min: CONSTRAINTS.requestTimeout.min,
                    max: CONSTRAINTS.requestTimeout.max,
                    'aria-describedby': 'requestTimeout-tooltip'
                  }}
                />
                <Tooltip title={FIELD_TOOLTIPS.requestTimeout}>
                  <InfoOutlined sx={{ ml: 1 }} color="action" />
                </Tooltip>
              </Box>
            </Grid>

            {/* Retry Attempts */}
            <Grid item xs={12}>
              <Box display="flex" alignItems="center">
                <TextField
                  fullWidth
                  id="retryAttempts"
                  name="retryAttempts"
                  label="Retry Attempts"
                  type="number"
                  value={formData.retryAttempts}
                  onChange={handleChange}
                  error={!!errors.retryAttempts}
                  helperText={errors.retryAttempts}
                  inputProps={{
                    min: CONSTRAINTS.retryAttempts.min,
                    max: CONSTRAINTS.retryAttempts.max,
                    'aria-describedby': 'retryAttempts-tooltip'
                  }}
                />
                <Tooltip title={FIELD_TOOLTIPS.retryAttempts}>
                  <InfoOutlined sx={{ ml: 1 }} color="action" />
                </Tooltip>
              </Box>
            </Grid>

            {/* Form Actions */}
            <Grid item xs={12}>
              <Box display="flex" justifyContent="flex-end" gap={2}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={isSubmitting || Object.keys(errors).length > 0}
                >
                  {isSubmitting ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </Box>
            </Grid>

            {/* Feedback Messages */}
            <Grid item xs={12}>
              {submitSuccess && (
                <Alert severity="success">
                  Settings updated successfully
                </Alert>
              )}
              {submitError && (
                <Alert severity="error">
                  {submitError}
                </Alert>
              )}
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
});

SystemSettings.displayName = 'SystemSettings';

export default SystemSettings;