/**
 * @fileoverview Enhanced MFA Form Component with security features and validation
 * @version 1.0.0
 * @license MIT
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { TextField, Button, Box, Typography, CircularProgress } from '@mui/material'; // v5.14.0
import { useForm, Controller } from 'react-hook-form'; // v7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // v3.3.0
import { withErrorBoundary } from 'react-error-boundary'; // v4.0.11
import { useAuth } from '../../hooks/useAuth';
import { mfaSchema } from '../../validation/auth';
import { LoadingState } from '../../types/common';

// Security-focused constants
const MFA_CODE_LENGTH = 6;
const MFA_MAX_ATTEMPTS = 3;
const MFA_BLOCK_DURATION = 300000; // 5 minutes in milliseconds
const MFA_INPUT_DELAY = 50; // Constant delay to prevent timing attacks

interface MFAFormProps {
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  maxAttempts?: number;
  timeWindow?: number;
}

interface MFAFormData {
  code: string;
}

interface MFAFormState {
  attempts: number;
  blocked: boolean;
  blockExpiry: Date | null;
  loadingState: LoadingState;
  error: string | null;
}

/**
 * Enhanced MFA Form component with security features
 * Implements secure input handling, rate limiting, and error recovery
 */
const MFAForm: React.FC<MFAFormProps> = memo(({
  onVerify,
  onCancel,
  loading = false,
  maxAttempts = MFA_MAX_ATTEMPTS,
  timeWindow = MFA_BLOCK_DURATION
}) => {
  const { verifyMfa } = useAuth();
  const [state, setState] = useState<MFAFormState>({
    attempts: 0,
    blocked: false,
    blockExpiry: null,
    loadingState: LoadingState.IDLE,
    error: null
  });

  const {
    control,
    handleSubmit: formHandleSubmit,
    formState: { errors },
    reset,
    setError
  } = useForm<MFAFormData>({
    resolver: zodResolver(mfaSchema),
    defaultValues: {
      code: ''
    }
  });

  // Reset block after timeout
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (state.blocked && state.blockExpiry) {
      const remaining = state.blockExpiry.getTime() - Date.now();
      if (remaining > 0) {
        timeoutId = setTimeout(() => {
          setState(prev => ({
            ...prev,
            blocked: false,
            blockExpiry: null,
            attempts: 0
          }));
        }, remaining);
      }
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [state.blocked, state.blockExpiry]);

  // Secure code submission handler with rate limiting
  const handleSubmit = useCallback(async (data: MFAFormData) => {
    try {
      // Check if blocked
      if (state.blocked) {
        throw new Error('Too many attempts. Please try again later.');
      }

      setState(prev => ({
        ...prev,
        loadingState: LoadingState.LOADING,
        error: null
      }));

      // Add constant delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, MFA_INPUT_DELAY));

      // Verify MFA code
      await verifyMfa(data.code);
      await onVerify(data.code);

      setState(prev => ({
        ...prev,
        loadingState: LoadingState.SUCCEEDED
      }));

      // Clear sensitive data
      reset();

    } catch (error) {
      const newAttempts = state.attempts + 1;
      const shouldBlock = newAttempts >= maxAttempts;

      setState(prev => ({
        ...prev,
        attempts: newAttempts,
        blocked: shouldBlock,
        blockExpiry: shouldBlock ? new Date(Date.now() + timeWindow) : null,
        loadingState: LoadingState.FAILED,
        error: error instanceof Error ? error.message : 'Verification failed'
      }));

      setError('code', {
        type: 'manual',
        message: 'Invalid verification code'
      });
    }
  }, [state.attempts, state.blocked, maxAttempts, timeWindow, onVerify, verifyMfa, reset, setError]);

  // Handle component unmount cleanup
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  return (
    <Box component="form" onSubmit={formHandleSubmit(handleSubmit)} sx={{ width: '100%', maxWidth: 400 }}>
      <Typography variant="h6" gutterBottom>
        Two-Factor Authentication
      </Typography>
      
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Enter the 6-digit code from your authenticator app
      </Typography>

      <Controller
        name="code"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            type="text"
            label="Verification Code"
            error={!!errors.code}
            helperText={errors.code?.message}
            disabled={state.blocked || loading}
            inputProps={{
              maxLength: MFA_CODE_LENGTH,
              pattern: '[0-9]*',
              inputMode: 'numeric',
              autoComplete: 'one-time-code'
            }}
            sx={{ mb: 2 }}
          />
        )}
      />

      {state.error && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {state.error}
        </Typography>
      )}

      {state.blocked && state.blockExpiry && (
        <Typography color="warning" variant="body2" sx={{ mb: 2 }}>
          Too many attempts. Please try again in{' '}
          {Math.ceil((state.blockExpiry.getTime() - Date.now()) / 1000)} seconds
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          type="button"
          variant="outlined"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={state.blocked || loading}
        >
          {loading || state.loadingState === LoadingState.LOADING ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            'Verify'
          )}
        </Button>
      </Box>
    </Box>
  );
});

MFAForm.displayName = 'MFAForm';

// Error boundary wrapper for graceful error handling
const MFAFormWithErrorBoundary = withErrorBoundary(MFAForm, {
  fallback: (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography color="error">
        An error occurred while loading the MFA form. Please try again.
      </Typography>
    </Box>
  ),
  onError: (error) => {
    console.error('MFA Form Error:', error);
    // Additional error reporting logic here
  }
});

export default MFAFormWithErrorBoundary;