/**
 * @fileoverview Enterprise-grade proxy settings configuration component with 
 * enhanced validation, error handling, and security features.
 * @version 1.0.0
 */

import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form'; // v7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // v3.22.0
import {
  TextField,
  Switch,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  FormControlLabel,
  FormHelperText,
  Grid,
  Typography,
  IconButton,
  Paper,
} from '@mui/material'; // v5.14.0
import InfoIcon from '@mui/icons-material/Info';
import DeleteIcon from '@mui/icons-material/Delete';
import { debounce } from 'lodash'; // v4.17.21

import { ProxySettings, ProxyProvider, ProxyHealth } from '../../types/settings';
import { proxySettingsSchema } from '../../validation/settings';
import { updateSettings } from '../../store/settingsSlice';
import { useAppDispatch } from '../../store/hooks';
import { LoadingState } from '../../types/common';

// Constants
const MIN_ROTATION_INTERVAL = 60;
const MAX_ROTATION_INTERVAL = 3600;
const DEBOUNCE_DELAY = 300;

interface ProxySettingsFormProps {
  initialValues: ProxySettings;
  onSubmit: (data: ProxySettings) => Promise<void>;
  disableHealthCheck?: boolean;
  healthStatus?: Record<string, ProxyHealth>;
}

/**
 * Enterprise-grade proxy settings configuration component with validation and monitoring
 */
