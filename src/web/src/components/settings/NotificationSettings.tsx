/**
 * @fileoverview Enhanced notification settings component with validation, security features,
 * and accessibility support following Material Design 3.0 guidelines.
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import {
  Card,
  CardContent,
  CardHeader,
  Switch,
  FormGroup,
  FormControlLabel,
  TextField,
  Button,
  CircularProgress,
  Tooltip,
  Box,
  Typography,
} from '@mui/material';
import { Settings } from '../../types/settings';
import { updateSettings } from '../../store/settingsSlice';
import { AlertDialog } from '../common/AlertDialog';
import { LoadingState } from '../../types/common';
import { useDebounce } from '../../hooks/useDebounce';

// Validation schema for notification settings
const validationSchema = yup.object().shape({
  emailAlerts: yup.boolean(),
  slackIntegration: yup.boolean(),
  systemNotifications: yup.boolean(),
  emailRecipients: yup.array().of(
    yup.string().email('Invalid email format')
  ).when('emailAlerts', {
    is: true,
    then: yup.array().min(1, 'At least one email recipient required')
  }),
  slackWebhook: yup.string().when('slackIntegration', {
    is: true,
    then: yup.string().url('Invalid webhook URL').required('Webhook URL required')
  }),
  notificationPriority: yup.string().oneOf(['high', 'medium', 'low']),
  retryAttempts: yup.number().min(0).max(10)
});

// Interface for notification configuration
export interface NotificationConfig {
  emailAlerts: boolean;
  slackIntegration: boolean;
  systemNotifications: boolean;
  emailRecipients: string[];
  slackWebhook: string;
  emailValidation: boolean;
  webhookValidation: boolean;
  lastUpdated: string;
  notificationPriority: 'high' | 'medium' | 'low';
  retryAttempts: number;
}

// Props interface for the component
export interface NotificationSettingsProps {
  className?: string;
  onSettingsChange?: (settings: NotificationConfig) => void;
}

// Default notification configuration
const defaultNotificationConfig: NotificationConfig = {
  emailAlerts: false,
  slackIntegration: false,
  systemNotifications: true,
  emailRecipients: [],
  slackWebhook: '',
  emailValidation: false,
  webhookValidation: false,
  lastUpdated: '',
  notificationPriority: 'medium',
  retryAttempts: 3
};

/**
 * Enhanced notification settings component with validation and security features
 */
export const NotificationSettings: React.FC<NotificationSettingsProps> = React.memo(({
  className,
  onSettingsChange
}) => {
  const dispatch = useDispatch();
  const settings = useSelector((state: { settings: Settings }) => state.settings);
  
  // Form handling with validation
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
    reset
  } = useForm<NotificationConfig>({
    defaultValues: defaultNotificationConfig,
    resolver: yup.object().shape(validationSchema)
  });

  // Watch form values for conditional validation
  const emailAlerts = watch('emailAlerts');
  const slackIntegration = watch('slackIntegration');

  // Debounce webhook validation to prevent excessive API calls
  const debouncedWebhook = useDebounce(watch('slackWebhook'), 500);

  // Loading and error states
  const [loadingState, setLoadingState] = React.useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = React.useState<string | null>(null);

  // Alert dialog state
  const [showAlert, setShowAlert] = React.useState(false);

  // Memoized form submission handler
  const onSubmit = useCallback(async (data: NotificationConfig) => {
    try {
      setLoadingState(LoadingState.LOADING);
      
      // Update settings through Redux
      await dispatch(updateSettings({
        ...settings,
        notifications: {
          ...data,
          lastUpdated: new Date().toISOString()
        }
      }));

      setLoadingState(LoadingState.SUCCEEDED);
      onSettingsChange?.(data);
    } catch (err) {
      setLoadingState(LoadingState.FAILED);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      setShowAlert(true);
    }
  }, [dispatch, settings, onSettingsChange]);

  // Effect for webhook validation
  useEffect(() => {
    if (slackIntegration && debouncedWebhook) {
      // Implement webhook validation logic here
      // This is a placeholder for actual implementation
      console.log('Validating webhook:', debouncedWebhook);
    }
  }, [slackIntegration, debouncedWebhook]);

  // Render component
  return (
    <Card className={className}>
      <CardHeader 
        title="Notification Settings"
        subheader="Configure system-wide notification preferences"
      />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  {...register('emailAlerts')}
                  color="primary"
                />
              }
              label="Email Alerts"
            />
            
            {emailAlerts && (
              <TextField
                {...register('emailRecipients')}
                label="Email Recipients"
                helperText={errors.emailRecipients?.message || 'Enter comma-separated email addresses'}
                error={!!errors.emailRecipients}
                fullWidth
                margin="normal"
                multiline
                rows={2}
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  {...register('slackIntegration')}
                  color="primary"
                />
              }
              label="Slack Integration"
            />

            {slackIntegration && (
              <TextField
                {...register('slackWebhook')}
                label="Slack Webhook URL"
                helperText={errors.slackWebhook?.message || 'Enter your Slack webhook URL'}
                error={!!errors.slackWebhook}
                fullWidth
                margin="normal"
                type="url"
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  {...register('systemNotifications')}
                  color="primary"
                />
              }
              label="System Notifications"
            />

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Notification Priority</Typography>
              <FormGroup row>
                {['high', 'medium', 'low'].map((priority) => (
                  <FormControlLabel
                    key={priority}
                    control={
                      <Switch
                        {...register('notificationPriority')}
                        value={priority}
                      />
                    }
                    label={priority.charAt(0).toUpperCase() + priority.slice(1)}
                  />
                ))}
              </FormGroup>
            </Box>

            <TextField
              {...register('retryAttempts')}
              label="Retry Attempts"
              type="number"
              inputProps={{ min: 0, max: 10 }}
              helperText={errors.retryAttempts?.message || 'Number of retry attempts for failed notifications'}
              error={!!errors.retryAttempts}
              fullWidth
              margin="normal"
            />
          </FormGroup>

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loadingState === LoadingState.LOADING || !isDirty}
              startIcon={loadingState === LoadingState.LOADING && <CircularProgress size={20} />}
            >
              Save Changes
            </Button>

            <Button
              type="button"
              variant="outlined"
              onClick={() => reset(defaultNotificationConfig)}
              disabled={loadingState === LoadingState.LOADING || !isDirty}
            >
              Reset
            </Button>
          </Box>
        </form>

        <AlertDialog
          open={showAlert}
          title="Error"
          message={error || 'An error occurred while saving settings'}
          severity="error"
          onClose={() => setShowAlert(false)}
          onConfirm={() => setShowAlert(false)}
          confirmText="OK"
        />
      </CardContent>
    </Card>
  );
});

NotificationSettings.displayName = 'NotificationSettings';