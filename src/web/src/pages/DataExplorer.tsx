/**
 * @fileoverview Main page component for the data exploration interface that provides
 * comprehensive data viewing, filtering, and export capabilities with enterprise-grade
 * features and accessibility compliance.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, useTheme } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';

// Internal imports
import DashboardLayout from '../layouts/DashboardLayout';
import PageHeader from '../components/common/PageHeader';
import DataExplorer from '../components/data/DataExplorer';
import ErrorBoundary from '../components/common/ErrorBoundary';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Types and utilities
import { DataFilter } from '../types/data';
import { useAuth } from '../hooks/useAuth';

/**
 * Props interface for the DataExplorer page component
 */
interface DataExplorerPageProps {
  initialFilters?: DataFilter;
  defaultView?: string;
  pageSize?: number;
}

/**
 * Main page component for data exploration functionality
 */
const DataExplorerPage: React.FC<DataExplorerPageProps> = ({
  initialFilters,
  defaultView = 'table',
  pageSize = 25
}) => {
  // Theme and auth hooks
  const theme = useTheme();
  const { user } = useAuth();

  // State management
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);

  // Export handler with analytics tracking
  const handleExport = useCallback(async (data: any[], format: string) => {
    setIsExporting(true);
    setExportError(null);

    try {
      // Track export start
      window.analytics?.track('Data Export Started', {
        format,
        dataSize: data.length,
        userId: user?.id
      });

      // Implement export logic here
      await new Promise(resolve => setTimeout(resolve, 1000)); // Placeholder

      // Track export success
      window.analytics?.track('Data Export Completed', {
        format,
        dataSize: data.length,
        userId: user?.id
      });
    } catch (error) {
      setExportError(error as Error);
      
      // Track export failure
      window.analytics?.track('Data Export Failed', {
        error: (error as Error).message,
        userId: user?.id
      });
      
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, [user]);

  // Page header actions
  const headerActions = (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {/* Add any additional header actions here */}
    </Box>
  );

  return (
    <ErrorBoundary>
      <DashboardLayout>
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing(3),
            padding: theme.spacing(3),
            backgroundColor: theme.palette.background.default
          }}
        >
          <PageHeader
            title="Data Explorer"
            subtitle="Explore and analyze scraped data with advanced filtering and export capabilities"
            actions={headerActions}
          />

          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0, // Enable proper flexbox scrolling
              borderRadius: theme.shape.borderRadius,
              backgroundColor: theme.palette.background.paper,
              boxShadow: theme.shadows[1]
            }}
          >
            <DataExplorer
              initialFilters={initialFilters}
              onExport={handleExport}
            />
          </Box>

          {/* Loading overlay */}
          {isExporting && (
            <LoadingSpinner
              overlay
              size="large"
              message="Exporting data..."
            />
          )}
        </Box>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

// Default export
export default DataExplorerPage;

// Named exports
export type { DataExplorerPageProps };