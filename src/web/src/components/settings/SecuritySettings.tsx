/**
 * @fileoverview React component for managing comprehensive security settings
 * including authentication configuration, password policies, MFA settings,
 * session management, and API key administration.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react'; // ^18.2.0
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  TextField,
  Button,
  FormControlLabel,
  Select,
  MenuItem,
  Tooltip,
  Dialog,
  Alert
} from '@mui/material'; // ^5.14.0
import { useForm } from 'react-hook-form'; // ^7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.22.0
import { z } from 'zod'; // ^3.21.4
import QRCode from 'qrcode.react'; // ^3.1.0
import { useDispatch, useSelector } from 'react-redux';

// Validation schema for security settings
const securitySettingsSchema = z.object({
  passwordPolicy: z.object({
    minLength: z.number().min(8).max(128),
    requireSpecialChars: z.boolean(),
    requireNumbers: z.boolean(),
    requireUppercase: z.boolean(),
    expiryDays: z.number().min(0).max(365),
    historyCount: z.number().min(0).max(24)
  }),
  mfaSettings: z.object({
    enabled: z.boolean(),
    requiredForRoles: z.array(z.string()),
    recoveryCodesCount: z.number().min(8).max(16)
  }),
  sessionSettings: z.object({
    timeout: z.number().min(5).max(1440), // minutes
    maxConcurrentSessions: z.number().min(1).max(10),
    enforceDeviceLimit: z.boolean()
  }),
  apiKeySettings: z.object({
    enabled: z.boolean(),
    expiryDays: z.number().min(1).max(365),
    rotationPeriod: z.number().min(1).max(90),
    allowedScopes: z.array(z.string())
  })
});

type SecuritySettingsFormData = z.infer<typeof securitySettingsSchema>;

/**
 * SecuritySettings component for managing comprehensive security configuration
 */
