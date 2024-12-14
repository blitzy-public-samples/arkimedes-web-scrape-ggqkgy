import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Divider,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'; // v5.14.0
import {
  Security as SecurityIcon,
  QrCode2 as QrCodeIcon,
  Key as KeyIcon,
  Warning as WarningIcon,
} from '@mui/icons-material'; // v5.14.0
import { QRCode } from 'qrcode.react'; // v3.1.0

import useAuth from '../../hooks/useAuth';
import { User } from '../../types/auth';
import { setupMFA, verifyMFA } from '../../services/auth';
import { setItem } from '../../utils/storage';

interface UserSettingsState {
  isEditMode: boolean;
  isMFASetupMode: boolean;
  mfaCode: string;
  mfaSetupData: {
    qrCode: string;
    secret: string;
    recoveryKeys: string[];
  } | null;
  isSessionActive: boolean;
  sessionTimeout: number | null;
  formData: {
    username: string;
    email: string;
  };
}

const UserSettings: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const [state, setState] = useState<UserSettingsState>({
    isEditMode: false,
    isMFASetupMode: false,
    mfaCode: '',
    mfaSetupData: null,
    isSessionActive: true,
    sessionTimeout: null,
    formData: {
      username: user?.username || '',
      email: user?.email || '',
    },
  });

  // Session monitoring
  useEffect(() => {
    let sessionTimer: NodeJS.Timeout;
    let warningTimer: NodeJS.Timeout;

    const resetSessionTimers = () => {
      if (sessionTimer) clearTimeout(sessionTimer);
      if (warningTimer) clearTimeout(warningTimer);

      // Set session timeout (30 minutes)
      const sessionDuration = 30 * 60 * 1000;
      const warningTime = sessionDuration - (5 * 60 * 1000); // 5 minutes before timeout

      warningTimer = setTimeout(() => {
        setState(prev => ({
          ...prev,
          sessionTimeout: 5 * 60, // 5 minutes remaining
        }));
      }, warningTime);

      sessionTimer = setTimeout(() => {
        handleSessionTimeout();
      }, sessionDuration);
    };

    const handleUserActivity = () => {
      if (state.isSessionActive) {
        resetSessionTimers();
      }
    };

    // Monitor user activity
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keypress', handleUserActivity);

    resetSessionTimers();

    return () => {
      if (sessionTimer) clearTimeout(sessionTimer);
      if (warningTimer) clearTimeout(warningTimer);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keypress', handleUserActivity);
    };
  }, [state.isSessionActive]);

  const handleSessionTimeout = async () => {
    setState(prev => ({ ...prev, isSessionActive: false }));
    await logout();
  };

  const handleProfileUpdate = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      // Validate form inputs
      if (!state.formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error('Invalid email format');
      }

      // TODO: Implement profile update API call
      
      setState(prev => ({ ...prev, isEditMode: false }));
    } catch (error) {
      console.error('Profile update failed:', error);
    }
  };

  const handleMFASetup = async () => {
    try {
      const mfaSetup = await setupMFA();
      setState(prev => ({
        ...prev,
        isMFASetupMode: true,
        mfaSetupData: mfaSetup,
      }));
    } catch (error) {
      console.error('MFA setup failed:', error);
    }
  };

  const handleMFAVerification = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      if (!/^\d{6}$/.test(state.mfaCode)) {
        throw new Error('Invalid MFA code format');
      }

      const verified = await verifyMFA(state.mfaCode);
      if (verified) {
        // Store MFA verification status securely
        await setItem('mfa_verified', true, true);
        setState(prev => ({
          ...prev,
          isMFASetupMode: false,
          mfaSetupData: null,
          mfaCode: '',
        }));
      }
    } catch (error) {
      console.error('MFA verification failed:', error);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box component="section" aria-label="User Settings" p={3}>
      <Paper elevation={3}>
        <Box p={3}>
          <Typography variant="h5" component="h1" gutterBottom>
            User Settings
          </Typography>

          {/* Profile Settings */}
          <Box mb={4}>
            <Typography variant="h6" gutterBottom>
              Profile Information
            </Typography>
            <form onSubmit={handleProfileUpdate}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Username"
                    value={state.formData.username}
                    onChange={e => setState(prev => ({
                      ...prev,
                      formData: { ...prev.formData, username: e.target.value }
                    }))}
                    disabled={!state.isEditMode}
                    aria-label="Username"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={state.formData.email}
                    onChange={e => setState(prev => ({
                      ...prev,
                      formData: { ...prev.formData, email: e.target.value }
                    }))}
                    disabled={!state.isEditMode}
                    aria-label="Email"
                  />
                </Grid>
              </Grid>
              <Box mt={2}>
                {state.isEditMode ? (
                  <>
                    <Button type="submit" variant="contained" color="primary">
                      Save Changes
                    </Button>
                    <Button
                      onClick={() => setState(prev => ({ ...prev, isEditMode: false }))}
                      variant="outlined"
                      sx={{ ml: 2 }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setState(prev => ({ ...prev, isEditMode: true }))}
                    variant="outlined"
                  >
                    Edit Profile
                  </Button>
                )}
              </Box>
            </form>
          </Box>

          <Divider />

          {/* Security Settings */}
          <Box mt={4}>
            <Typography variant="h6" gutterBottom>
              Security Settings
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={user?.mfaEnabled || false}
                      onChange={() => !user?.mfaEnabled && handleMFASetup()}
                      color="primary"
                    />
                  }
                  label="Two-Factor Authentication (2FA)"
                />
              </Grid>
            </Grid>
          </Box>

          {/* Session Information */}
          {state.sessionTimeout && (
            <Alert
              severity="warning"
              icon={<WarningIcon />}
              sx={{ mt: 2 }}
            >
              Your session will expire in {Math.floor(state.sessionTimeout / 60)} minutes.
              Click anywhere to extend your session.
            </Alert>
          )}
        </Box>
      </Paper>

      {/* MFA Setup Dialog */}
      <Dialog
        open={state.isMFASetupMode}
        onClose={() => setState(prev => ({ ...prev, isMFASetupMode: false }))}
        aria-labelledby="mfa-setup-dialog"
      >
        <DialogTitle id="mfa-setup-dialog">
          Set Up Two-Factor Authentication
        </DialogTitle>
        <DialogContent>
          {state.mfaSetupData && (
            <Box textAlign="center" my={2}>
              <QRCode value={state.mfaSetupData.qrCode} size={200} />
              <Typography variant="body2" color="textSecondary" mt={2}>
                Scan this QR code with your authenticator app
              </Typography>
              <TextField
                fullWidth
                label="Enter 6-digit code"
                value={state.mfaCode}
                onChange={e => setState(prev => ({ ...prev, mfaCode: e.target.value }))}
                margin="normal"
                inputProps={{ maxLength: 6, pattern: '[0-9]*' }}
              />
              {state.mfaSetupData.recoveryKeys.length > 0 && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Recovery Keys (Save these securely)
                  </Typography>
                  {state.mfaSetupData.recoveryKeys.map((key, index) => (
                    <Typography key={index} variant="body2">
                      {key}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setState(prev => ({ ...prev, isMFASetupMode: false }))}>
            Cancel
          </Button>
          <Button
            onClick={handleMFAVerification}
            variant="contained"
            color="primary"
            disabled={!state.mfaCode}
          >
            Verify
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserSettings;