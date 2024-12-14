/**
 * @fileoverview A React component that displays a paginated, filterable list of web scraping tasks
 * with status indicators, actions, and loading states. Implements Material Design 3.0 guidelines
 * with full accessibility support and optimized performance for large datasets.
 * @version 1.0.0
 */

import React, { useMemo, useCallback, memo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Paper,
  Tooltip,
  CircularProgress,
} from '@mui/material'; // v5.14.0
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'; // v5.14.0
import { useTranslation } from 'react-i18next'; // v13.0.0

// Internal imports
import { Task, TaskFilter, TaskMetrics, TaskStatus, SortDirection } from '../../types/task';
import TaskFilters from './TaskFilters';
import ErrorBoundary from '../common/ErrorBoundary';
import { styled } from '@mui/material/styles';

// Styled components
const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  width: '100%',
  marginTop: theme.spacing(2),
  boxShadow: theme.shadows[1],
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  position: 'relative',
  minHeight: '400px',
  overflow: 'hidden',
}));

const ActionCell = styled(TableCell)(({ theme }) => ({
  whiteSpace: 'nowrap',
  width: '120px',
  padding: theme.spacing(1),
  display: 'flex',
  gap: theme.spacing(1),
  justifyContent: 'flex-end',
}));

// Props interface
interface TaskListProps {
  tasks: Task[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  pageSize: number;
  totalItems: number;
  sortColumn: string;
  sortDirection: SortDirection;
  onPageChange: (page: number) => void;
  onSort: (column: string, direction: SortDirection) => void;
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => Promise<void>;
  onStart: (taskId: string) => Promise<void>;
  onStop: (taskId: string) => Promise<void>;
}

/**
 * TaskList component displays a paginated list of tasks with filtering and sorting capabilities
 */
const TaskList: React.FC<TaskListProps> = memo(({
  tasks,
  isLoading,
  error,
  page,
  pageSize,
  totalItems,
  sortColumn,
  sortDirection,
  onPageChange,
  onSort,
  onEdit,
  onDelete,
  onStart,
  onStop,
}) => {
  const { t } = useTranslation();

  // Memoized table columns configuration
  const columns = useMemo(() => [
    { id: 'name', label: t('tasks.columns.name'), sortable: true },
    { id: 'status', label: t('tasks.columns.status'), sortable: true },
    { id: 'lastRun', label: t('tasks.columns.lastRun'), sortable: true },
    { id: 'metrics', label: t('tasks.columns.metrics'), sortable: false },
    { id: 'actions', label: t('tasks.columns.actions'), sortable: false },
  ], [t]);

  // Handle sort header click
  const handleSortClick = useCallback((columnId: string) => {
    const newDirection = sortColumn === columnId && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(columnId, newDirection);
  }, [sortColumn, sortDirection, onSort]);

  // Format metrics for display
  const formatMetrics = useCallback((metrics: TaskMetrics) => {
    return `${metrics.pagesProcessed} pages, ${metrics.successRate}% success`;
  }, []);

  // Format date for display
  const formatDate = useCallback((date: string | null) => {
    if (!date) return t('common.never');
    return new Date(date).toLocaleString();
  }, [t]);

  // Render status with appropriate color
  const renderStatus = useCallback((status: TaskStatus) => {
    const statusColors: Record<TaskStatus, string> = {
      PENDING: 'info',
      RUNNING: 'primary',
      COMPLETED: 'success',
      FAILED: 'error',
      CANCELLED: 'warning',
    };

    return (
      <Tooltip title={t(`tasks.status.${status.toLowerCase()}.description`)}>
        <span style={{ color: `var(--mui-palette-${statusColors[status]}-main)` }}>
          {t(`tasks.status.${status.toLowerCase()}.label`)}
        </span>
      </Tooltip>
    );
  }, [t]);

  // Render table header
  const renderHeader = useCallback(() => (
    <TableHead>
      <TableRow>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            sortDirection={sortColumn === column.id ? sortDirection : false}
            onClick={() => column.sortable && handleSortClick(column.id)}
            style={{ cursor: column.sortable ? 'pointer' : 'default' }}
            aria-sort={sortColumn === column.id ? sortDirection : undefined}
          >
            {column.label}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  ), [columns, sortColumn, sortDirection, handleSortClick]);

  // Render action buttons
  const renderActions = useCallback((task: Task) => (
    <ActionCell>
      <Tooltip title={t('tasks.actions.edit')}>
        <IconButton
          size="small"
          onClick={() => onEdit(task.id)}
          aria-label={t('tasks.actions.edit')}
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
      
      <Tooltip title={task.status === TaskStatus.RUNNING ? t('tasks.actions.stop') : t('tasks.actions.start')}>
        <IconButton
          size="small"
          onClick={() => task.status === TaskStatus.RUNNING ? onStop(task.id) : onStart(task.id)}
          aria-label={task.status === TaskStatus.RUNNING ? t('tasks.actions.stop') : t('tasks.actions.start')}
          color={task.status === TaskStatus.RUNNING ? 'error' : 'primary'}
        >
          {task.status === TaskStatus.RUNNING ? <StopIcon /> : <PlayIcon />}
        </IconButton>
      </Tooltip>

      <Tooltip title={t('tasks.actions.delete')}>
        <IconButton
          size="small"
          onClick={() => onDelete(task.id)}
          aria-label={t('tasks.actions.delete')}
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Tooltip>
    </ActionCell>
  ), [t, onEdit, onStart, onStop, onDelete]);

  return (
    <ErrorBoundary>
      <StyledTableContainer component={Paper}>
        {isLoading && (
          <div style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            zIndex: 1,
          }}>
            <CircularProgress />
          </div>
        )}

        <Table aria-label={t('tasks.table.aria-label')}>
          {renderHeader()}
          <TableBody>
            {tasks.map((task) => (
              <TableRow
                key={task.id}
                hover
                role="row"
                aria-label={t('tasks.table.row.aria-label', { name: task.name })}
              >
                <TableCell>{task.name}</TableCell>
                <TableCell>{renderStatus(task.status)}</TableCell>
                <TableCell>{formatDate(task.lastRunAt)}</TableCell>
                <TableCell>{formatMetrics(task.metrics)}</TableCell>
                {renderActions(task)}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {tasks.length === 0 && !isLoading && (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--mui-palette-text-secondary)',
          }}>
            {t('tasks.table.no-data')}
          </div>
        )}
      </StyledTableContainer>
    </ErrorBoundary>
  );
});

TaskList.displayName = 'TaskList';

export default TaskList;