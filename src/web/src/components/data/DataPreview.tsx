/**
 * @fileoverview A React component that displays formatted previews of scraped data
 * with support for raw and transformed data views, proper JSON formatting,
 * and WCAG 2.1 Level AA accessibility compliance.
 * @version 1.0.0
 */

import React, { useState, useCallback, useMemo } from 'react'; // v18.2.0
import { Box, Tab, Tabs, Paper } from '@mui/material'; // v5.14.0
import { styled, useTheme } from '@mui/material/styles'; // v5.14.0
import { ScrapedData } from '../../types/data';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBoundary from '../common/ErrorBoundary';

// Tab indices for data views
const TAB_INDICES = {
  RAW: 0,
  TRANSFORMED: 1,
} as const;

/**
 * Props interface for DataPreview component
 */
interface DataPreviewProps {
  /** Scraped data item to preview, null when no data available */
  data: ScrapedData | null;
  /** Loading state indicator for async data fetching */
  isLoading: boolean;
  /** Error state for handling data loading or parsing failures */
  error: Error | null;
}

/**
 * Styled container component for the preview area
 */
const PreviewContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  height: '100%',
  overflow: 'auto',
  backgroundColor: theme.palette.background.paper,
  transition: theme.transitions.create(['background-color']),
  borderRadius: theme.shape.borderRadius,
}));

/**
 * Styled component for JSON preview with proper formatting
 */
const JsonPreview = styled(Box)(({ theme }) => ({
  fontFamily: theme.typography.fontFamilyMono,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: '0.875rem',
  lineHeight: '1.5',
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.default,
  borderRadius: theme.shape.borderRadius,
  color: theme.palette.text.primary,
  transition: theme.transitions.create(['background-color', 'color']),
}));

/**
 * Formats JSON data with proper indentation and handles circular references
 * @param data - Object to format as JSON
 * @returns Formatted JSON string
 */
const formatJson = (data: Record<string, any>): string => {
  try {
    // Handle null or undefined input
    if (!data) return 'No data available';

    // Use custom replacer to handle circular references
    const getCircularReplacer = () => {
      const seen = new WeakSet();
      return (key: string, value: any) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      };
    };

    // Format with 2-space indentation
    return JSON.stringify(data, getCircularReplacer(), 2);
  } catch (error) {
    console.error('Error formatting JSON:', error);
    return 'Error formatting data';
  }
};

/**
 * DataPreview component displays formatted scraped data with raw and transformed views
 */
const DataPreview: React.FC<DataPreviewProps> = ({
  data,
  isLoading,
  error,
}) => {
  // Theme and state management
  const theme = useTheme();
  const [selectedTab, setSelectedTab] = useState(TAB_INDICES.RAW);

  /**
   * Handles tab change with keyboard support
   */
  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  }, []);

  /**
   * Memoized formatted data for both views
   */
  const formattedData = useMemo(() => ({
    raw: data ? formatJson(data.raw_data) : '',
    transformed: data ? formatJson(data.transformed_data) : '',
  }), [data]);

  // Loading state
  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <LoadingSpinner size="large" message="Loading data preview..." />
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box
        role="alert"
        aria-live="polite"
        color="error.main"
        p={2}
        borderRadius={1}
      >
        Error loading data preview: {error.message}
      </Box>
    );
  }

  // No data state
  if (!data) {
    return (
      <Box
        role="status"
        aria-live="polite"
        color="text.secondary"
        p={2}
        textAlign="center"
      >
        No data available for preview
      </Box>
    );
  }

  return (
    <ErrorBoundary>
      <PreviewContainer elevation={2}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={selectedTab}
            onChange={handleTabChange}
            aria-label="Data preview tabs"
            variant="fullWidth"
          >
            <Tab
              label="Raw Data"
              id="data-preview-tab-0"
              aria-controls="data-preview-panel-0"
              aria-selected={selectedTab === TAB_INDICES.RAW}
            />
            <Tab
              label="Transformed Data"
              id="data-preview-tab-1"
              aria-controls="data-preview-panel-1"
              aria-selected={selectedTab === TAB_INDICES.TRANSFORMED}
            />
          </Tabs>
        </Box>

        <Box
          role="tabpanel"
          hidden={selectedTab !== TAB_INDICES.RAW}
          id="data-preview-panel-0"
          aria-labelledby="data-preview-tab-0"
          tabIndex={0}
        >
          <JsonPreview>{formattedData.raw}</JsonPreview>
        </Box>

        <Box
          role="tabpanel"
          hidden={selectedTab !== TAB_INDICES.TRANSFORMED}
          id="data-preview-panel-1"
          aria-labelledby="data-preview-tab-1"
          tabIndex={0}
        >
          <JsonPreview>{formattedData.transformed}</JsonPreview>
        </Box>
      </PreviewContainer>
    </ErrorBoundary>
  );
};

export default DataPreview;