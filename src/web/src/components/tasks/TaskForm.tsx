/**
 * @fileoverview React component for creating and editing web scraping tasks with 
 * comprehensive form validation, real-time feedback, and accessibility support.
 * @version 1.0.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'; // ^18.2.0
import { useForm, Controller, FormProvider } from 'react-hook-form'; // ^7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.3.0
import { useDebounce } from 'use-debounce'; // ^9.0.0
import {
  Box,
  Grid,
  TextField,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Switch,
  Button,
  Typography,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material'; // ^5.14.0
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import { Task, ValidationResult } from '../../types/task';
import { taskSchema, createTaskValidator } from '../../validation/task';
import ErrorBoundary from '../common/ErrorBoundary';

/**
 * Props interface for TaskForm component
 */
interface TaskFormProps {
  initialTask?: Task;
  onSubmit: (task: Task) => Promise<void>;
  onCancel: () => void;
  onValidationChange: (isValid: boolean) => void;
}

/**
 * Interface for form field values
 */
interface TaskFormValues {
  name: string;
  description?: string;
  configuration: {
    url: string;
    schedule: {
      frequency: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';
      startDate: string;
      endDate: string | null;
      timeZone: string;
    };
    extractors: Array<{
      fieldName: string;
      selector: string;
      type: 'text' | 'number' | 'date' | 'url';
      required: boolean;
    }>;
    priority: 'low' | 'medium' | 'high';
    useProxy: boolean;
    followPagination: boolean;
    maxPages: number;
    javascript: boolean;
  };
  tags: string[];
}

/**
 * TaskForm component for creating and editing web scraping tasks
 */
