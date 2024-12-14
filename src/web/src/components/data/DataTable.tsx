/**
 * @fileoverview A sophisticated data table component for displaying scraped data with advanced features
 * including sorting, filtering, pagination, and status indicators. Implements virtualization for large
 * datasets and follows Material Design guidelines with full accessibility compliance.
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Checkbox,
  Menu,
  MenuItem,
} from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import {
  VisibilityIcon,
  GetAppIcon,
  FilterListIcon,
  SortIcon,
  MoreVertIcon,
} from '@mui/icons-material'; // v5.14.0
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.0.0

import { ScrapedData } from '../../types/data';
import TableSkeleton from '../common/TableSkeleton';
import Pagination from '../common/Pagination';
import StatusBadge from '../common/StatusBadge';
import DataPreview from './DataPreview';

// Column configuration for the data table
const COLUMNS = [
  {
    id: 'id',
    label: 'ID',
    width: '100px',
    sortable: true,
    filterable: true,
    resizable: true,
  },
  {
    id: 'status',
    label: 'Status',
    width: '120px',
    sortable: true,
    filterable: true,
    resizable: true,
  },
  {
    id: 'collected_at',
    label: 'Collected At',
    width: '180px',
    sortable: true,
    filterable: true,
    resizable: true,
  },
  {
    id: 'version',
    label: 'Version',
    width: '100px',
    sortable: true,
    filterable: true,
    resizable: true,
  },
  {
    id: 'actions',
    label: 'Actions',
    width: '120px',
    sortable: false,
    filterable: false,
    resizable: false,
  },
] as const;

// Styled components
const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  width: '100%',
  overflowX: 'auto',
  boxShadow: theme.shadows[1],
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  position: 'relative',
  minHeight: '400px',
}));

const ActionCell = styled(TableCell)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1),
  justifyContent: 'flex-end',
  padding: theme.spacing(1, 2),
  alignItems: 'center',
}));

const TableToolbar = styled('div')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: theme.spacing(2),
  borderBottom: '1px solid',
  borderColor: theme.palette.divider,
}));

// Component interfaces
interface DataTableProps {
  data: ScrapedData[];
  isLoading: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  filters: Record<string, any>;
  selectedRows: string[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSort: (column: string, direction: 'asc' | 'desc') => void;
  onFilter: (filters: Record<string, any>) => void;
  onSelectionChange: (selectedIds: string[]) => void;
  onViewDetails: (id: string) => void;
  onExport: (ids: string[]) => void;
}

/**
 * DataTable component for displaying scraped data with advanced features
 */
const DataTable: React.FC<DataTableProps> = ({
  data,
  isLoading,
  page,
  pageSize,
  totalItems,
  sortBy,
  sortDirection,
  filters,
  selectedRows,
  onPageChange,
  onPageSizeChange,
  onSort,
  onFilter,
  onSelectionChange,
  onViewDetails,
  onExport,
}) => {
  // Local state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeRow, setActiveRow] = useState<string | null>(null);

  // Virtualization setup
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 53, // Approximate row height
    overscan: 5,
  });

  // Memoized handlers
  const handleSort = useCallback((column: string) => {
    const newDirection = sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(column, newDirection);
  }, [sortBy, sortDirection, onSort]);

  const handleSelectAll = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newSelected = event.target.checked ? data.map(item => item.id) : [];
    onSelectionChange(newSelected);
  }, [data, onSelectionChange]);

  const handleSelectRow = useCallback((id: string) => {
    const selectedIndex = selectedRows.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = [...selectedRows, id];
    } else {
      newSelected = selectedRows.filter(itemId => itemId !== id);
    }

    onSelectionChange(newSelected);
  }, [selectedRows, onSelectionChange]);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, id: string) => {
    setAnchorEl(event.currentTarget);
    setActiveRow(id);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setActiveRow(null);
  }, []);

  // Render loading state
  if (isLoading) {
    return <TableSkeleton rows={pageSize} columns={COLUMNS.length} />;
  }

  return (
    <div>
      <TableToolbar>
        <div>
          <Tooltip title="Filter list">
            <IconButton onClick={() => onFilter(filters)}>
              <FilterListIcon />
            </IconButton>
          </Tooltip>
          {selectedRows.length > 0 && (
            <Tooltip title="Export selected">
              <IconButton onClick={() => onExport(selectedRows)}>
                <GetAppIcon />
              </IconButton>
            </Tooltip>
          )}
        </div>
        <div>{`${selectedRows.length} selected`}</div>
      </TableToolbar>

      <StyledTableContainer component={Paper} ref={parentRef}>
        <Table stickyHeader aria-label="scraped data table">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedRows.length > 0 && selectedRows.length < data.length}
                  checked={data.length > 0 && selectedRows.length === data.length}
                  onChange={handleSelectAll}
                  inputProps={{ 'aria-label': 'select all items' }}
                />
              </TableCell>
              {COLUMNS.map(column => (
                <TableCell
                  key={column.id}
                  style={{ width: column.width }}
                  sortDirection={sortBy === column.id ? sortDirection : false}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {column.label}
                    {column.sortable && (
                      <IconButton
                        size="small"
                        onClick={() => handleSort(column.id)}
                        aria-label={`Sort by ${column.label}`}
                      >
                        <SortIcon />
                      </IconButton>
                    )}
                  </div>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const item = data[virtualRow.index];
              const isSelected = selectedRows.includes(item.id);

              return (
                <TableRow
                  key={item.id}
                  hover
                  selected={isSelected}
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleSelectRow(item.id)}
                      inputProps={{ 'aria-label': `Select item ${item.id}` }}
                    />
                  </TableCell>
                  <TableCell>{item.id}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.validation_status} />
                  </TableCell>
                  <TableCell>{new Date(item.collected_at).toLocaleString()}</TableCell>
                  <TableCell>{item.version}</TableCell>
                  <ActionCell>
                    <Tooltip title="View details">
                      <IconButton
                        onClick={() => onViewDetails(item.id)}
                        size="small"
                        aria-label={`View details for item ${item.id}`}
                      >
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                    <IconButton
                      onClick={(e) => handleMenuOpen(e, item.id)}
                      size="small"
                      aria-label="More actions"
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </ActionCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </StyledTableContainer>

      <Pagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => {
          if (activeRow) onExport([activeRow]);
          handleMenuClose();
        }}>
          Export
        </MenuItem>
      </Menu>
    </div>
  );
};

export default DataTable;