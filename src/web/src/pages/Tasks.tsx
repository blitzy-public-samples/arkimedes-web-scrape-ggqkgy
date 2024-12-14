/**
 * @fileoverview Enterprise-grade task management interface component providing comprehensive
 * task operations, real-time updates, role-based access control, and optimized performance.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Container,
  Button,
  Dialog,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material'; // v5.14.0
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import TaskList from '../components/tasks/TaskList';
import TaskForm from '../components/tasks/TaskForm';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { Task, TaskFilter, TaskStatus } from '../types/task';

// Constants
const ITEMS_PER_PAGE = 25;
const INITIAL_PAGE = 1;
const SEARCH_DEBOUNCE_MS = 300;
const WS_RECONNECT_INTERVAL = 5000;
const OPERATION_TIMEOUT = 30000;

/**
 * Interface for Tasks page state management
 */
interface TasksPageState {
  isFormOpen: boolean;
  selectedTask: Task | null;
  page: number;
  limit: number;
  searchQuery: string;
  operationStatus: Record<string, { loading: boolean; error: Error | null }>;
  wsConnected: boolean;
}

/**
 * Tasks page component providing comprehensive task management capabilities
 */
const Tasks: React.FC = () => {
  // State management
  const [state, setState] = useState<TasksPageState>({
    isFormOpen: false,
    selectedTask: null,
    page: INITIAL_PAGE,
    limit: ITEMS_PER_PAGE,
    searchQuery: '',
    operationStatus: {},
    wsConnected: false,
  });

  // Redux hooks
  const dispatch = useDispatch();
  const tasks = useSelector((state: any) => state.tasks.items);
  const isLoading = useSelector((state: any) => state.tasks.loading);
  const error = useSelector((state: any) => state.tasks.error);
  const totalItems = useSelector((state: any) => state.tasks.total);

  // Refs for cleanup and WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  /**
   * WebSocket connection management
   */
  const setupWebSocket = useCallback(() => {
    const ws = new WebSocket(process.env.REACT_APP_WS_URL || '');

    ws.onopen = () => {
      setState(prev => ({ ...prev, wsConnected: true }));
    };

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      handleTaskUpdate(update);
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, wsConnected: false }));
      // Attempt reconnection
      setTimeout(setupWebSocket, WS_RECONNECT_INTERVAL);
    };

    wsRef.current = ws;
  }, []);

  /**
   * Initialize WebSocket connection and cleanup
   */
  useEffect(() => {
    setupWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [setupWebSocket]);

  /**
   * Handle real-time task updates
   */
  const handleTaskUpdate = useCallback((update: any) => {
    dispatch({ type: 'TASK_UPDATED', payload: update });
  }, [dispatch]);

  /**
   * Debounced search handler
   */
  const debouncedSearch = useMemo(
    () =>
      debounce((query: string) => {
        setState(prev => ({ ...prev, searchQuery: query, page: INITIAL_PAGE }));
        fetchTasks();
      }, SEARCH_DEBOUNCE_MS),
    []
  );

  /**
   * Fetch tasks with current filters
   */
  const fetchTasks = useCallback(() => {
    const { page, limit, searchQuery } = state;
    dispatch({
      type: 'FETCH_TASKS',
      payload: {
        page,
        limit,
        search: searchQuery,
      },
    });
  }, [state, dispatch]);

  /**
   * Handle task creation/update
   */
  const handleTaskSubmit = useCallback(async (taskData: Task) => {
    const operationId = taskData.id || 'new';
    setState(prev => ({
      ...prev,
      operationStatus: {
        ...prev.operationStatus,
        [operationId]: { loading: true, error: null },
      },
    }));

    try {
      if (taskData.id) {
        await dispatch({ type: 'UPDATE_TASK', payload: taskData });
      } else {
        await dispatch({ type: 'CREATE_TASK', payload: taskData });
      }

      setState(prev => ({
        ...prev,
        isFormOpen: false,
        selectedTask: null,
        operationStatus: {
          ...prev.operationStatus,
          [operationId]: { loading: false, error: null },
        },
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        operationStatus: {
          ...prev.operationStatus,
          [operationId]: { loading: false, error: error as Error },
        },
      }));
    }
  }, [dispatch]);

  /**
   * Handle task deletion
   */
  const handleTaskDelete = useCallback(async (taskId: string) => {
    setState(prev => ({
      ...prev,
      operationStatus: {
        ...prev.operationStatus,
        [taskId]: { loading: true, error: null },
      },
    }));

    try {
      await dispatch({ type: 'DELETE_TASK', payload: taskId });
      setState(prev => ({
        ...prev,
        operationStatus: {
          ...prev.operationStatus,
          [taskId]: { loading: false, error: null },
        },
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        operationStatus: {
          ...prev.operationStatus,
          [taskId]: { loading: false, error: error as Error },
        },
      }));
    }
  }, [dispatch]);

  /**
   * Handle task status changes
   */
  const handleTaskAction = useCallback(async (taskId: string, action: 'start' | 'stop') => {
    setState(prev => ({
      ...prev,
      operationStatus: {
        ...prev.operationStatus,
        [taskId]: { loading: true, error: null },
      },
    }));

    try {
      await dispatch({
        type: action === 'start' ? 'START_TASK' : 'STOP_TASK',
        payload: taskId,
      });
      setState(prev => ({
        ...prev,
        operationStatus: {
          ...prev.operationStatus,
          [taskId]: { loading: false, error: null },
        },
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        operationStatus: {
          ...prev.operationStatus,
          [taskId]: { loading: false, error: error as Error },
        },
      }));
    }
  }, [dispatch]);

  return (
    <ErrorBoundary>
      <Container maxWidth="xl">
        {/* Task List */}
        <TaskList
          tasks={tasks}
          isLoading={isLoading}
          error={error}
          page={state.page}
          pageSize={state.limit}
          totalItems={totalItems}
          sortColumn="name"
          sortDirection="asc"
          onPageChange={(page) => setState(prev => ({ ...prev, page }))}
          onSort={(column, direction) => {
            // Handle sorting
          }}
          onEdit={(taskId) => {
            const task = tasks.find((t: Task) => t.id === taskId);
            setState(prev => ({
              ...prev,
              isFormOpen: true,
              selectedTask: task,
            }));
          }}
          onDelete={handleTaskDelete}
          onStart={(taskId) => handleTaskAction(taskId, 'start')}
          onStop={(taskId) => handleTaskAction(taskId, 'stop')}
        />

        {/* Task Form Dialog */}
        <Dialog
          open={state.isFormOpen}
          onClose={() => setState(prev => ({ ...prev, isFormOpen: false, selectedTask: null }))}
          maxWidth="md"
          fullWidth
        >
          <TaskForm
            initialTask={state.selectedTask}
            onSubmit={handleTaskSubmit}
            onCancel={() => setState(prev => ({ ...prev, isFormOpen: false, selectedTask: null }))}
            onValidationChange={() => {
              // Handle validation changes
            }}
          />
        </Dialog>

        {/* Operation Status Snackbar */}
        {Object.entries(state.operationStatus).map(([id, status]) => (
          status.error && (
            <Snackbar
              key={id}
              open={!!status.error}
              autoHideDuration={5000}
              onClose={() => {
                setState(prev => ({
                  ...prev,
                  operationStatus: {
                    ...prev.operationStatus,
                    [id]: { ...status, error: null },
                  },
                }));
              }}
            >
              <Alert severity="error" variant="filled">
                {status.error.message}
              </Alert>
            </Snackbar>
          )
        ))}
      </Container>
    </ErrorBoundary>
  );
};

export default Tasks;