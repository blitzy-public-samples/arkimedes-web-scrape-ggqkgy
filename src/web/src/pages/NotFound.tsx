/**
 * @fileoverview Production-ready 404 Not Found page component with comprehensive error tracking,
 * accessibility features, and theme-aware styling following Material Design 3.0 guidelines.
 * @version 1.0.0
 */

import React, { useCallback } from 'react';
import { Box, Button, Container, Typography, useTheme } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';

// Internal imports
import MainLayout from '../layouts/MainLayout';
import PageHeader from '../components/common/PageHeader';

/**
 * NotFound component displays a user-friendly 404 error page with navigation options
 * and automatic error tracking.
 */
const NotFound: React.FC = React.memo(() => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Track 404 errors in production
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureMessage('404 Page Not Found', {
        level: 'warning',
        tags: {
          path: location.pathname,
          referrer: document.referrer,
        },
      });
    }
  }, [location.pathname]);

  // Memoized navigation handler
  const handleNavigateHome = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  // Memoized back navigation handler
  const handleNavigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <MainLayout pageTitle="Page Not Found">
      <PageHeader 
        title="404: Page Not Found"
        subtitle="The page you're looking for doesn't exist or has been moved."
      />
      
      <Container maxWidth="md">
        <Box
          component="main"
          role="main"
          aria-labelledby="404-title"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '50vh',
            textAlign: 'center',
            padding: theme.spacing(3),
          }}
        >
          <Typography
            id="404-title"
            variant="h1"
            color="text.primary"
            gutterBottom
            sx={{
              fontSize: {
                xs: '2rem',
                sm: '3rem',
              },
              fontWeight: 'bold',
              marginBottom: theme.spacing(2),
            }}
          >
            Page Not Found
          </Typography>

          <Typography
            variant="h6"
            color="text.secondary"
            sx={{
              maxWidth: '600px',
              marginBottom: theme.spacing(4),
              lineHeight: 1.6,
            }}
          >
            We couldn't find the page you're looking for. Please check the URL or
            navigate back to continue using the application.
          </Typography>

          <Box
            sx={{
              display: 'flex',
              gap: theme.spacing(2),
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleNavigateHome}
              aria-label="Return to homepage"
              sx={{
                minWidth: '200px',
                [theme.breakpoints.down('sm')]: {
                  width: '100%',
                },
              }}
            >
              Go to Homepage
            </Button>
            
            <Button
              variant="outlined"
              color="primary"
              size="large"
              onClick={handleNavigateBack}
              aria-label="Go back to previous page"
              sx={{
                minWidth: '200px',
                [theme.breakpoints.down('sm')]: {
                  width: '100%',
                },
              }}
            >
              Go Back
            </Button>
          </Box>
        </Box>
      </Container>
    </MainLayout>
  );
});

// Display name for debugging
NotFound.displayName = 'NotFound';

export default NotFound;