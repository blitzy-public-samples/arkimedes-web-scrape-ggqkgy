/**
 * @fileoverview Enhanced Login Form Component with MFA and Service Account Support
 * @version 1.0.0
 * 
 * Implements comprehensive authentication with:
 * - Username/password authentication
 * - Multi-factor authentication (MFA)
 * - Service account login
 * - Enhanced accessibility
 * - Progressive rate limiting
 */

import React, { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form'; // v7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // v3.3.0
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  useTheme,
  useMediaQuery,
  Paper,
} from '@mui/material'; // v5.14.0
import {
  Visibility,
  VisibilityOff,
  AccountCircle,
  Security,
} from '@mui/icons-material'; // v5.14.0

import { useAuth } from '../../hooks/useAuth';
import { LoginCredentials } from '../../types/auth';
import { loginSchema } from '../../validation/auth';

// Constants for rate limiting and security
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

interface LoginFormProps {
  onSuccess: () => void;
  onError: (error: string) => void;
  onMFARequired: (qrCode: string) => void;
  isServiceAccount?: boolean;
}

/**
 * Enhanced Login Form Component
 * Provides secure authentication with MFA support and accessibility features
 */
const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onError,
  onMFARequired,
  isServiceAccount = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { login, loading, error, mfaRequired } = useAuth();

  // Form state management
  const [showPassword, setShowPassword] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      mfaCode: '',
      isServiceAccount,
    },
  });

  /**
   * Handles form submission with rate limiting and security checks
   */
  const onSubmit = useCallback(async (data: LoginCredentials) => {
    try {
      // Check for account lockout
      if (lockoutTime && Date.now() < lockoutTime) {
        const remainingTime = Math.ceil((lockoutTime - Date.now()) / 1000 / 60);
        onError(`Account locked. Try again in ${remainingTime} minutes.`);
        return;
      }

      // Increment login attempts
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);

      // Check for max attempts exceeded
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const newLockoutTime = Date.now() + LOCKOUT_DURATION;
        setLockoutTime(newLockoutTime);
        onError(`Maximum login attempts exceeded. Account locked for 15 minutes.`);
        return;
      }

      await login(data);

      if (mfaRequired) {
        onMFARequired(data.mfaCode || '');
      } else {
        setLoginAttempts(0);
        setLockoutTime(null);
        reset();
        onSuccess();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }, [login, loginAttempts, lockoutTime, mfaRequired, onError, onMFARequired, onSuccess, reset]);

  /**
   * Toggles password visibility
   */
  const handleTogglePassword = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <Paper
      elevation={3}
      sx={{
        p: theme.spacing(4),
        width: isMobile ? '100%' : '400px',
        maxWidth: '100%',
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing(3),
        }}
      >
        <Typography variant="h5" component="h1" align="center" gutterBottom>
          {isServiceAccount ? 'Service Account Login' : 'User Login'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Controller
          name="username"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={isServiceAccount ? 'Service Account ID' : 'Username'}
              error={!!errors.username}
              helperText={errors.username?.message}
              disabled={loading}
              fullWidth
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AccountCircle />
                  </InputAdornment>
                ),
              }}
              inputProps={{
                'aria-label': 'username',
                autoComplete: 'username',
              }}
            />
          )}
        />

        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type={showPassword ? 'text' : 'password'}
              label={isServiceAccount ? 'API Key' : 'Password'}
              error={!!errors.password}
              helperText={errors.password?.message}
              disabled={loading}
              fullWidth
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Security />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={handleTogglePassword}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              inputProps={{
                'aria-label': 'password',
                autoComplete: isServiceAccount ? 'off' : 'current-password',
              }}
            />
          )}
        />

        {mfaRequired && (
          <Controller
            name="mfaCode"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="MFA Code"
                error={!!errors.mfaCode}
                helperText={errors.mfaCode?.message}
                disabled={loading}
                fullWidth
                required
                inputProps={{
                  'aria-label': 'mfa-code',
                  maxLength: 6,
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                }}
              />
            )}
          />
        )}

        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          disabled={loading || (lockoutTime !== null && Date.now() < lockoutTime)}
          fullWidth
          sx={{ mt: 2 }}
        >
          {loading ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            'Sign In'
          )}
        </Button>

        {lockoutTime && Date.now() < lockoutTime && (
          <Typography color="error" variant="body2" align="center">
            Account locked. Try again in{' '}
            {Math.ceil((lockoutTime - Date.now()) / 1000 / 60)} minutes.
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default LoginForm;