/**
 * @fileoverview Main layout component that provides the core structure for the web scraping platform interface.
 * Implements Material Design 3.0 guidelines with responsive behavior, accessibility features, and error handling.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Container, useTheme, Fade } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useAnalytics } from '@segment/analytics-next'; // v1.51.0

// Internal imports
import Sidebar from '../components/common/Sidebar';
import Topbar from '../components/common/Topbar';
import useMediaQuery from '../hooks/useMediaQuery';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Constants
const DRAWER_WIDTH = 240;
const MOBILE_BREAKPOINT = 'md';
const TRANSITION_DURATION = 300;
const SIDEBAR_STORAGE_KEY = 'sidebar_state';

// Props interface
interface MainLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  showSidebar?: boolean;
  initialDrawerOpen?: boolean;
}

// Styled components
const LayoutRoot = styled(Box)(({ theme }) => ({
  display: 'flex',
  minHeight: '100vh',
  overflow: 'hidden',
  position: 'relative',
  backgroundColor: theme.palette.background.default,
  transition: theme.transitions.create(['background-color'], {
    duration: theme.transitions.duration.standard,
  }),
}));

const MainContent = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'sidebarOpen',
})<{ sidebarOpen: boolean }>(({ theme, sidebarOpen }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  marginTop: '64px',
  overflow: 'auto',
  minHeight: 'calc(100vh - 64px)',
  backgroundColor: theme.palette.background.default,
  transition: theme.transitions.create('margin-left', {
    duration: theme.transitions.duration.standard,
  }),
  marginLeft: sidebarOpen ? DRAWER_WIDTH : 0,
  [theme.breakpoints.down(MOBILE_BREAKPOINT)]: {
    marginLeft: 0,
    padding: theme.spacing(2),
  },
}));

/**
 * Main layout component that provides the application structure with responsive behavior,
 * theme support, and accessibility features.
 */
const MainLayout: React.FC<MainLayoutProps> = React.memo(({
  children,
  pageTitle,
  showSidebar = true,
  initialDrawerOpen = true,
}) => {
  const theme = useTheme();
  const analytics = useAnalytics();
  const { matches: isMobile } = useMediaQuery(`(max-width: ${theme.breakpoints.values[MOBILE_BREAKPOINT]}px)`);

  // State for sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (isMobile) return false;
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? JSON.parse(stored) : initialDrawerOpen;
  });

  // Handle sidebar toggle
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => {
      const newState = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(newState));
      
      // Track sidebar interaction
      analytics.track('Sidebar Toggled', {
        isOpen: newState,
        viewportWidth: window.innerWidth,
        isMobile,
      });

      return newState;
    });
  }, [isMobile, analytics]);

  // Handle search functionality
  const handleSearch = useCallback((query: string) => {
    analytics.track('Global Search', {
      query,
      timestamp: new Date().toISOString(),
    });
  }, [analytics]);

  // Update sidebar state on mobile breakpoint change
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Set up keyboard navigation
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === '[' && event.ctrlKey) {
        handleSidebarToggle();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleSidebarToggle]);

  return (
    <ErrorBoundary>
      <LayoutRoot>
        <Topbar
          onMenuClick={handleSidebarToggle}
          onSearch={handleSearch}
        />
        
        {showSidebar && (
          <Fade in={true} timeout={TRANSITION_DURATION}>
            <Box component="nav" aria-label="Main navigation">
              <Sidebar
                open={sidebarOpen}
                onClose={handleSidebarToggle}
                width={DRAWER_WIDTH}
                variant={isMobile ? 'temporary' : 'permanent'}
              />
            </Box>
          </Fade>
        )}

        <MainContent
          component="main"
          sidebarOpen={sidebarOpen && showSidebar && !isMobile}
          role="main"
          aria-label={pageTitle || 'Main content'}
        >
          <Container
            maxWidth={false}
            sx={{
              height: '100%',
              py: 3,
            }}
          >
            {children}
          </Container>
        </MainContent>
      </LayoutRoot>
    </ErrorBoundary>
  );
});

MainLayout.displayName = 'MainLayout';

export default MainLayout;