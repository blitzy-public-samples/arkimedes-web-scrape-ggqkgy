/**
 * @fileoverview A reusable, accessible pagination component that provides navigation controls
 * for paginated data displays, following Material Design guidelines and supporting both
 * light and dark themes with comprehensive keyboard navigation and screen reader support.
 * @version 1.0.0
 */

import React, { useCallback, useMemo } from 'react';
import { Pagination as MuiPagination, Select, Box, MenuItem } from '@mui/material'; // v5.14.0
import { styled, useTheme } from '@mui/material/styles'; // v5.14.0
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../types/common';

// Constants for pagination configuration
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEBOUNCE_DELAY = 300;

// Styled components for layout and responsiveness
const PaginationContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2),
  gap: theme.spacing(2),
  flexDirection: {
    xs: 'column',
    sm: 'row'
  },
  width: '100%'
}));

const PageSizeContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  minWidth: '120px'
}));

/**
 * Props interface for the Pagination component
 */
interface PaginationProps {
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  totalItems: number;
  /** Callback fired when page changes */
  onPageChange: (page: number) => void;
  /** Callback fired when page size changes */
  onPageSizeChange: (pageSize: number) => void;
  /** Whether to show page size selector */
  showPageSize?: boolean;
  /** Whether pagination is disabled */
  disabled?: boolean;
  /** Optional CSS class name */
  className?: string;
  /** ARIA label for the pagination component */
  ariaLabel?: string;
  /** ARIA label for page selection */
  ariaPageLabel?: string;
  /** ARIA label for page size selection */
  ariaPageSizeLabel?: string;
  /** Test ID for component testing */
  testId?: string;
}

/**
 * A reusable pagination component that provides navigation controls for paginated data displays.
 * Implements Material Design guidelines and supports accessibility features.
 */
const Pagination: React.FC<PaginationProps> = React.memo(({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  totalItems,
  onPageChange,
  onPageSizeChange,
  showPageSize = true,
  disabled = false,
  className,
  ariaLabel = 'Pagination navigation',
  ariaPageLabel = 'Go to page',
  ariaPageSizeLabel = 'Select number of items per page',
  testId = 'pagination'
}) => {
  const theme = useTheme();

  // Calculate total pages
  const totalPages = useMemo(() => 
    Math.max(1, Math.ceil(totalItems / Math.min(pageSize, MAX_PAGE_SIZE))),
    [totalItems, pageSize]
  );

  // Memoized handlers for performance
  const handlePageChange = useCallback((_: React.ChangeEvent<unknown>, value: number) => {
    if (!disabled && value !== page) {
      onPageChange(value);
    }
  }, [disabled, page, onPageChange]);

  const handlePageSizeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!disabled) {
      const newPageSize = Number(event.target.value);
      if (newPageSize !== pageSize && newPageSize <= MAX_PAGE_SIZE) {
        onPageSizeChange(newPageSize);
        // Reset to first page when changing page size
        onPageChange(1);
      }
    }
  }, [disabled, pageSize, onPageSizeChange, onPageChange]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowLeft':
        if (page > 1) onPageChange(page - 1);
        break;
      case 'ArrowRight':
        if (page < totalPages) onPageChange(page + 1);
        break;
      case 'Home':
        if (page !== 1) onPageChange(1);
        break;
      case 'End':
        if (page !== totalPages) onPageChange(totalPages);
        break;
    }
  }, [disabled, page, totalPages, onPageChange]);

  return (
    <PaginationContainer 
      className={className}
      data-testid={testId}
      role="navigation"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <MuiPagination
        page={page}
        count={totalPages}
        onChange={handlePageChange}
        disabled={disabled}
        color="primary"
        size="medium"
        showFirstButton
        showLastButton
        siblingCount={1}
        boundaryCount={1}
        getItemAriaLabel={(type, page) => `${ariaPageLabel} ${page}`}
        data-testid={`${testId}-controls`}
      />

      {showPageSize && (
        <PageSizeContainer>
          <Select
            value={pageSize}
            onChange={handlePageSizeChange}
            disabled={disabled}
            size="small"
            aria-label={ariaPageSizeLabel}
            data-testid={`${testId}-page-size`}
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <MenuItem 
                key={size} 
                value={size}
                disabled={size > MAX_PAGE_SIZE}
                data-testid={`${testId}-page-size-${size}`}
              >
                {size} items
              </MenuItem>
            ))}
          </Select>
        </PageSizeContainer>
      )}
    </PaginationContainer>
  );
});

// Display name for debugging
Pagination.displayName = 'Pagination';

export default Pagination;