/**
 * @fileoverview Enhanced dashboard layout component providing the main application structure
 * with responsive behavior, accessibility features, and error handling.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Container, useTheme, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Outlet, useLocation } from 'react-router-dom';

// Internal imports
import Sidebar from '../components/common/Sidebar';
import Topbar from '../components/common/Topbar';
import useMediaQuery from '../hooks/useMediaQuery';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Constants for layout dimensions and transitions
const DRAWER_WIDTH = 240;
const TOPBAR_HEIGHT = 64;
const TRANSITION_DURATION = 225;

// Styled components with enhanced accessibility and responsiveness
const LayoutRoot = styled(Box)(({ theme }) => ({
  display: 'flex',
  minHeight: '100vh',
  overflow: 'hidden',
  position: 'relative',
  transition: theme.transitions.create(['margin', 'width'], {
    duration: theme.transitions.duration.standard,
  }),
}));

const MainContent = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open?: boolean }>(({ theme, open }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  marginTop: TOPBAR_HEIGHT,
  marginLeft: 0,
  minHeight: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
  backgroundColor: theme.palette.background.default,
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    marginLeft: DRAWER_WIDTH,
    transition: theme.transitions.create('margin', {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
    marginLeft: 0,
  },
}));

/**
 * Enhanced dashboard layout component with responsive behavior and accessibility features
 */
const DashboardLayout: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const { matches: isMobile } = useMediaQuery('(max-width: 768px)');
  
  // State for sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [isLoading, setIsLoading] = useState(false);

  // Handle sidebar toggle with touch support
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // Handle search functionality
  const handleSearch = useCallback((query: string) => {
    // Implement search functionality
    console.debug('Search query:', query);
  }, []);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Update sidebar state based on screen size
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // Loading state handler
  if (isLoading) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <ErrorBoundary>
      <LayoutRoot>
        <Topbar
          onMenuClick={handleSidebarToggle}
          onSearch={handleSearch}
          testId="dashboard-topbar"
        />
        
        <Sidebar
          open={sidebarOpen}
          onClose={handleSidebarToggle}
          width={DRAWER_WIDTH}
          variant={isMobile ? 'temporary' : 'permanent'}
          elevation={1}
        />

        <MainContent
          component="main"
          open={sidebarOpen && !isMobile}
          role="main"
          aria-label="main content"
        >
          <Container
            maxWidth={false}
            sx={{
              height: '100%',
              py: 3,
              '@media print': {
                margin: 0,
                padding: 0,
              },
            }}
          >
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </Container>
        </MainContent>
      </LayoutRoot>
    </ErrorBoundary>
  );
};

export default DashboardLayout;