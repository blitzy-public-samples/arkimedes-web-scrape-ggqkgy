/**
 * @fileoverview Enterprise-grade React component for configuring and managing web scraping task schedules.
 * Provides comprehensive scheduling interface with validation, timezone support, and error handling.
 * @version 1.0.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'; // ^18.2.0
import { 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Alert, 
  CircularProgress 
} from '@mui/material'; // ^5.14.0
import { 
  DateTimePicker, 
  LocalizationProvider 
} from '@mui/x-date-pickers'; // ^6.10.0
import { useForm, Controller } from 'react-hook-form'; // ^7.45.0
import { debounce } from 'lodash'; // ^4.17.21
import { TaskSchedule, TaskFrequency } from '../../types/task';
import { useApi } from '../../hooks/useApi';

// Frequency options for task scheduling
const FREQUENCY_OPTIONS = [
  { value: 'once', label: 'Once' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
] as const;

// Default timezone (UTC) for consistency
const DEFAULT_TIMEZONE = 'UTC';

// Validation debounce delay
const VALIDATION_DEBOUNCE_MS = 300;

// Maximum API retry attempts
const API_RETRY_ATTEMPTS = 3;

/**
 * Props interface for TaskScheduler component
 */
interface TaskSchedulerProps {
  taskId: string;
  initialSchedule: TaskSchedule;
  onScheduleUpdate: (schedule: TaskSchedule) => void;
  validationRules?: {
    minStartDate?: Date;
    maxEndDate?: Date;
    allowedFrequencies?: TaskFrequency[];
  };
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Enterprise-grade task scheduler component with comprehensive validation and error handling
 */
export const TaskScheduler: React.FC<TaskSchedulerProps> = ({
  taskId,
  initialSchedule,
  onScheduleUpdate,
  validationRules = {},
  disabled = false,
  loading = false
}) => {
  // Form handling with react-hook-form
  const { control, handleSubmit, watch, formState: { errors }, setValue } = useForm<TaskSchedule>({
    defaultValues: initialSchedule
  });

  // API integration with optimistic updates
  const { updateTask, error: apiError } = useApi();

  // Local state management
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Watch form values for validation
  const frequency = watch('frequency');
  const startDate = watch('startDate');
  const endDate = watch('endDate');

  /**
   * Validates schedule configuration with comprehensive rules
   */
  const validateSchedule = useCallback((data: TaskSchedule): string | null => {
    // Validate frequency
    if (validationRules.allowedFrequencies && 
        !validationRules.allowedFrequencies.includes(data.frequency)) {
      return `Invalid frequency. Allowed values: ${validationRules.allowedFrequencies.join(', ')}`;
    }

    // Validate start date
    const startDateTime = new Date(data.startDate);
    if (validationRules.minStartDate && startDateTime < validationRules.minStartDate) {
      return `Start date must be after ${validationRules.minStartDate.toISOString()}`;
    }

    // Validate end date if present
    if (data.endDate) {
      const endDateTime = new Date(data.endDate);
      if (validationRules.maxEndDate && endDateTime > validationRules.maxEndDate) {
        return `End date must be before ${validationRules.maxEndDate.toISOString()}`;
      }
      if (endDateTime <= startDateTime) {
        return 'End date must be after start date';
      }
    }

    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: data.timeZone });
    } catch (e) {
      return 'Invalid timezone';
    }

    return null;
  }, [validationRules]);

  /**
   * Debounced validation handler
   */
  const debouncedValidate = useMemo(
    () => debounce((data: TaskSchedule) => {
      const error = validateSchedule(data);
      setValidationError(error);
    }, VALIDATION_DEBOUNCE_MS),
    [validateSchedule]
  );

  /**
   * Effect to run validation when relevant fields change
   */
  useEffect(() => {
    const subscription = watch((data) => {
      if (data) {
        debouncedValidate(data as TaskSchedule);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, debouncedValidate]);

  /**
   * Handles schedule submission with optimistic updates and error handling
   */
  const handleScheduleSubmit = async (data: TaskSchedule) => {
    const validationError = validateSchedule(data);
    if (validationError) {
      setValidationError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      // Optimistic update
      onScheduleUpdate(data);

      // API update with retry logic
      let attempts = 0;
      while (attempts < API_RETRY_ATTEMPTS) {
        try {
          await updateTask(taskId, { schedule: data });
          break;
        } catch (error) {
          attempts++;
          if (attempts === API_RETRY_ATTEMPTS) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    } catch (error) {
      // Rollback optimistic update
      onScheduleUpdate(initialSchedule);
      console.error('Failed to update schedule:', error);
      setValidationError('Failed to update schedule. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleScheduleSubmit)}>
      {(validationError || apiError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {validationError || apiError}
        </Alert>
      )}

      <FormControl fullWidth margin="normal" disabled={disabled || isSubmitting}>
        <InputLabel>Frequency</InputLabel>
        <Controller
          name="frequency"
          control={control}
          rules={{ required: 'Frequency is required' }}
          render={({ field }) => (
            <Select {...field} label="Frequency">
              {FREQUENCY_OPTIONS.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          )}
        />
      </FormControl>

      <Controller
        name="startDate"
        control={control}
        rules={{ required: 'Start date is required' }}
        render={({ field }) => (
          <DateTimePicker
            label="Start Date"
            value={field.value}
            onChange={field.onChange}
            disabled={disabled || isSubmitting}
            slotProps={{
              textField: {
                fullWidth: true,
                margin: 'normal',
                error: !!errors.startDate
              }
            }}
          />
        )}
      />

      <Controller
        name="endDate"
        control={control}
        render={({ field }) => (
          <DateTimePicker
            label="End Date (Optional)"
            value={field.value}
            onChange={field.onChange}
            disabled={disabled || isSubmitting || frequency === 'once'}
            slotProps={{
              textField: {
                fullWidth: true,
                margin: 'normal',
                error: !!errors.endDate
              }
            }}
          />
        )}
      />

      <Controller
        name="timeZone"
        control={control}
        defaultValue={DEFAULT_TIMEZONE}
        rules={{ required: 'Timezone is required' }}
        render={({ field }) => (
          <TextField
            {...field}
            label="Timezone"
            fullWidth
            margin="normal"
            error={!!errors.timeZone}
            helperText={errors.timeZone?.message}
            disabled={disabled || isSubmitting}
          />
        )}
      />

      <button
        type="submit"
        disabled={disabled || isSubmitting || !!validationError}
        style={{ marginTop: 16 }}
      >
        {isSubmitting || loading ? (
          <CircularProgress size={24} />
        ) : (
          'Update Schedule'
        )}
      </button>
    </form>
  );
};

export type { TaskSchedulerProps };