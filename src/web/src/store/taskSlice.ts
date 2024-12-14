/**
 * @fileoverview Redux Toolkit slice for managing enterprise-grade web scraping task state.
 * Implements comprehensive task management, real-time monitoring, and performance tracking.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit'; // ^1.9.0
import { produce } from 'immer'; // ^9.0.0

import { 
  Task, 
  TaskConfiguration, 
  TaskFilter, 
  TaskMetrics, 
  TaskValidationError 
} from '../types/task';
import { 
  getTasks, 
  createTask, 
  updateTask, 
  deleteTask, 
  startTask, 
  stopTask 
} from '../api/tasks';

/**
 * Interface for task execution statistics
 */
interface TaskExecutionStats {
  totalExecuted: number;
  successRate: number;
  averageExecutionTime: number;
  lastUpdateTimestamp: string;
}

/**
 * Interface for task slice state
 */
interface TaskState {
  tasks: Task[];
  activeTasks: Task[];
  selectedTask: Task | null;
  filter: TaskFilter;
  loading: boolean;
  error: string | null;
  metrics: Record<string, TaskMetrics>;
  validationErrors: TaskValidationError[];
  lastUpdated: string;
  executionStats: TaskExecutionStats;
  offline: boolean;
  stateVersion: number;
}

/**
 * Initial state for task slice
 */
const initialState: TaskState = {
  tasks: [],
  activeTasks: [],
  selectedTask: null,
  filter: {
    status: null,
    priority: null,
    dateRange: null,
    search: null,
    sortBy: 'createdAt',
    sortDirection: 'desc',
    tags: [],
    createdBy: null,
    lastRunStatus: null
  },
  loading: false,
  error: null,
  metrics: {},
  validationErrors: [],
  lastUpdated: '',
  executionStats: {
    totalExecuted: 0,
    successRate: 0,
    averageExecutionTime: 0,
    lastUpdateTimestamp: new Date().toISOString()
  },
  offline: false,
  stateVersion: 1
};

/**
 * Async thunk for fetching tasks with metrics
 */
export const fetchTasksWithMetrics = createAsyncThunk(
  'tasks/fetchWithMetrics',
  async ({ 
    filter, 
    page, 
    limit, 
    includeMetrics = true 
  }: { 
    filter: TaskFilter; 
    page: number; 
    limit: number; 
    includeMetrics?: boolean;
  }) => {
    const response = await getTasks(filter, page, limit);
    return {
      tasks: response.data.items,
      pagination: response.data.pagination,
      timestamp: new Date().toISOString()
    };
  }
);

/**
 * Async thunk for task operations with optimistic updates
 */
export const performTaskOperation = createAsyncThunk(
  'tasks/performOperation',
  async ({ 
    taskId, 
    operation, 
    config 
  }: { 
    taskId: string; 
    operation: 'start' | 'stop' | 'delete'; 
    config?: Partial<TaskConfiguration>;
  }, 
  { rejectWithValue }
  ) => {
    try {
      switch (operation) {
        case 'start':
          return await startTask(taskId);
        case 'stop':
          return await stopTask(taskId);
        case 'delete':
          return await deleteTask(taskId);
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

/**
 * Task management slice
 */
const taskSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    setSelectedTask: (state, action: PayloadAction<Task | null>) => {
      state.selectedTask = action.payload;
    },
    updateFilter: (state, action: PayloadAction<Partial<TaskFilter>>) => {
      state.filter = { ...state.filter, ...action.payload };
    },
    updateTaskMetrics: (state, action: PayloadAction<{ taskId: string; metrics: TaskMetrics }>) => {
      const { taskId, metrics } = action.payload;
      state.metrics[taskId] = metrics;
    },
    clearValidationErrors: (state) => {
      state.validationErrors = [];
    },
    setOfflineMode: (state, action: PayloadAction<boolean>) => {
      state.offline = action.payload;
    },
    updateExecutionStats: (state, action: PayloadAction<Partial<TaskExecutionStats>>) => {
      state.executionStats = { ...state.executionStats, ...action.payload };
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch tasks with metrics
      .addCase(fetchTasksWithMetrics.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTasksWithMetrics.fulfilled, (state, action) => {
        state.loading = false;
        state.tasks = action.payload.tasks;
        state.lastUpdated = action.payload.timestamp;
        state.activeTasks = action.payload.tasks.filter(task => task.status === 'RUNNING');
      })
      .addCase(fetchTasksWithMetrics.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch tasks';
      })
      // Task operations
      .addCase(performTaskOperation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(performTaskOperation.fulfilled, (state, action) => {
        state.loading = false;
        // Update task status in state based on operation result
        const updatedTask = action.payload.data;
        const taskIndex = state.tasks.findIndex(task => task.id === updatedTask.id);
        if (taskIndex !== -1) {
          state.tasks[taskIndex] = updatedTask;
        }
        // Update active tasks list
        state.activeTasks = state.tasks.filter(task => task.status === 'RUNNING');
      })
      .addCase(performTaskOperation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Operation failed';
      });
  }
});

// Export actions
export const {
  setSelectedTask,
  updateFilter,
  updateTaskMetrics,
  clearValidationErrors,
  setOfflineMode,
  updateExecutionStats
} = taskSlice.actions;

// Memoized selectors
export const selectAllTasks = (state: { tasks: TaskState }) => state.tasks.tasks;
export const selectActiveTasks = (state: { tasks: TaskState }) => state.tasks.activeTasks;
export const selectTaskById = createSelector(
  [selectAllTasks, (_, taskId: string) => taskId],
  (tasks, taskId) => tasks.find(task => task.id === taskId)
);
export const selectTaskMetrics = (state: { tasks: TaskState }) => state.tasks.metrics;
export const selectTaskFilter = (state: { tasks: TaskState }) => state.tasks.filter;
export const selectTasksLoading = (state: { tasks: TaskState }) => state.tasks.loading;
export const selectTaskError = (state: { tasks: TaskState }) => state.tasks.error;
export const selectExecutionStats = (state: { tasks: TaskState }) => state.tasks.executionStats;

// Export reducer
export default taskSlice.reducer;