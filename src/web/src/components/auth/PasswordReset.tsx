/**
 * @fileoverview Secure password reset component implementing enterprise-grade security measures,
 * strict validation, and WCAG 2.1 Level AA accessibility compliance.
 * @version 1.0.0
 */

import React, { useCallback, useState, useEffect } from 'react'; // v18.2.0
import { useForm } from 'react-hook-form'; // v7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // v3.3.0
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Container,
  Paper,
} from '@mui/material'; // v5.14.0
import { validatePasswordReset, passwordResetSchema } from '../../validation/auth';
import { AlertDialog } from '../common/AlertDialog';

// Security-focused constants
const PASSWORD_RESET_STATES = {
  REQUEST: 'request',
  RESET: 'reset',
  SUCCESS: 'success',
  ERROR: 'error',
  RATE_LIMITED: 'limited'
} as const;

const SECURITY_CONFIG = {
  tokenExpiry: 3600, // 1 hour in seconds
  maxAttempts: 5,
  baseDelay: 1000, // Base delay for exponential backoff in ms
} as const;

// Type definitions
interface PasswordResetFormData {
  email: string;
  token?: string;
  newPassword?: string;
  confirmPassword?: string;
  lastAttempt?: number;
}

/**
 * Enhanced password reset component with security measures and accessibility support
 */
export const PasswordReset = React.memo(() => {
  const [resetState, setResetState] = useState<keyof typeof PASSWORD_RESET_STATES>('REQUEST');
  const [attempts, setAttempts] = useState(0);
  const [alertConfig, setAlertConfig] = useState({
    open: false,
    title: '',
    message: '',
    severity: 'info' as const,
  });

  // Initialize form with enhanced security validation
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset: resetForm,
    watch,
  } = useForm<PasswordResetFormData>({
    resolver: zodResolver(passwordResetSchema),
    mode: 'onBlur',
  });

  // Extract URL token parameter securely
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      // Validate token format before setting state
      if (/^[a-zA-Z0-9-_]{64}$/.test(token)) {
        setResetState('RESET');
        resetForm({ token });
      } else {
        setResetState('ERROR');
        showAlert('Invalid Reset Token', 'The password reset token is invalid or has expired.', 'error');
      }
    }
  }, [resetForm]);

  // Progressive delay calculation for rate limiting
  const calculateDelay = useCallback((attemptCount: number): number => {
    return Math.min(
      SECURITY_CONFIG.baseDelay * Math.pow(2, attemptCount),
      30000 // Max delay of 30 seconds
    );
  }, []);

  // Alert dialog handler
  const showAlert = useCallback((title: string, message: string, severity: 'error' | 'success' | 'info') => {
    setAlertConfig({
      open: true,
      title,
      message,
      severity,
    });
  }, []);

  // Handle password reset request with security measures
  const handlePasswordResetRequest = useCallback(async (formData: PasswordResetFormData) => {
    try {
      // Check rate limiting
      if (attempts >= SECURITY_CONFIG.maxAttempts) {
        setResetState('RATE_LIMITED');
        showAlert(
          'Too Many Attempts',
          'Please try again later or contact support for assistance.',
          'error'
        );
        return;
      }

      // Apply progressive delay
      const delay = calculateDelay(attempts);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Sanitize and validate email
      const sanitizedEmail = formData.email.toLowerCase().trim();
      const validationResult = await validatePasswordReset({ email: sanitizedEmail });

      if (!validationResult.success) {
        throw new Error('Invalid email format or domain');
      }

      // Send reset request
      const response = await fetch('/api/v1/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sanitizedEmail }),
      });

      if (!response.ok) {
        throw new Error('Password reset request failed');
      }

      showAlert(
        'Reset Email Sent',
        'If an account exists with this email, you will receive password reset instructions.',
        'success'
      );

      setAttempts(prev => prev + 1);
    } catch (error) {
      console.error('Password reset request error:', error);
      showAlert(
        'Reset Request Failed',
        'Please try again later or contact support.',
        'error'
      );
    }
  }, [attempts, calculateDelay, showAlert]);

  // Handle password reset confirmation with security measures
  const handlePasswordReset = useCallback(async (formData: PasswordResetFormData) => {
    try {
      if (!formData.token || !formData.newPassword) {
        throw new Error('Missing required fields');
      }

      // Validate token and password
      const validationResult = await validatePasswordReset(formData);
      if (!validationResult.success) {
        throw new Error('Invalid password format');
      }

      const response = await fetch('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: formData.token,
          newPassword: formData.newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error('Password reset failed');
      }

      setResetState('SUCCESS');
      showAlert(
        'Password Reset Successful',
        'Your password has been updated. Please log in with your new password.',
        'success'
      );

      // Redirect to login after delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 3000);
    } catch (error) {
      console.error('Password reset error:', error);
      showAlert(
        'Reset Failed',
        'Unable to reset password. Please try again or request a new reset link.',
        'error'
      );
    }
  }, [showAlert]);

  return (
    <Container maxWidth="sm">
      <Paper
        elevation={3}
        sx={{
          p: 4,
          mt: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography
          component="h1"
          variant="h5"
          gutterBottom
          sx={{ mb: 3 }}
        >
          {resetState === 'RESET' ? 'Reset Password' : 'Request Password Reset'}
        </Typography>

        <Box
          component="form"
          onSubmit={handleSubmit(
            resetState === 'RESET' ? handlePasswordReset : handlePasswordResetRequest
          )}
          noValidate
          sx={{ width: '100%' }}
        >
          {resetState === 'REQUEST' && (
            <TextField
              {...register('email')}
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              autoComplete="email"
              autoFocus
              error={!!errors.email}
              helperText={errors.email?.message}
              disabled={isSubmitting}
              inputProps={{
                'aria-label': 'Email Address',
                'aria-describedby': 'email-error',
              }}
            />
          )}

          {resetState === 'RESET' && (
            <>
              <TextField
                {...register('newPassword')}
                margin="normal"
                required
                fullWidth
                label="New Password"
                type="password"
                autoComplete="new-password"
                error={!!errors.newPassword}
                helperText={errors.newPassword?.message}
                disabled={isSubmitting}
                inputProps={{
                  'aria-label': 'New Password',
                  'aria-describedby': 'new-password-error',
                }}
              />
              <TextField
                {...register('confirmPassword')}
                margin="normal"
                required
                fullWidth
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword?.message}
                disabled={isSubmitting}
                inputProps={{
                  'aria-label': 'Confirm Password',
                  'aria-describedby': 'confirm-password-error',
                }}
              />
            </>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={isSubmitting}
            aria-label={resetState === 'RESET' ? 'Reset Password' : 'Send Reset Link'}
          >
            {isSubmitting ? (
              <CircularProgress size={24} />
            ) : resetState === 'RESET' ? (
              'Reset Password'
            ) : (
              'Send Reset Link'
            )}
          </Button>
        </Box>

        <AlertDialog
          open={alertConfig.open}
          title={alertConfig.title}
          message={alertConfig.message}
          severity={alertConfig.severity}
          onClose={() => setAlertConfig(prev => ({ ...prev, open: false }))}
          onConfirm={() => setAlertConfig(prev => ({ ...prev, open: false }))}
          confirmText="OK"
          disableBackdropClick={alertConfig.severity === 'success'}
        />
      </Paper>
    </Container>
  );
});

// Display name for debugging
PasswordReset.displayName = 'PasswordReset';