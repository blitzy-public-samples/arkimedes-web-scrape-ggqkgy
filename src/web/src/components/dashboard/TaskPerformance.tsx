/**
 * @fileoverview Enhanced task performance metrics component with real-time updates,
 * sorting capabilities, and comprehensive monitoring integration.
 * @version 1.0.0
 */

import React, { useEffect, useState, useMemo, useCallback, memo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  CircularProgress,
  Alert
} from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';

import { Task, TaskMetrics } from '../../types/task';
import { getTasks } from '../../api/tasks';
import { useApi } from '../../hooks/useApi';

// Interface for component props
interface TaskPerformanceProps {
  limit: number;
  refreshInterval: number;
  onMetricsUpdate?: (metrics: TaskMetrics) => void;
}

// Interface for sorting state
interface SortConfig {
  key: keyof Task | null;
  direction: 'asc' | 'desc';
}

/**
 * Formats task duration in milliseconds to human-readable format
 * @param duration - Duration in milliseconds
 * @returns Formatted duration string
 */
const formatDuration = (duration: number): string => {
  const hours = Math.floor(duration / 3600000);
  const minutes = Math.floor((duration % 3600000) / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  const milliseconds = duration % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`;
};

/**
 * Formats success rate as percentage with appropriate precision
 * @param rate - Success rate as decimal
 * @returns Formatted percentage string
 */
const formatSuccessRate = (rate: number): string => {
  const percentage = rate * 100;
  return `${percentage.toFixed(percentage === 100 ? 0 : 1)}%`;
};

/**
 * Enhanced task performance component with real-time updates and monitoring
 */
const TaskPerformance = memo(({ limit, refreshInterval, onMetricsUpdate }: TaskPerformanceProps) => {
  // State management
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: 'asc'
  });

  // API hook for data fetching with monitoring
  const {
    data: taskData,
    loading,
    error,
    metrics,
    get: fetchTasks
  } = useApi<Task[]>();

  // Virtual scroll configuration for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: taskData?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52, // Estimated row height
    overscan: 5
  });

  // Memoized sorted data
  const sortedData = useMemo(() => {
    if (!taskData || !sortConfig.key) return taskData;

    return [...taskData].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof Task];
      const bValue = b[sortConfig.key as keyof Task];

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [taskData, sortConfig]);

  // Handle column sorting
  const handleSort = useCallback((key: keyof Task) => {
    setSortConfig(prevConfig => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  // Fetch data with refresh interval
  useEffect(() => {
    const fetchData = async () => {
      try {
        await fetchTasks();
        if (onMetricsUpdate && metrics) {
          onMetricsUpdate(metrics);
        }
      } catch (error) {
        console.error('Error fetching task data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchTasks, refreshInterval, onMetricsUpdate]);

  // Error handling
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Error loading task performance data: {error.message}
      </Alert>
    );
  }

  return (
    <Paper elevation={2}>
      <TableContainer ref={parentRef} style={{ height: '400px' }}>
        <Table stickyHeader aria-label="task performance table">
          <TableHead>
            <TableRow>
              <TableCell
                onClick={() => handleSort('id')}
                style={{ cursor: 'pointer' }}
              >
                Task ID
              </TableCell>
              <TableCell
                onClick={() => handleSort('status')}
                style={{ cursor: 'pointer' }}
              >
                Status
              </TableCell>
              <TableCell
                onClick={() => handleSort('metrics.pagesProcessed')}
                style={{ cursor: 'pointer' }}
              >
                Pages
              </TableCell>
              <TableCell
                onClick={() => handleSort('metrics.errorCount')}
                style={{ cursor: 'pointer' }}
              >
                Errors
              </TableCell>
              <TableCell
                onClick={() => handleSort('metrics.duration')}
                style={{ cursor: 'pointer' }}
              >
                Duration
              </TableCell>
              <TableCell
                onClick={() => handleSort('metrics.successRate')}
                style={{ cursor: 'pointer' }}
              >
                Success Rate
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : (
              virtualizer.getVirtualItems().map(virtualRow => {
                const task = sortedData?.[virtualRow.index];
                if (!task) return null;

                return (
                  <TableRow
                    key={task.id}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    <TableCell>{task.id}</TableCell>
                    <TableCell>
                      <Tooltip title={`Last updated: ${new Date(task.updatedAt).toLocaleString()}`}>
                        <span>{task.status}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{task.metrics.pagesProcessed}</TableCell>
                    <TableCell>
                      <Tooltip title={task.metrics.errorCount > 0 ? 'Click for error details' : ''}>
                        <span style={{ color: task.metrics.errorCount > 0 ? 'red' : 'inherit' }}>
                          {task.metrics.errorCount}
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatDuration(task.metrics.duration)}</TableCell>
                    <TableCell>{formatSuccessRate(task.metrics.successRate)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
});

TaskPerformance.displayName = 'TaskPerformance';

export default TaskPerformance;