export const TaskForm: React.FC<TaskFormProps> = ({
  initialTask,
  onSubmit,
  onCancel,
  onValidationChange,
}) => {
  // Initialize form with react-hook-form and zod validation
  const methods = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: initialTask || {
      name: '',
      description: '',
      configuration: {
        url: '',
        schedule: {
          frequency: 'daily',
          startDate: new Date().toISOString().split('T')[0],
          endDate: null,
          timeZone: 'UTC',
        },
        extractors: [{
          fieldName: '',
          selector: '',
          type: 'text',
          required: true,
        }],
        priority: 'medium',
        useProxy: false,
        followPagination: false,
        maxPages: 10,
        javascript: false,
      },
      tags: [],
    },
    mode: 'onChange',
  });

  const { 
    control, 
    handleSubmit, 
    watch, 
    formState: { errors, isValid, isDirty },
    trigger,
  } = methods;

  // Watch form values for validation
  const formValues = watch();
  const [debouncedValues] = useDebounce(formValues, 500);

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: false,
    errors: [],
    metadata: { timestamp: '', validatedFields: [], performance: { duration: 0, complexityScore: 0 } },
  });

  // Memoized validator instance
  const validator = useMemo(() => createTaskValidator(), []);

  // Handle real-time validation
  useEffect(() => {
    const validateForm = async () => {
      const result = await validator.validate(debouncedValues);
      setValidationResult(result);
      onValidationChange(result.isValid);
    };

    validateForm();
  }, [debouncedValues, validator, onValidationChange]);

  // Handle form submission
  const onFormSubmit = useCallback(async (data: TaskFormValues) => {
    try {
      const validationResult = await validator.validate(data);
      if (!validationResult.isValid) {
        return;
      }

      await onSubmit(data as Task);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  }, [validator, onSubmit]);

  // Handle extractor field addition
  const addExtractor = useCallback(() => {
    const currentExtractors = methods.getValues('configuration.extractors');
    methods.setValue('configuration.extractors', [
      ...currentExtractors,
      {
        fieldName: '',
        selector: '',
        type: 'text',
        required: true,
      },
    ]);
  }, [methods]);

  // Handle extractor field removal
  const removeExtractor = useCallback((index: number) => {
    const currentExtractors = methods.getValues('configuration.extractors');
    methods.setValue(
      'configuration.extractors',
      currentExtractors.filter((_, i) => i !== index)
    );
  }, [methods]);

  return (
    <ErrorBoundary>
      <FormProvider {...methods}>
        <Paper elevation={2} sx={{ p: 3 }}>
          <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
            <Grid container spacing={3}>
              {/* Basic Information Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Task Name"
                          fullWidth
                          required
                          error={!!errors.name}
                          helperText={errors.name?.message}
                          inputProps={{
                            'aria-label': 'Task Name',
                            'aria-required': 'true',
                          }}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Controller
                      name="configuration.url"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Target URL"
                          fullWidth
                          required
                          error={!!errors.configuration?.url}
                          helperText={errors.configuration?.url?.message}
                          inputProps={{
                            'aria-label': 'Target URL',
                            'aria-required': 'true',
                          }}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </Grid>

              {/* Extraction Rules Section */}
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Extraction Rules
                  </Typography>
                  <Tooltip title="Add Extraction Rule">
                    <IconButton onClick={addExtractor} color="primary" aria-label="Add extraction rule">
                      <AddIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                
                {methods.watch('configuration.extractors').map((_, index) => (
                  <Box key={index} sx={{ mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={4}>
                        <Controller
                          name={`configuration.extractors.${index}.fieldName`}
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              label="Field Name"
                              fullWidth
                              required
                              error={!!errors.configuration?.extractors?.[index]?.fieldName}
                              helperText={errors.configuration?.extractors?.[index]?.fieldName?.message}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Controller
                          name={`configuration.extractors.${index}.selector`}
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              label="CSS Selector"
                              fullWidth
                              required
                              error={!!errors.configuration?.extractors?.[index]?.selector}
                              helperText={errors.configuration?.extractors?.[index]?.selector?.message}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <Controller
                          name={`configuration.extractors.${index}.type`}
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              select
                              label="Data Type"
                              fullWidth
                              required
                              SelectProps={{
                                native: true,
                              }}
                            >
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="date">Date</option>
                              <option value="url">URL</option>
                            </TextField>
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} md={1}>
                        <IconButton
                          onClick={() => removeExtractor(index)}
                          color="error"
                          aria-label={`Remove extraction rule ${index + 1}`}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Grid>

              {/* Advanced Options Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Advanced Options
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Controller
                      name="configuration.useProxy"
                      control={control}
                      render={({ field }) => (
                        <FormControlLabel
                          control={
                            <Switch
                              {...field}
                              checked={field.value}
                            />
                          }
                          label="Use Proxy"
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Controller
                      name="configuration.followPagination"
                      control={control}
                      render={({ field }) => (
                        <FormControlLabel
                          control={
                            <Switch
                              {...field}
                              checked={field.value}
                            />
                          }
                          label="Follow Pagination"
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Controller
                      name="configuration.javascript"
                      control={control}
                      render={({ field }) => (
                        <FormControlLabel
                          control={
                            <Switch
                              {...field}
                              checked={field.value}
                            />
                          }
                          label="Enable JavaScript"
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </Grid>

              {/* Validation Feedback */}
              {!validationResult.isValid && validationResult.errors.length > 0 && (
                <Grid item xs={12}>
                  <Alert severity="error">
                    <Typography variant="subtitle2">
                      Please correct the following errors:
                    </Typography>
                    <ul>
                      {validationResult.errors.map((error, index) => (
                        <li key={index}>{error.message}</li>
                      ))}
                    </ul>
                  </Alert>
                </Grid>
              )}

              {/* Form Actions */}
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                  <Button
                    onClick={onCancel}
                    variant="outlined"
                    color="inherit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={!isValid || !isDirty}
                  >
                    Save Task
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </form>
        </Paper>
      </FormProvider>
    </ErrorBoundary>
  );
};

export default TaskForm;