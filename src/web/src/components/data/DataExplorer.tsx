/**
 * @fileoverview A comprehensive React component that provides a data exploration interface
 * for scraped data, including filtering, table view, detailed preview, and export capabilities.
 * Implements Material Design 3.0 and WCAG 2.1 Level AA accessibility standards.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Grid,
  Box,
  Paper,
  useMediaQuery,
  Snackbar,
  CircularProgress
} from '@mui/material'; // v5.14.0
import { useTheme } from '@mui/material/styles'; // v5.14.0
import debounce from 'lodash/debounce'; // v4.17.21

// Internal imports
import DataFilters from './DataFilters';
import DataTable from './DataTable';
import DataPreview from './DataPreview';
import ExportOptions from './ExportOptions';
import { ScrapedData, DataFilter } from '../../types/data';
import { fetchData, getDataById } from '../../api/data';
import ErrorBoundary from '../common/ErrorBoundary';

// Constants
const DEFAULT_PAGE_SIZE = 25;
const DEBOUNCE_DELAY = 300;

// Interfaces
interface DataExplorerProps {
  initialFilters?: DataFilter;
  onExport: (data: ScrapedData[], format: string) => Promise<void>;
}

/**
 * Main data explorer component with filtering, table view, and preview capabilities
 */
const DataExplorer: React.FC<DataExplorerProps> = ({
  initialFilters,
  onExport
}) => {
  // Theme and responsive layout
  const theme = useTheme();
  const isLargeScreen = useMediaQuery(theme.breakpoints.up('lg'));

  // State management
  const [filters, setFilters] = useState<DataFilter>(initialFilters || {
    status: null,
    execution_id: null,
    timeRange: null,
    page: 0,
    size: DEFAULT_PAGE_SIZE,
    sortField: null,
    sortDirection: null,
    searchTerm: null,
    metadata: {}
  });

  const [data, setData] = useState<ScrapedData[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedItem, setSelectedItem] = useState<ScrapedData | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Debounced filter handler
  const debouncedFetchData = useCallback(
    debounce(async (currentFilters: DataFilter) => {
      setLoading(true);
      try {
        const response = await fetchData(currentFilters);
        setData(response.data);
        setTotalItems(response.total);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setSnackbar({
          open: true,
          message: `Error fetching data: ${(err as Error).message}`,
          severity: 'error'
        });
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_DELAY),
    []
  );

  // Effect to fetch data when filters change
  useEffect(() => {
    debouncedFetchData(filters);
    return () => {
      debouncedFetchData.cancel();
    };
  }, [filters, debouncedFetchData]);

  // Handlers
  const handleFilterChange = useCallback((newFilters: DataFilter) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 0 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }));
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setFilters(prev => ({ ...prev, size, page: 0 }));
  }, []);

  const handleSort = useCallback((field: string, direction: 'asc' | 'desc') => {
    setFilters(prev => ({ ...prev, sortField: field, sortDirection: direction }));
  }, []);

  const handleSelectionChange = useCallback((selectedIds: string[]) => {
    setSelectedRows(selectedIds);
  }, []);

  const handleViewDetails = useCallback(async (id: string) => {
    try {
      const item = await getDataById(id);
      setSelectedItem(item);
    } catch (err) {
      setSnackbar({
        open: true,
        message: `Error loading details: ${(err as Error).message}`,
        severity: 'error'
      });
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      await onExport(
        data.filter(item => selectedRows.includes(item.id)),
        'json'
      );
      setSnackbar({
        open: true,
        message: 'Export completed successfully',
        severity: 'success'
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: `Export failed: ${(err as Error).message}`,
        severity: 'error'
      });
    }
  }, [data, selectedRows, onExport]);

  return (
    <ErrorBoundary>
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          p: 2
        }}
      >
        <Paper elevation={1} sx={{ p: 2 }}>
          <DataFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            isLoading={loading}
            error={error}
          />
        </Paper>

        <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          <Grid item xs={12} lg={isLargeScreen ? 8 : 12}>
            <DataTable
              data={data}
              isLoading={loading}
              page={filters.page}
              pageSize={filters.size}
              totalItems={totalItems}
              sortBy={filters.sortField || ''}
              sortDirection={filters.sortDirection || 'asc'}
              filters={filters}
              selectedRows={selectedRows}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onSort={handleSort}
              onFilter={handleFilterChange}
              onSelectionChange={handleSelectionChange}
              onViewDetails={handleViewDetails}
              onExport={handleExport}
            />
          </Grid>

          {isLargeScreen && (
            <Grid item lg={4}>
              <Paper elevation={1} sx={{ height: '100%', p: 2 }}>
                <DataPreview
                  data={selectedItem}
                  isLoading={loading}
                  error={error}
                />
              </Paper>
            </Grid>
          )}
        </Grid>

        {showExport && (
          <ExportOptions
            filter={filters}
            onExportStart={() => setLoading(true)}
            onExportComplete={() => {
              setLoading(false);
              setShowExport(false);
            }}
            onError={(err) => {
              setError(err);
              setLoading(false);
            }}
          />
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          message={snackbar.message}
          severity={snackbar.severity}
        />

        {loading && (
          <Box
            sx={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            <CircularProgress />
          </Box>
        )}
      </Box>
    </ErrorBoundary>
  );
};

export default DataExplorer;