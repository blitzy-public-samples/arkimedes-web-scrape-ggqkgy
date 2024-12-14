/**
 * @fileoverview Enterprise-grade Login Page Component
 * Implements comprehensive authentication with:
 * - OAuth 2.0 + OIDC integration
 * - Multi-factor authentication (MFA)
 * - Service account support
 * - Enhanced security features
 * - Accessibility compliance
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // v6.0.0
import { 
  Typography, 
  Box, 
  Alert, 
  CircularProgress, 
  Modal,
  useTheme
} from '@mui/material'; // v5.14.0
import { useRateLimiter } from '@mantine/hooks'; // v6.0.0

import AuthLayout from '../layouts/AuthLayout';
import LoginForm from '../components/auth/LoginForm';
import useAuth from '../hooks/useAuth';

// Constants for rate limiting and security
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MFA_SETUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Enhanced Login Page Component
 * Provides secure authentication with comprehensive security features
 */
const LoginPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading, error, mfaRequired, setupMFA } = useAuth();

  // Local state management
  const [showMFASetup, setShowMFASetup] = useState<boolean>(false);
  const [mfaQRCode, setMfaQRCode] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Rate limiting hook for login attempts
  const [isRateLimited, { increment: incrementRateLimit }] = useRateLimiter({
    limit: MAX_LOGIN_ATTEMPTS,
    window: RATE_LIMIT_WINDOW,
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const intendedPath = location.state?.from?.pathname || '/dashboard';
      navigate(intendedPath, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  /**
   * Handles successful login with security checks
   */
  const handleLoginSuccess = useCallback(() => {
    if (mfaRequired) {
      handleMFASetup();
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [mfaRequired, navigate]);

  /**
   * Handles login errors with rate limiting
   */
  const handleLoginError = useCallback((errorMessage: string) => {
    incrementRateLimit();
    setLocalError(errorMessage);

    // Clear error after 5 seconds
    setTimeout(() => setLocalError(null), 5000);
  }, [incrementRateLimit]);

  /**
   * Initiates MFA setup process with timeout
   */
  const handleMFASetup = useCallback(async () => {
    try {
      const setupTimeout = setTimeout(() => {
        setShowMFASetup(false);
        setLocalError('MFA setup timeout. Please try again.');
      }, MFA_SETUP_TIMEOUT);

      const { qrCode } = await setupMFA();
      clearTimeout(setupTimeout);

      setMfaQRCode(qrCode);
      setShowMFASetup(true);
    } catch (err) {
      setLocalError('Failed to setup MFA. Please try again.');
    }
  }, [setupMFA]);

  /**
   * Handles MFA verification completion
   */
  const handleMFAComplete = useCallback((qrCode: string) => {
    setMfaQRCode(qrCode);
    setShowMFASetup(true);
  }, []);

  // Render loading state
  if (loading) {
    return (
      <AuthLayout loading={true}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          gap: theme.spacing(3),
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome Back
        </Typography>

        {(error || localError) && (
          <Alert 
            severity="error" 
            sx={{ width: '100%' }}
            onClose={() => setLocalError(null)}
          >
            {error || localError}
          </Alert>
        )}

        {isRateLimited ? (
          <Alert severity="warning" sx={{ width: '100%' }}>
            Too many login attempts. Please try again later.
          </Alert>
        ) : (
          <LoginForm
            onSuccess={handleLoginSuccess}
            onError={handleLoginError}
            onMFARequired={handleMFAComplete}
            isServiceAccount={location.state?.isServiceAccount}
          />
        )}
      </Box>

      {/* MFA Setup Modal */}
      <Modal
        open={showMFASetup}
        onClose={() => setShowMFASetup(false)}
        aria-labelledby="mfa-setup-modal"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
            maxWidth: 400,
            width: '90%',
            borderRadius: 1,
          }}
        >
          <Typography variant="h6" component="h2" gutterBottom>
            Setup Two-Factor Authentication
          </Typography>
          
          <Typography variant="body1" gutterBottom>
            Scan the QR code below with your authenticator app to complete setup.
          </Typography>

          {mfaQRCode && (
            <Box
              component="img"
              src={mfaQRCode}
              alt="MFA QR Code"
              sx={{
                width: '100%',
                height: 'auto',
                maxWidth: 200,
                display: 'block',
                margin: '20px auto',
              }}
            />
          )}
        </Box>
      </Modal>
    </AuthLayout>
  );
};

export default LoginPage;