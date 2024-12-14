import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Skeleton } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0

// Constants for default and maximum values
const DEFAULT_ROWS = 5;
const DEFAULT_COLUMNS = 4;
const MAX_ROWS = 20;
const MAX_COLUMNS = 12;

// Props interface for component customization
interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  dense?: boolean;
}

// Styled components for theme-aware styling
const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  width: '100%',
  overflowX: 'auto',
  boxShadow: theme.shadows[1],
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  transition: theme.transitions.create(['background-color', 'box-shadow']),
}));

const SkeletonCell = styled(Skeleton)(({ theme }) => ({
  height: '24px',
  width: '100%',
  transform: 'none',
  backgroundColor: theme.palette.action.hover,
  borderRadius: '4px',
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
  },
}));

/**
 * TableSkeleton Component
 * 
 * A reusable loading skeleton for tables that provides a placeholder animation
 * while data is being loaded. Supports theme modes and accessibility features.
 *
 * @param {TableSkeletonProps} props - Component props
 * @returns {JSX.Element} Rendered table skeleton component
 */
const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = DEFAULT_ROWS,
  columns = DEFAULT_COLUMNS,
  dense = false,
}) => {
  // Validate props in development
  if (process.env.NODE_ENV === 'development') {
    if (rows > MAX_ROWS) {
      console.warn(`TableSkeleton: rows prop (${rows}) exceeds maximum value of ${MAX_ROWS}`);
    }
    if (columns > MAX_COLUMNS) {
      console.warn(`TableSkeleton: columns prop (${columns}) exceeds maximum value of ${MAX_COLUMNS}`);
    }
    if (rows <= 0 || columns <= 0) {
      console.warn('TableSkeleton: rows and columns must be positive numbers');
    }
  }

  // Memoize arrays for rows and columns to prevent unnecessary re-renders
  const rowArray = useMemo(() => Array(Math.min(Math.max(1, rows), MAX_ROWS)).fill(null), [rows]);
  const columnArray = useMemo(() => Array(Math.min(Math.max(1, columns), MAX_COLUMNS)).fill(null), [columns]);

  return (
    <StyledTableContainer
      component={Paper}
      aria-busy="true"
      aria-label="Loading table content"
    >
      <Table
        size={dense ? 'small' : 'medium'}
        aria-label="skeleton loading table"
      >
        <TableHead>
          <TableRow>
            {columnArray.map((_, index) => (
              <TableCell
                key={`header-${index}`}
                sx={{ py: dense ? 1.5 : 2 }}
              >
                <SkeletonCell variant="rectangular" />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rowArray.map((_, rowIndex) => (
            <TableRow
              key={`row-${rowIndex}`}
              sx={{
                '&:last-child td, &:last-child th': {
                  border: 0,
                },
              }}
            >
              {columnArray.map((_, colIndex) => (
                <TableCell
                  key={`cell-${rowIndex}-${colIndex}`}
                  sx={{ py: dense ? 1 : 1.5 }}
                >
                  <SkeletonCell
                    variant="rectangular"
                    animation="wave"
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </StyledTableContainer>
  );
};

export default TableSkeleton;
```

This implementation provides a robust, accessible, and theme-aware table skeleton component with the following features:

1. Proper TypeScript typing with a clear props interface
2. Theme integration with Material-UI v5
3. Accessibility support with proper ARIA attributes
4. Performance optimizations with useMemo
5. Responsive design with overflow handling
6. Support for both dense and regular table layouts
7. Proper validation and development warnings
8. Reduced motion support
9. Customizable number of rows and columns with reasonable limits
10. Smooth transitions for theme changes
11. Proper elevation and spacing following Material Design guidelines

The component can be used as follows:

```typescript
// Basic usage
<TableSkeleton />

// Custom configuration
<TableSkeleton 
  rows={10}
  columns={6}
  dense={true}
/>