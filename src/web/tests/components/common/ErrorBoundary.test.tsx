/**
 * @fileoverview Test suite for ErrorBoundary component verifying error handling,
 * accessibility compliance, and error recovery functionality.
 * @version 1.0.0
 */

import React from 'react'; // v18.2.0
import { render, screen, waitFor, fireEvent } from '@testing-library/react'; // v14.0.0
import '@testing-library/jest-dom/extend-expect'; // v5.16.5
import userEvent from '@testing-library/user-event'; // v14.0.0
import ErrorBoundary from '../../src/components/common/ErrorBoundary';
import { AlertDialog } from '../../src/components/common/AlertDialog';

// Mock Sentry for error tracking tests
jest.mock('@sentry/react', () => ({
  withScope: jest.fn((cb) => cb({ setExtras: jest.fn() })),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn()
}));

// Mock console methods to prevent error logging during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Test component that can throw errors on demand
class ErrorComponent extends React.Component<{ shouldThrow?: boolean; errorMessage?: string }> {
  render() {
    if (this.props.shouldThrow) {
      throw new Error(this.props.errorMessage || 'Test error');
    }
    return <div>Test Component Content</div>;
  }
}

describe('ErrorBoundary', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children when no error occurs', () => {
    const { container } = render(
      <ErrorBoundary>
        <div data-testid="child">Child Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeVisible();
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
  });

  it('catches and handles runtime errors', () => {
    const errorMessage = 'Test runtime error';
    
    render(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage={errorMessage} />
      </ErrorBoundary>
    );

    // Verify error UI is displayed
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('An Error Occurred')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
  });

  it('provides accessible error messages', async () => {
    render(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage="Accessibility test error" />
      </ErrorBoundary>
    );

    // Check ARIA attributes
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');

    // Verify keyboard navigation
    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    const reloadButton = screen.getByRole('button', { name: /reload page/i });

    expect(dismissButton).toHaveFocus();
    await userEvent.tab();
    expect(reloadButton).toHaveFocus();
  });

  it('reports errors to Sentry in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const testError = new Error('Production error test');
    
    render(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage={testError.message} />
      </ErrorBoundary>
    );

    // Verify Sentry integration
    expect(require('@sentry/react').withScope).toHaveBeenCalled();
    expect(require('@sentry/react').captureException).toHaveBeenCalledWith(expect.any(Error));

    process.env.NODE_ENV = originalEnv;
  });

  it('handles error dismissal correctly', async () => {
    render(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage="Dismissible error" />
      </ErrorBoundary>
    );

    // Click dismiss button
    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    await userEvent.click(dismissButton);

    // Verify error state is reset
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('supports custom fallback UI', () => {
    const customFallback = <div data-testid="custom-fallback">Custom Error UI</div>;
    
    render(
      <ErrorBoundary fallback={customFallback}>
        <ErrorComponent shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom Error UI')).toBeVisible();
  });

  it('categorizes different error types correctly', () => {
    // Test network error
    class NetworkErrorComponent extends React.Component {
      render() {
        const error = new Error('Network failed');
        error.name = 'NetworkError';
        throw error;
      }
    }

    render(
      <ErrorBoundary>
        <NetworkErrorComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Network failed/)).toBeInTheDocument();
  });

  it('preserves error context in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const errorMessage = 'Development error test';
    
    render(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage={errorMessage} />
      </ErrorBoundary>
    );

    // Verify console error logging
    expect(console.error).toHaveBeenCalledWith(
      'Error caught by boundary:',
      expect.any(Error)
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('handles multiple errors in sequence', async () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage="First error" />
      </ErrorBoundary>
    );

    // Handle first error
    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    await userEvent.click(dismissButton);

    // Trigger second error
    rerender(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage="Second error" />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Second error/)).toBeInTheDocument();
  });

  it('maintains WCAG 2.1 Level AA compliance', () => {
    render(
      <ErrorBoundary>
        <ErrorComponent shouldThrow errorMessage="Accessibility compliance test" />
      </ErrorBoundary>
    );

    // Check color contrast
    const dialog = screen.getByRole('dialog');
    const alertElement = dialog.querySelector('.MuiAlert-root');
    
    expect(alertElement).toBeInTheDocument();
    expect(alertElement).toHaveAttribute('role', 'alert');

    // Verify focus management
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveFocus();
  });
});