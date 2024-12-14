/**
 * @fileoverview React component for configuring web scraping extraction rules
 * Implements comprehensive validation, real-time feedback, and intelligent configuration
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  TextField,
  FormControl,
  FormControlLabel,
  Switch,
  MenuItem,
  Grid,
  Button,
  IconButton,
  Typography,
  Alert,
  Tooltip,
  CircularProgress
} from '@mui/material';
import { useForm, Controller, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExtractorRule } from '../../../types/task';
import { extractorRuleSchema } from '../../../validation/task';
import { useDebounce } from '../../../hooks/useDebounce';
import { validateSelector } from '../../../utils/validation';

// Field type options with validation rules
const FIELD_TYPES = [
  { value: 'text', label: 'Text', validation: '^.+$' },
  { value: 'number', label: 'Number', validation: '^\\d+(\\.\\d+)?$' },
  { value: 'date', label: 'Date', validation: '^\\d{4}-\\d{2}-\\d{2}$' },
  { value: 'url', label: 'URL', validation: '^https?://.+' }
];

// Selector patterns for validation and suggestions
const SELECTOR_PATTERNS = {
  RECOMMENDED: '^[.#][a-zA-Z][a-zA-Z0-9_-]*$',
  VALID: '^[a-zA-Z0-9_\\s\\[\\]\\(\\)\\.,#:>+~-]*$'
};

interface ExtractorFormProps {
  initialRule?: ExtractorRule;
  onSubmit: (rule: ExtractorRule) => Promise<void>;
  onCancel: () => void;
  onValidationError: (errors: string[]) => void;
  onPreview?: (data: { selector: string; type: string }) => void;
  disabled?: boolean;
  showAdvancedOptions?: boolean;
}

/**
 * Form component for configuring data extraction rules with real-time validation
 */
export const ExtractorForm: React.FC<ExtractorFormProps> = ({
  initialRule,
  onSubmit,
  onCancel,
  onValidationError,
  onPreview,
  disabled = false,
  showAdvancedOptions = false
}) => {
  // Form state management with validation
  const methods = useForm<ExtractorRule>({
    resolver: zodResolver(extractorRuleSchema),
    defaultValues: initialRule || {
      fieldName: '',
      selector: '',
      type: 'text',
      required: true,
      validation: null,
      transform: null
    }
  });

  const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = methods;

  // Watch selector for real-time validation
  const selector = watch('selector');
  const debouncedSelector = useDebounce(selector, 300);

  // Validation state
  const [selectorValidation, setSelectorValidation] = useState<{
    isValid: boolean;
    message?: string;
    suggestion?: string;
  }>({ isValid: true });

  // Validate selector with debounce
  useEffect(() => {
    const validateSelectorInput = async () => {
      if (!debouncedSelector) return;

      const result = await validateSelector(debouncedSelector);
      setSelectorValidation({
        isValid: result.isValid,
        message: result.errors[0],
        suggestion: !result.isValid ? 'Try using a more specific selector' : undefined
      });
    };

    validateSelectorInput();
  }, [debouncedSelector]);

  // Handle form submission with validation
  const onSubmitForm = useCallback(async (data: ExtractorRule) => {
    try {
      if (!selectorValidation.isValid) {
        onValidationError([selectorValidation.message || 'Invalid selector']);
        return;
      }

      await onSubmit(data);
    } catch (error) {
      onValidationError([error instanceof Error ? error.message : 'Submission failed']);
    }
  }, [onSubmit, onValidationError, selectorValidation]);

  // Preview handler with debounce
  const handlePreview = useCallback(() => {
    if (onPreview && selector) {
      onPreview({
        selector,
        type: watch('type')
      });
    }
  }, [onPreview, selector, watch]);

  // Computed validation state
  const showSelectorError = useMemo(() => {
    return !selectorValidation.isValid || !!errors.selector;
  }, [selectorValidation.isValid, errors.selector]);

  return (
    <FormProvider {...methods}>
      <Box component="form" onSubmit={handleSubmit(onSubmitForm)} sx={{ width: '100%' }}>
        <Grid container spacing={3}>
          {/* Field Name */}
          <Grid item xs={12} md={6}>
            <Controller
              name="fieldName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Field Name"
                  fullWidth
                  required
                  error={!!errors.fieldName}
                  helperText={errors.fieldName?.message}
                  disabled={disabled}
                  InputProps={{
                    startAdornment: (
                      <Tooltip title="Use camelCase naming convention">
                        <span>ℹ️</span>
                      </Tooltip>
                    )
                  }}
                />
              )}
            />
          </Grid>

          {/* Field Type */}
          <Grid item xs={12} md={6}>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Field Type"
                  fullWidth
                  required
                  error={!!errors.type}
                  helperText={errors.type?.message}
                  disabled={disabled}
                >
                  {FIELD_TYPES.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>

          {/* CSS Selector */}
          <Grid item xs={12}>
            <Controller
              name="selector"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="CSS Selector"
                  fullWidth
                  required
                  multiline
                  rows={2}
                  error={showSelectorError}
                  helperText={
                    showSelectorError
                      ? selectorValidation.message || errors.selector?.message
                      : 'Enter a CSS selector to extract data'
                  }
                  disabled={disabled}
                  InputProps={{
                    endAdornment: onPreview && (
                      <Button
                        onClick={handlePreview}
                        disabled={!selector || showSelectorError}
                        sx={{ ml: 1 }}
                      >
                        Preview
                      </Button>
                    )
                  }}
                />
              )}
            />
          </Grid>

          {/* Required Field Switch */}
          <Grid item xs={12}>
            <Controller
              name="required"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Switch
                      {...field}
                      checked={field.value}
                      disabled={disabled}
                    />
                  }
                  label="Required Field"
                />
              )}
            />
          </Grid>

          {/* Advanced Options */}
          {showAdvancedOptions && (
            <Grid item xs={12}>
              <Controller
                name="validation"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Custom Validation Pattern"
                    fullWidth
                    placeholder="Regular expression pattern"
                    error={!!errors.validation}
                    helperText={errors.validation?.message}
                    disabled={disabled}
                  />
                )}
              />
            </Grid>
          )}

          {/* Validation Feedback */}
          {!selectorValidation.isValid && selectorValidation.suggestion && (
            <Grid item xs={12}>
              <Alert severity="info">
                {selectorValidation.suggestion}
              </Alert>
            </Grid>
          )}

          {/* Form Actions */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                onClick={onCancel}
                disabled={disabled || isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={disabled || isSubmitting || showSelectorError}
                startIcon={isSubmitting && <CircularProgress size={20} />}
              >
                {isSubmitting ? 'Saving...' : 'Save Rule'}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </FormProvider>
  );
};

export default ExtractorForm;