/**
 * @fileoverview A responsive and accessible dashboard card component that displays 
 * real-time summaries of active web scraping tasks with Material Design 3.0 compliance.
 * @version 1.0.0
 */

import React, { useMemo } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Grid, 
  Tooltip, 
  Skeleton,
  useTheme 
} from '@mui/material'; // v5.14.0
import { useSelector } from 'react-redux'; // ^8.1.0
import { useDebounce } from 'use-debounce'; // ^9.0.0

import { Task, TaskStatus } from '../../types/task';
import { selectActiveTasks } from '../../store/taskSlice';
import StatusBadge from '../common/StatusBadge';
import ErrorBoundary from '../common/ErrorBoundary';

// Constants for component configuration
const CARD_MIN_HEIGHT = 240;
const REFRESH_INTERVAL = 5000;
const DEBOUNCE_DELAY = 300;

/**
 * Props interface for ActiveTasksCard component
 */
interface ActiveTasksCardProps {
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Accessibility label for screen readers */
  ariaLabel?: string;
  /** Update interval in milliseconds */
  refreshInterval?: number;
}

/**
 * Interface for task count aggregation
 */
interface TaskCounts {
  running: number;
  queued: number;
  failed: number;
}

/**
 * Memoized function to calculate task counts by status
 */
const getTaskCounts = (tasks: Task[]): TaskCounts => {
  return useMemo(() => {
    return {
      running: tasks.filter(task => task.status === TaskStatus.RUNNING).length,
      queued: tasks.filter(task => task.status === TaskStatus.PENDING).length,
      failed: tasks.filter(task => task.status === TaskStatus.FAILED).length
    };
  }, [tasks]);
};

/**
 * ActiveTasksCard component displays real-time task status summaries
 */
const ActiveTasksCard: React.FC<ActiveTasksCardProps> = ({
  className,
  ariaLabel = 'Active Tasks Summary',
  refreshInterval = REFRESH_INTERVAL
}) => {
  // Access theme for consistent styling
  const theme = useTheme();

  // Get active tasks from Redux store
  const activeTasks = useSelector(selectActiveTasks);
  
  // Debounce task updates to prevent excessive re-renders
  const [debouncedTasks] = useDebounce(activeTasks, DEBOUNCE_DELAY);
  
  // Calculate task counts with memoization
  const taskCounts = getTaskCounts(debouncedTasks);

  // Loading state when tasks are undefined
  if (!debouncedTasks) {
    return (
      <Card 
        className={className}
        sx={{ minHeight: CARD_MIN_HEIGHT }}
        aria-busy="true"
      >
        <CardContent>
          <Skeleton variant="rectangular" height={40} />
          <Skeleton variant="rectangular" height={100} sx={{ mt: 2 }} />
        </CardContent>
      </Card>
    );
  }

  return (
    <ErrorBoundary>
      <Card 
        className={className}
        sx={{ 
          minHeight: CARD_MIN_HEIGHT,
          position: 'relative'
        }}
        aria-label={ariaLabel}
        role="region"
      >
        <CardContent>
          <Typography 
            variant="h6" 
            component="h2"
            gutterBottom
            sx={{ mb: 3 }}
          >
            Active Tasks
          </Typography>

          <Grid container spacing={3}>
            {/* Running Tasks */}
            <Grid item xs={12} sm={4}>
              <Tooltip 
                title="Currently executing tasks"
                placement="top"
                arrow
              >
                <div>
                  <Typography 
                    variant="subtitle2" 
                    color="text.secondary"
                    gutterBottom
                  >
                    Running
                  </Typography>
                  <Typography variant="h4" component="div">
                    {taskCounts.running}
                  </Typography>
                  <StatusBadge 
                    status={TaskStatus.RUNNING}
                    size="small"
                    sx={{ mt: 1 }}
                  />
                </div>
              </Tooltip>
            </Grid>

            {/* Queued Tasks */}
            <Grid item xs={12} sm={4}>
              <Tooltip 
                title="Tasks waiting to be executed"
                placement="top"
                arrow
              >
                <div>
                  <Typography 
                    variant="subtitle2" 
                    color="text.secondary"
                    gutterBottom
                  >
                    Queued
                  </Typography>
                  <Typography variant="h4" component="div">
                    {taskCounts.queued}
                  </Typography>
                  <StatusBadge 
                    status={TaskStatus.PENDING}
                    size="small"
                    sx={{ mt: 1 }}
                  />
                </div>
              </Tooltip>
            </Grid>

            {/* Failed Tasks */}
            <Grid item xs={12} sm={4}>
              <Tooltip 
                title="Tasks that encountered errors"
                placement="top"
                arrow
              >
                <div>
                  <Typography 
                    variant="subtitle2" 
                    color="text.secondary"
                    gutterBottom
                    sx={{ 
                      color: taskCounts.failed > 0 ? 'error.main' : 'text.secondary' 
                    }}
                  >
                    Failed
                  </Typography>
                  <Typography 
                    variant="h4" 
                    component="div"
                    sx={{ 
                      color: taskCounts.failed > 0 ? 'error.main' : 'text.primary' 
                    }}
                  >
                    {taskCounts.failed}
                  </Typography>
                  <StatusBadge 
                    status={TaskStatus.FAILED}
                    size="small"
                    sx={{ mt: 1 }}
                  />
                </div>
              </Tooltip>
            </Grid>
          </Grid>

          {/* Auto-refresh indicator */}
          <Typography 
            variant="caption" 
            color="text.secondary"
            sx={{ 
              position: 'absolute',
              bottom: theme.spacing(2),
              right: theme.spacing(2)
            }}
          >
            Auto-refreshes every {refreshInterval / 1000} seconds
          </Typography>
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
};

export default ActiveTasksCard;