/**
 * @fileoverview Main dashboard page component providing real-time overview of web scraping platform
 * status, active tasks, system health, and performance metrics with enhanced error handling and
 * accessibility features.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  Box,
  Container,
  Skeleton,
  useTheme,
  useMediaQuery
} from '@mui/material'; // ^5.14.0

// Internal component imports
import ActiveTasksCard from '../components/dashboard/ActiveTasksCard';
import SystemHealth from '../components/dashboard/SystemHealth';
import PerformanceChart from '../components/dashboard/PerformanceChart';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Constants and types
import { LoadingState } from '../types/common';
import { DATA_CONSTANTS, UI_CONSTANTS } from '../config/constants';

/**
 * Interface for Dashboard component props
 */
interface DashboardProps {
  /** Refresh interval in milliseconds */
  refreshInterval?: number;
  /** Initial dashboard data */
  initialData?: DashboardData;
}

/**
 * Interface for dashboard data structure
 */
interface DashboardData {
  tasks: {
    running: number;
    queued: number;
    failed: number;
  };
  systemHealth: {
    cpu: number;
    memory: number;
    storage: number;
  };
  performance: {
    timeRange: string[];
    values: number[];
  };
}

/**
 * Main dashboard component implementing real-time monitoring and metrics display
 */
const Dashboard: React.FC<DashboardProps> = ({
  refreshInterval = 30000,
  initialData
}) => {
  // Theme and responsive layout handling
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  // Component state
  const [loadingState, setLoadingState] = useState<LoadingState>(
    initialData ? LoadingState.SUCCEEDED : LoadingState.LOADING
  );
  const [isVisible, setIsVisible] = useState(true);

  /**
   * Handles window visibility changes to optimize updates
   */
  const handleVisibilityChange = useCallback(() => {
    setIsVisible(!document.hidden);
  }, []);

  // Setup visibility change listener
  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  // Grid spacing based on screen size
  const gridSpacing = isMobile ? 2 : 3;

  // Loading skeleton for components
  if (loadingState === LoadingState.LOADING) {
    return (
      <Container maxWidth="xl">
        <Box sx={{ py: 3 }}>
          <Grid container spacing={gridSpacing}>
            {[...Array(3)].map((_, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Skeleton 
                  variant="rectangular" 
                  height={240} 
                  sx={{ borderRadius: 2 }}
                />
              </Grid>
            ))}
            <Grid item xs={12}>
              <Skeleton 
                variant="rectangular" 
                height={400} 
                sx={{ borderRadius: 2 }}
              />
            </Grid>
          </Grid>
        </Box>
      </Container>
    );
  }

  return (
    <ErrorBoundary>
      <Container 
        maxWidth="xl"
        sx={{
          py: 3,
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default
        }}
      >
        <Grid 
          container 
          spacing={gridSpacing}
          sx={{ mb: 3 }}
          role="main"
          aria-label="Dashboard Overview"
        >
          {/* Active Tasks Summary */}
          <Grid item xs={12} md={4}>
            <ErrorBoundary>
              <ActiveTasksCard
                refreshInterval={refreshInterval}
                ariaLabel="Active Tasks Overview"
              />
            </ErrorBoundary>
          </Grid>

          {/* System Health Metrics */}
          <Grid item xs={12} md={4}>
            <ErrorBoundary>
              <SystemHealth />
            </ErrorBoundary>
          </Grid>

          {/* Performance Metrics */}
          <Grid item xs={12}>
            <ErrorBoundary>
              <PerformanceChart
                metricType="system"
                height={isMobile ? 300 : isTablet ? 350 : 400}
                refreshInterval={isVisible ? refreshInterval : 0}
                showLegend={!isMobile}
                ariaLabel="System Performance Chart"
              />
            </ErrorBoundary>
          </Grid>
        </Grid>
      </Container>
    </ErrorBoundary>
  );
};

export default Dashboard;