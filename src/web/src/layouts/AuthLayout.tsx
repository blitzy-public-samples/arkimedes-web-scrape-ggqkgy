/**
 * @fileoverview Authentication Layout Component
 * Provides a specialized layout for authentication-related pages with enhanced accessibility,
 * responsive design, theme support, and error handling capabilities.
 * @version 1.0.0
 */

import React from 'react'; // v18.2.0
import { Box, Container, Paper, useTheme, CircularProgress } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0

import useAuth from '../hooks/useAuth';
import useMediaQuery from '../hooks/useMediaQuery';

/**
 * Props interface for the AuthLayout component
 */
interface AuthLayoutProps {
  children: React.ReactNode;
  maxWidth?: 'xs' | 'sm';
  loading?: boolean;
  error?: Error | null;
}

/**
 * Styled wrapper component for the authentication layout
 * Implements responsive design and theme-aware styling
 */
const AuthWrapper = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.default,
  transition: 'background-color 0.3s ease',
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(3),
  },
  [theme.breakpoints.up('md')]: {
    padding: theme.spacing(4),
  },
}));

/**
 * Styled container component for authentication content
 * Implements Material Design elevation and responsive sizing
 */
const AuthContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  maxWidth: '100%',
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[3],
  position: 'relative',
  overflow: 'hidden',
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4),
    maxWidth: '400px',
  },
}));

/**
 * Error fallback component for the error boundary
 */
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <Box
    role="alert"
    sx={{
      p: 3,
      color: 'error.main',
      textAlign: 'center',
    }}
  >
    <h2>Authentication Error</h2>
    <p>{error.message}</p>
  </Box>
);

/**
 * AuthLayout Component
 * Provides a consistent layout for authentication-related pages with enhanced features
 * 
 * @param {AuthLayoutProps} props - Component props
 * @returns {JSX.Element} Rendered authentication layout
 */
const AuthLayout: React.FC<AuthLayoutProps> = React.memo(({
  children,
  maxWidth = 'xs',
  loading = false,
  error = null,
}) => {
  const theme = useTheme();
  const { isAuthenticated } = useAuth();
  const { matches: isMobile } = useMediaQuery(`(max-width:${theme.breakpoints.values.sm}px)`);

  // Handle authenticated users
  React.useEffect(() => {
    if (isAuthenticated) {
      // Redirect to dashboard or intended destination
      window.location.href = '/dashboard';
    }
  }, [isAuthenticated]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AuthWrapper>
        <Container
          maxWidth={maxWidth}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <AuthContainer
            elevation={isMobile ? 0 : 3}
            aria-live="polite"
            role="main"
          >
            {loading && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  zIndex: theme.zIndex.modal,
                }}
              >
                <CircularProgress
                  aria-label="Loading"
                  size={40}
                  thickness={4}
                />
              </Box>
            )}

            {error ? (
              <ErrorFallback error={error} />
            ) : (
              <Box
                sx={{
                  width: '100%',
                  opacity: loading ? 0.5 : 1,
                  transition: 'opacity 0.3s ease',
                }}
              >
                {children}
              </Box>
            )}
          </AuthContainer>
        </Container>
      </AuthWrapper>
    </ErrorBoundary>
  );
});

// Display name for debugging
AuthLayout.displayName = 'AuthLayout';

export default AuthLayout;