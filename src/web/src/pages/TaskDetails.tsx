/**
 * @fileoverview Task Details page component for displaying and managing web scraping task information
 * Implements real-time updates, optimistic UI, and comprehensive error handling
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { 
  Card, 
  Grid, 
  Typography, 
  CircularProgress, 
  Alert,
  Button,
  Divider,
  Box
} from '@mui/material';
import { Task, TaskConfiguration, TaskValidation } from '../../types/task';
import { useWebSocket } from '../hooks/useWebSocket';
import { LoadingState, TaskStatus } from '../../types/common';
import { API_ENDPOINTS, API_CONFIG } from '../config/api';
import { WEBSOCKET_EVENTS } from '../services/websocket';

// Constants for WebSocket configuration
const WS_RECONNECT_ATTEMPTS = 5;
const WS_PING_INTERVAL = 30000;

/**
 * Interface for task details component state
 */
interface TaskDetailsState {
  task: Task | null;
  optimisticTask: Task | null;
  loadingState: LoadingState;
  error: Error | null;
  validation: TaskValidation | null;
}

/**
 * Interface for error boundary props
 */
interface TaskDetailsErrorBoundaryProps {
  children: React.ReactNode;
  onReset: () => void;
}

/**
 * Error Boundary component for handling task details errors
 */
class TaskDetailsErrorBoundary extends React.Component<
  TaskDetailsErrorBoundaryProps,
  { hasError: boolean }
> {
  constructor(props: TaskDetailsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('TaskDetails Error:', error, errorInfo);
    // Log to error monitoring service
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box p={3}>
          <Alert 
            severity="error" 
            action={
              <Button color="inherit" onClick={() => {
                this.setState({ hasError: false });
                this.props.onReset();
              }}>
                Retry
              </Button>
            }
          >
            An error occurred while displaying task details.
          </Alert>
        </Box>
      );
    }

    return this.props.children;
  }
}

/**
 * Custom hook for managing WebSocket connection for task updates
 */
const useTaskWebSocket = (taskId: string) => {
  const wsEndpoint = `${API_CONFIG.baseURL.replace('http', 'ws')}/ws/tasks/${taskId}`;
  
  const {
    isConnected,
    sendMessage,
    addEventListener,
    removeEventListener,
    connectionState,
    lastError
  } = useWebSocket(wsEndpoint, {
    reconnectAttempts: WS_RECONNECT_ATTEMPTS,
    pingInterval: WS_PING_INTERVAL,
    onError: (error) => {
      console.error('WebSocket Error:', error);
    }
  });

  return {
    isConnected,
    sendMessage,
    addEventListener,
    removeEventListener,
    connectionState,
    lastError
  };
};

/**
 * TaskDetails component for displaying and managing task information
 */
const TaskDetails: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<TaskDetailsState>({
    task: null,
    optimisticTask: null,
    loadingState: LoadingState.IDLE,
    error: null,
    validation: null
  });

  // Initialize WebSocket connection
  const ws = useTaskWebSocket(taskId!);

  /**
   * Fetch task details from API
   */
  const fetchTaskDetails = useCallback(async () => {
    if (!taskId) return;

    setState(prev => ({ ...prev, loadingState: LoadingState.LOADING }));

    try {
      const response = await fetch(
        `${API_CONFIG.baseURL}${API_ENDPOINTS.tasks.get.path.replace(':id', taskId)}`,
        {
          headers: API_CONFIG.headers
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch task details');
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        task: data.data,
        loadingState: LoadingState.SUCCEEDED
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error as Error,
        loadingState: LoadingState.FAILED
      }));
    }
  }, [taskId]);

  /**
   * Handle real-time task updates
   */
  const handleTaskUpdate = useCallback((message: any) => {
    const updatedTask = message.payload as Task;
    setState(prev => ({
      ...prev,
      task: updatedTask,
      optimisticTask: null
    }));
  }, []);

  /**
   * Update task configuration with optimistic UI
   */
  const handleTaskUpdate = useCallback(async (updates: Partial<TaskConfiguration>) => {
    if (!state.task) return;

    // Create optimistic update
    const optimisticTask = {
      ...state.task,
      configuration: {
        ...state.task.configuration,
        ...updates
      }
    };

    setState(prev => ({ ...prev, optimisticTask }));

    try {
      const response = await fetch(
        `${API_CONFIG.baseURL}${API_ENDPOINTS.tasks.update.path.replace(':id', taskId!)}`,
        {
          method: 'PUT',
          headers: API_CONFIG.headers,
          body: JSON.stringify({ configuration: updates })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        task: data.data,
        optimisticTask: null
      }));
    } catch (error) {
      // Revert optimistic update on error
      setState(prev => ({
        ...prev,
        optimisticTask: null,
        error: error as Error
      }));
    }
  }, [state.task, taskId]);

  // Set up WebSocket listeners
  useEffect(() => {
    ws.addEventListener(WEBSOCKET_EVENTS.TASK_UPDATE, handleTaskUpdate);

    return () => {
      ws.removeEventListener(WEBSOCKET_EVENTS.TASK_UPDATE, handleTaskUpdate);
    };
  }, [ws, handleTaskUpdate]);

  // Initial task details fetch
  useEffect(() => {
    fetchTaskDetails();
  }, [fetchTaskDetails]);

  // Memoized task status color
  const statusColor = useMemo(() => {
    if (!state.task) return 'default';
    switch (state.task.status) {
      case TaskStatus.RUNNING:
        return 'success';
      case TaskStatus.FAILED:
        return 'error';
      case TaskStatus.PENDING:
        return 'warning';
      default:
        return 'default';
    }
  }, [state.task]);

  if (state.loadingState === LoadingState.LOADING) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (state.loadingState === LoadingState.FAILED) {
    return (
      <Alert severity="error">
        {state.error?.message || 'Failed to load task details'}
      </Alert>
    );
  }

  const task = state.optimisticTask || state.task;
  if (!task) return null;

  return (
    <TaskDetailsErrorBoundary onReset={fetchTaskDetails}>
      <Box p={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h4" gutterBottom>
              Task Details
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <Box p={2}>
                <Typography variant="h6">
                  {task.name}
                </Typography>
                <Typography color="textSecondary" gutterBottom>
                  ID: {task.id}
                </Typography>
                <Alert severity={statusColor as any}>
                  Status: {task.status}
                </Alert>
              </Box>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <Box p={2}>
                <Typography variant="h6" gutterBottom>
                  Configuration
                </Typography>
                <Divider />
                <Box mt={2}>
                  <Typography>
                    URL: {task.configuration.url}
                  </Typography>
                  <Typography>
                    Priority: {task.configuration.priority}
                  </Typography>
                  <Typography>
                    Max Pages: {task.configuration.maxPages}
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <Box p={2}>
                <Typography variant="h6" gutterBottom>
                  Performance Metrics
                </Typography>
                <Divider />
                <Box mt={2}>
                  <Typography>
                    Pages Processed: {task.metrics.pagesProcessed}
                  </Typography>
                  <Typography>
                    Success Rate: {task.metrics.successRate}%
                  </Typography>
                  <Typography>
                    Average Processing Time: {task.metrics.avgProcessingTime}ms
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </TaskDetailsErrorBoundary>
  );
};

export default TaskDetails;