const SecuritySettings: React.FC = () => {
  const dispatch = useDispatch();
  const [showMFADialog, setShowMFADialog] = useState(false);
  const [mfaSecret, setMFASecret] = useState<string | null>(null);
  const [recoveryKeys, setRecoveryKeys] = useState<string[]>([]);

  // Get current settings from Redux store
  const currentSettings = useSelector((state: any) => state.settings.security);
  const loading = useSelector((state: any) => state.settings.loading);

  // Initialize form with react-hook-form
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SecuritySettingsFormData>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: currentSettings
  });

  // Watch MFA enabled status for conditional rendering
  const mfaEnabled = watch('mfaSettings.enabled');

  /**
   * Handles MFA setup process including QR code generation and recovery keys
   */
  const handleMFASetup = useCallback(async (enabled: boolean) => {
    if (enabled) {
      try {
        // Generate MFA secret and recovery keys
        const response = await fetch('/api/v1/auth/mfa/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        const { secret, recoveryCodes } = await response.json();
        setMFASecret(secret);
        setRecoveryKeys(recoveryCodes);
        setShowMFADialog(true);
      } catch (error) {
        console.error('MFA setup failed:', error);
      }
    } else {
      // Disable MFA
      try {
        await fetch('/api/v1/auth/mfa/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        setMFASecret(null);
        setRecoveryKeys([]);
      } catch (error) {
        console.error('MFA disable failed:', error);
      }
    }
  }, []);

  /**
   * Handles API key rotation with grace period
   */
  const handleAPIKeyRotation = useCallback(async (keyId: string) => {
    try {
      const response = await fetch(`/api/v1/security/api-keys/${keyId}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        // Handle successful rotation
        const { newKey } = await response.json();
        // Update UI with new key information
      }
    } catch (error) {
      console.error('API key rotation failed:', error);
    }
  }, []);

  /**
   * Handles form submission with validation
   */
  const onSubmit = async (data: SecuritySettingsFormData) => {
    try {
      // Dispatch update action
      await dispatch({
        type: 'settings/updateSecuritySettings',
        payload: data
      });

      // Log security settings change to audit log
      await fetch('/api/v1/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SECURITY_SETTINGS_UPDATE',
          details: data
        })
      });
    } catch (error) {
      console.error('Failed to update security settings:', error);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, margin: '0 auto', padding: 3 }}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Password Policy Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Password Policy
            </Typography>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField
                {...register('passwordPolicy.minLength')}
                label="Minimum Password Length"
                type="number"
                error={!!errors.passwordPolicy?.minLength}
                helperText={errors.passwordPolicy?.minLength?.message}
              />
              <FormControlLabel
                control={
                  <Switch {...register('passwordPolicy.requireSpecialChars')} />
                }
                label="Require Special Characters"
              />
              <TextField
                {...register('passwordPolicy.expiryDays')}
                label="Password Expiry (Days)"
                type="number"
                error={!!errors.passwordPolicy?.expiryDays}
                helperText={errors.passwordPolicy?.expiryDays?.message}
              />
            </Box>
          </CardContent>
        </Card>

        {/* MFA Settings Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Multi-Factor Authentication
            </Typography>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    {...register('mfaSettings.enabled')}
                    onChange={(e) => handleMFASetup(e.target.checked)}
                  />
                }
                label="Enable MFA"
              />
              <Select
                multiple
                {...register('mfaSettings.requiredForRoles')}
                disabled={!mfaEnabled}
                label="Required for Roles"
              >
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="operator">Operator</MenuItem>
                <MenuItem value="analyst">Analyst</MenuItem>
              </Select>
            </Box>
          </CardContent>
        </Card>

        {/* Session Management Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Session Management
            </Typography>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField
                {...register('sessionSettings.timeout')}
                label="Session Timeout (Minutes)"
                type="number"
                error={!!errors.sessionSettings?.timeout}
                helperText={errors.sessionSettings?.timeout?.message}
              />
              <TextField
                {...register('sessionSettings.maxConcurrentSessions')}
                label="Max Concurrent Sessions"
                type="number"
                error={!!errors.sessionSettings?.maxConcurrentSessions}
                helperText={errors.sessionSettings?.maxConcurrentSessions?.message}
              />
            </Box>
          </CardContent>
        </Card>

        {/* API Key Management Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              API Key Management
            </Typography>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch {...register('apiKeySettings.enabled')} />
                }
                label="Enable API Keys"
              />
              <TextField
                {...register('apiKeySettings.expiryDays')}
                label="API Key Expiry (Days)"
                type="number"
                error={!!errors.apiKeySettings?.expiryDays}
                helperText={errors.apiKeySettings?.expiryDays?.message}
              />
              <TextField
                {...register('apiKeySettings.rotationPeriod')}
                label="Key Rotation Period (Days)"
                type="number"
                error={!!errors.apiKeySettings?.rotationPeriod}
                helperText={errors.apiKeySettings?.rotationPeriod?.message}
              />
            </Box>
          </CardContent>
        </Card>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            type="submit"
            disabled={loading}
          >
            Save Settings
          </Button>
        </Box>
      </form>

      {/* MFA Setup Dialog */}
      <Dialog open={showMFADialog} onClose={() => setShowMFADialog(false)}>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            MFA Setup
          </Typography>
          {mfaSecret && (
            <>
              <QRCode value={mfaSecret} size={200} />
              <Typography variant="body2" sx={{ mt: 2 }}>
                Scan this QR code with your authenticator app
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>
                Recovery Keys:
              </Typography>
              {recoveryKeys.map((key, index) => (
                <Typography key={index} variant="body2">
                  {key}
                </Typography>
              ))}
              <Alert severity="warning" sx={{ mt: 2 }}>
                Save these recovery keys in a secure location. They will not be shown again.
              </Alert>
            </>
          )}
        </Box>
      </Dialog>
    </Box>
  );
};

export default SecuritySettings;