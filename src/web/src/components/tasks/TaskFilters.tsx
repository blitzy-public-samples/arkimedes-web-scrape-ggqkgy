// External imports with versions for dependency tracking
import React, { useCallback, useEffect, useMemo } from 'react'; // v18.2.0
import { 
  Grid, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  TextField, 
  CircularProgress, 
  Tooltip 
} from '@mui/material'; // v5.14.0
import { DateRangePicker } from '@mui/x-date-pickers-pro'; // v6.0.0
import { useTheme } from '@mui/material/styles'; // v5.14.0

// Internal imports
import SearchBar from '../common/SearchBar';
import { TaskFilter } from '../../types/task';
import useDebounce from '../../hooks/useDebounce';
import { TaskStatus, TaskPriority, DateRange } from '../../types/common';

// Constants for configuration
const SEARCH_DEBOUNCE_MS = 300;
const MIN_DATE_RANGE = 1;
const MAX_DATE_RANGE = 90;

// Props interface with comprehensive type definitions
interface TaskFiltersProps {
  filters: TaskFilter;
  onFilterChange: (filters: TaskFilter) => void;
  isLoading?: boolean;
}

// Styled container using Material-UI's styled API
import { styled } from '@mui/material/styles';

const FilterContainer = styled(Grid)(({ theme }) => ({
  padding: theme.spacing(2),
  gap: theme.spacing(2),
  alignItems: 'center',
  width: '100%',
  marginBottom: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  transition: 'all 0.3s ease',
}));

/**
 * TaskFilters component provides comprehensive filtering controls for task management
 * with accessibility support and Material Design 3.0 compliance.
 *
 * @param {TaskFiltersProps} props - Component props
 * @returns {JSX.Element} Rendered filter controls
 */
const TaskFilters: React.FC<TaskFiltersProps> = ({
  filters,
  onFilterChange,
  isLoading = false,
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = React.useState(filters.search || '');
  const debouncedSearch = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // Handle search query changes with debounce
  useEffect(() => {
    handleFilterChange('search', debouncedSearch);
  }, [debouncedSearch]);

  // Generic filter change handler with type safety
  const handleFilterChange = useCallback(
    (key: keyof TaskFilter, value: any) => {
      onFilterChange({
        ...filters,
        [key]: value,
      });
    },
    [filters, onFilterChange]
  );

  // Memoized status options for better performance
  const statusOptions = useMemo(() => 
    Object.values(TaskStatus).map((status) => ({
      value: status,
      label: status.charAt(0) + status.slice(1).toLowerCase(),
    })),
    []
  );

  // Memoized priority options
  const priorityOptions = useMemo(() => 
    ['low', 'medium', 'high'].map((priority) => ({
      value: priority,
      label: priority.charAt(0).toUpperCase() + priority.slice(1),
    })),
    []
  );

  return (
    <FilterContainer container spacing={2}>
      {/* Status Filter */}
      <Grid item xs={12} sm={6} md={3}>
        <FormControl fullWidth>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            id="status-filter"
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value || null)}
            label="Status"
            disabled={isLoading}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {statusOptions.map(({ value, label }) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      {/* Priority Filter */}
      <Grid item xs={12} sm={6} md={3}>
        <FormControl fullWidth>
          <InputLabel id="priority-filter-label">Priority</InputLabel>
          <Select
            labelId="priority-filter-label"
            id="priority-filter"
            value={filters.priority || ''}
            onChange={(e) => handleFilterChange('priority', e.target.value || null)}
            label="Priority"
            disabled={isLoading}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {priorityOptions.map(({ value, label }) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      {/* Date Range Filter */}
      <Grid item xs={12} sm={6} md={3}>
        <DateRangePicker
          value={filters.dateRange ? [
            new Date(filters.dateRange.startDate),
            new Date(filters.dateRange.endDate)
          ] : null}
          onChange={(range) => {
            if (range && range[0] && range[1]) {
              handleFilterChange('dateRange', {
                startDate: range[0].toISOString(),
                endDate: range[1].toISOString(),
              });
            } else {
              handleFilterChange('dateRange', null);
            }
          }}
          disabled={isLoading}
          slotProps={{
            textField: {
              fullWidth: true,
              label: "Date Range",
            },
          }}
        />
      </Grid>

      {/* Search Filter */}
      <Grid item xs={12} sm={6} md={3}>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search tasks..."
          isLoading={isLoading}
          debounceMs={SEARCH_DEBOUNCE_MS}
          fullWidth
          ariaLabel="Search tasks by name or description"
        />
      </Grid>
    </FilterContainer>
  );
};

export default TaskFilters;