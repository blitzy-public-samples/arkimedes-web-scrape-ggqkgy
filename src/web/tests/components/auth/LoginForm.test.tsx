/**
 * @fileoverview Comprehensive test suite for LoginForm component
 * Testing OAuth 2.0 + OIDC authentication, MFA support, service account flows,
 * form validation, and accessibility compliance
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.4.3
import { axe, toHaveNoViolations } from 'jest-axe'; // v4.7.3
import { vi } from 'vitest'; // v0.34.0
import { ThemeProvider, createTheme } from '@mui/material'; // v5.14.0

import LoginForm from '../../../src/components/auth/LoginForm';
import { AuthContext } from '../../../src/context/AuthContext';
import { UserRole } from '../../../src/types/auth';
import { LoadingState } from '../../../src/types/common';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock theme for Material-UI
const theme = createTheme();

// Test constants
const VALID_CREDENTIALS = {
  username: 'testuser',
  password: 'Test@12345678',
  mfaCode: '123456'
};

const VALID_SERVICE_ACCOUNT = {
  username: 'sa-1234567890abcdef1234567890abcdef',
  password: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
};

// Mock functions
const mockOnSuccess = vi.fn();
const mockOnError = vi.fn();
const mockOnMFARequired = vi.fn();

// Mock authentication context
const mockAuthContext = {
  login: vi.fn(),
  loading: false,
  error: null,
  mfaRequired: false,
  verifyMFA: vi.fn(),
  isServiceAccount: false,
  user: null
};

// Test wrapper component
const renderLoginForm = (props = {}, contextValue = mockAuthContext) => {
  return render(
    <ThemeProvider theme={theme}>
      <AuthContext.Provider value={contextValue}>
        <LoginForm
          onSuccess={mockOnSuccess}
          onError={mockOnError}
          onMFARequired={mockOnMFARequired}
          {...props}
        />
      </AuthContext.Provider>
    </ThemeProvider>
  );
};

describe('LoginForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = renderLoginForm();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      renderLoginForm();
      const user = userEvent.setup();

      // Tab through form elements
      await user.tab();
      expect(screen.getByLabelText(/username/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText(/password/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
    });
  });

  describe('Form Validation', () => {
    it('should validate required fields', async () => {
      renderLoginForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(await screen.findByText(/username.*required/i)).toBeInTheDocument();
      expect(await screen.findByText(/password.*required/i)).toBeInTheDocument();
    });

    it('should validate password complexity', async () => {
      renderLoginForm();
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.type(screen.getByLabelText(/password/i), 'weak');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(await screen.findByText(/password must contain/i)).toBeInTheDocument();
    });

    it('should handle rate limiting', async () => {
      const { rerender } = renderLoginForm();
      const user = userEvent.setup();

      // Attempt multiple failed logins
      for (let i = 0; i < 6; i++) {
        await user.type(screen.getByLabelText(/username/i), 'testuser');
        await user.type(screen.getByLabelText(/password/i), 'wrong');
        await user.click(screen.getByRole('button', { name: /sign in/i }));
        rerender(
          <ThemeProvider theme={theme}>
            <AuthContext.Provider value={{ ...mockAuthContext, error: 'Invalid credentials' }}>
              <LoginForm
                onSuccess={mockOnSuccess}
                onError={mockOnError}
                onMFARequired={mockOnMFARequired}
              />
            </AuthContext.Provider>
          </ThemeProvider>
        );
      }

      expect(await screen.findByText(/account locked/i)).toBeInTheDocument();
    });
  });

  describe('MFA Flow', () => {
    it('should handle MFA verification', async () => {
      const { rerender } = renderLoginForm({}, {
        ...mockAuthContext,
        mfaRequired: true
      });
      const user = userEvent.setup();

      // Submit initial credentials
      await user.type(screen.getByLabelText(/username/i), VALID_CREDENTIALS.username);
      await user.type(screen.getByLabelText(/password/i), VALID_CREDENTIALS.password);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Verify MFA field appears
      expect(await screen.findByLabelText(/mfa code/i)).toBeInTheDocument();

      // Submit MFA code
      await user.type(screen.getByLabelText(/mfa code/i), VALID_CREDENTIALS.mfaCode);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(mockAuthContext.verifyMFA).toHaveBeenCalledWith(VALID_CREDENTIALS.mfaCode);
    });

    it('should validate MFA code format', async () => {
      renderLoginForm({}, {
        ...mockAuthContext,
        mfaRequired: true
      });
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/mfa code/i), '12345'); // Invalid length
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(await screen.findByText(/mfa code must be exactly 6 digits/i)).toBeInTheDocument();
    });
  });

  describe('Service Account Authentication', () => {
    it('should handle service account login', async () => {
      renderLoginForm({ isServiceAccount: true });
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/service account id/i), VALID_SERVICE_ACCOUNT.username);
      await user.type(screen.getByLabelText(/api key/i), VALID_SERVICE_ACCOUNT.password);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(mockAuthContext.login).toHaveBeenCalledWith({
        username: VALID_SERVICE_ACCOUNT.username,
        password: VALID_SERVICE_ACCOUNT.password,
        isServiceAccount: true
      });
    });

    it('should validate service account ID format', async () => {
      renderLoginForm({ isServiceAccount: true });
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/service account id/i), 'invalid-format');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(await screen.findByText(/invalid service account id format/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display authentication errors', async () => {
      renderLoginForm({}, {
        ...mockAuthContext,
        error: 'Invalid credentials'
      });

      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });

    it('should handle network errors', async () => {
      renderLoginForm({}, {
        ...mockAuthContext,
        error: 'Network error'
      });

      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should disable form during submission', async () => {
      renderLoginForm({}, {
        ...mockAuthContext,
        loading: true
      });

      expect(screen.getByLabelText(/username/i)).toBeDisabled();
      expect(screen.getByLabelText(/password/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });

    it('should show loading indicator', async () => {
      renderLoginForm({}, {
        ...mockAuthContext,
        loading: true
      });

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });
});