export const ProxySettings: React.FC<ProxySettingsFormProps> = ({
  initialValues,
  onSubmit,
  disableHealthCheck = false,
  healthStatus = {}
}) => {
  const dispatch = useAppDispatch();
  const [submitStatus, setSubmitStatus] = useState<LoadingState>(LoadingState.IDLE);
  const [healthCheckInProgress, setHealthCheckInProgress] = useState<boolean>(false);

  // Initialize form with validation schema
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
    reset,
    setValue
  } = useForm<ProxySettings>({
    resolver: zodResolver(proxySettingsSchema),
    defaultValues: initialValues,
    mode: 'onChange'
  });

  const selectedProvider = watch('provider');
  const isEnabled = watch('enabled');

  // Handle form submission with validation and error handling
  const onFormSubmit = async (data: ProxySettings) => {
    try {
      setSubmitStatus(LoadingState.LOADING);
      await onSubmit(data);
      setSubmitStatus(LoadingState.SUCCEEDED);
    } catch (error) {
      setSubmitStatus(LoadingState.FAILED);
      console.error('Proxy settings update failed:', error);
    }
  };

  // Debounced provider change handler with health check
  const handleProviderChange = debounce(async (value: ProxyProvider) => {
    setValue('provider', value);
    if (value === ProxyProvider.CUSTOM) {
      setValue('customProxies', []);
    }
    
    if (!disableHealthCheck) {
      setHealthCheckInProgress(true);
      try {
        // Implement health check logic here
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Provider health check failed:', error);
      } finally {
        setHealthCheckInProgress(false);
      }
    }
  }, DEBOUNCE_DELAY);

  // Reset form handler with confirmation
  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset proxy settings?')) {
      reset(initialValues);
      setSubmitStatus(LoadingState.IDLE);
    }
  };

  // Custom proxy list management
  const handleAddProxy = () => {
    const currentProxies = watch('customProxies') || [];
    setValue('customProxies', [...currentProxies, '']);
  };

  const handleRemoveProxy = (index: number) => {
    const currentProxies = watch('customProxies') || [];
    setValue('customProxies', currentProxies.filter((_, i) => i !== index));
  };

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Grid container spacing={3}>
          {/* Enable/Disable Proxy */}
          <Grid item xs={12}>
            <Controller
              name="enabled"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch {...field} checked={field.value} />}
                  label="Enable Proxy Service"
                />
              )}
            />
          </Grid>

          {/* Provider Selection */}
          <Grid item xs={12}>
            <FormControl error={!!errors.provider} fullWidth>
              <FormLabel>Proxy Provider</FormLabel>
              <Controller
                name="provider"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    {...field}
                    onChange={(e) => handleProviderChange(e.target.value as ProxyProvider)}
                  >
                    <FormControlLabel
                      value={ProxyProvider.BRIGHT_DATA}
                      control={<Radio />}
                      label={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span>Bright Data</span>
                          {healthStatus[ProxyProvider.BRIGHT_DATA] && (
                            <Tooltip title={`Status: ${healthStatus[ProxyProvider.BRIGHT_DATA].status}`}>
                              <InfoIcon color="info" sx={{ ml: 1 }} />
                            </Tooltip>
                          )}
                        </div>
                      }
                    />
                    <FormControlLabel
                      value={ProxyProvider.CUSTOM}
                      control={<Radio />}
                      label="Custom Proxy List"
                    />
                  </RadioGroup>
                )}
              />
              {errors.provider && (
                <FormHelperText>{errors.provider.message}</FormHelperText>
              )}
            </FormControl>
          </Grid>

          {/* Rotation Interval */}
          <Grid item xs={12} md={6}>
            <Controller
              name="rotationInterval"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Rotation Interval (seconds)"
                  fullWidth
                  error={!!errors.rotationInterval}
                  helperText={errors.rotationInterval?.message || 
                    `Min: ${MIN_ROTATION_INTERVAL}s, Max: ${MAX_ROTATION_INTERVAL}s`}
                  disabled={!isEnabled}
                  InputProps={{
                    inputProps: { min: MIN_ROTATION_INTERVAL, max: MAX_ROTATION_INTERVAL }
                  }}
                />
              )}
            />
          </Grid>

          {/* Custom Proxy List */}
          {selectedProvider === ProxyProvider.CUSTOM && (
            <Grid item xs={12}>
              <FormControl error={!!errors.customProxies} fullWidth>
                <FormLabel>Custom Proxies</FormLabel>
                <Controller
                  name="customProxies"
                  control={control}
                  render={({ field }) => (
                    <>
                      {field.value?.map((proxy, index) => (
                        <Grid container spacing={2} key={index} sx={{ mb: 1 }}>
                          <Grid item xs={10}>
                            <TextField
                              fullWidth
                              value={proxy}
                              onChange={(e) => {
                                const newProxies = [...field.value];
                                newProxies[index] = e.target.value;
                                field.onChange(newProxies);
                              }}
                              error={!!errors.customProxies?.[index]}
                              helperText={errors.customProxies?.[index]?.message}
                              placeholder="http(s)://username:password@host:port"
                            />
                          </Grid>
                          <Grid item xs={2}>
                            <IconButton
                              onClick={() => handleRemoveProxy(index)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>
                      ))}
                      <Button
                        variant="outlined"
                        onClick={handleAddProxy}
                        disabled={!isEnabled}
                        sx={{ mt: 1 }}
                      >
                        Add Proxy
                      </Button>
                    </>
                  )}
                />
                {errors.customProxies && (
                  <FormHelperText>{errors.customProxies.message}</FormHelperText>
                )}
              </FormControl>
            </Grid>
          )}

          {/* Status Messages */}
          {submitStatus === LoadingState.FAILED && (
            <Grid item xs={12}>
              <Alert severity="error">
                Failed to update proxy settings. Please try again.
              </Alert>
            </Grid>
          )}

          {submitStatus === LoadingState.SUCCEEDED && (
            <Grid item xs={12}>
              <Alert severity="success">
                Proxy settings updated successfully.
              </Alert>
            </Grid>
          )}

          {/* Action Buttons */}
          <Grid item xs={12}>
            <Grid container spacing={2} justifyContent="flex-end">
              <Grid item>
                <Button
                  variant="outlined"
                  onClick={handleReset}
                  disabled={!isDirty || submitStatus === LoadingState.LOADING}
                >
                  Reset
                </Button>
              </Grid>
              <Grid item>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!isDirty || submitStatus === LoadingState.LOADING}
                >
                  {submitStatus === LoadingState.LOADING ? (
                    <CircularProgress size={24} />
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </form>
    </Paper>
  );
};

export default ProxySettings;