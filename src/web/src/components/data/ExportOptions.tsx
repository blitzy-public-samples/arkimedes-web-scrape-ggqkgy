/**
 * @fileoverview A React component that provides data export configuration options
 * with enhanced accessibility, error handling, and analytics tracking.
 * Implements WCAG 2.1 Level AA accessibility standards.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  Radio,
  RadioGroup,
  Checkbox,
  Typography,
  Button,
  CircularProgress,
  Stack,
  Box
} from '@mui/material'; // v5.14.0
import { useAnalytics } from '@segment/analytics-next'; // v1.51.0
import { ExportFormat, ExportOptions as IExportOptions, DataFilter } from '../../types/data';
import { exportData } from '../../api/data';
import { AlertDialog } from '../common/AlertDialog';
import { useDebounce } from '../../hooks/useDebounce';

// Constants for export configuration
const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string; description: string }> = [
  { value: 'json', label: 'JSON', description: 'JavaScript Object Notation format' },
  { value: 'csv', label: 'CSV', description: 'Comma Separated Values format' },
  { value: 'xml', label: 'XML', description: 'Extensible Markup Language format' }
];

const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

export interface ExportOptionsProps {
  filter: DataFilter;
  onExportStart: () => void;
  onExportComplete: (result: { url: string; format: ExportFormat }) => void;
  onError: (error: Error) => void;
  maxFileSize?: number;
  'aria-label'?: string;
}

/**
 * ExportOptions component providing configurable data export functionality
 * with accessibility support and error handling
 */
export const ExportOptions = React.memo<ExportOptionsProps>(({
  filter,
  onExportStart,
  onExportComplete,
  onError,
  maxFileSize = 104857600, // 100MB default
  'aria-label': ariaLabel = 'Export Options'
}) => {
  // Analytics hook
  const { track } = useAnalytics();

  // Component state
  const [format, setFormat] = useState<ExportFormat>('json');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeOptions, setIncludeOptions] = useState({
    raw: true,
    transformed: true,
    validation: false,
    metadata: false
  });
  const [showAlert, setShowAlert] = useState(false);

  // Debounce export options to prevent excessive state updates
  const debouncedOptions = useDebounce({
    format,
    includeOptions
  }, 300);

  /**
   * Validates export configuration before proceeding
   */
  const validateExportConfig = useCallback(() => {
    if (!Object.values(includeOptions).some(value => value)) {
      throw new Error('At least one data type must be selected for export');
    }
    return true;
  }, [includeOptions]);

  /**
   * Handles format selection change with accessibility support
   */
  const handleFormatChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newFormat = event.target.value as ExportFormat;
    setFormat(newFormat);
    track('Export Format Selected', { format: newFormat });
  }, [track]);

  /**
   * Handles inclusion option changes
   */
  const handleIncludeOptionChange = useCallback((option: keyof typeof includeOptions) => {
    setIncludeOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  }, []);

  /**
   * Handles the export process with error handling and progress tracking
   */
  const handleExport = useCallback(async () => {
    try {
      setLoading(true);
      onExportStart();

      // Validate configuration
      validateExportConfig();

      // Track export attempt
      track('Export Started', {
        format,
        includeOptions,
        filterCriteria: filter
      });

      // Prepare export options
      const exportOptions: IExportOptions = {
        format,
        filter,
        includeRaw: includeOptions.raw,
        includeTransformed: includeOptions.transformed,
        includeValidation: includeOptions.validation,
        includeMetadata: includeOptions.metadata,
        customFields: [], // Could be extended for field selection
        dateFormat: DEFAULT_DATE_FORMAT
      };

      // Execute export
      const result = await exportData(exportOptions);
      
      // Create download URL
      const url = URL.createObjectURL(result);
      
      // Track successful export
      track('Export Completed', {
        format,
        size: result.size
      });

      onExportComplete({ url, format });
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      setShowAlert(true);
      
      // Track export error
      track('Export Error', {
        error: error.message,
        format
      });

      onError(error);
    } finally {
      setLoading(false);
    }
  }, [format, filter, includeOptions, onExportStart, onExportComplete, onError, track, validateExportConfig]);

  // Keyboard navigation setup
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && event.target instanceof HTMLElement) {
        if (event.target.getAttribute('role') === 'radio') {
          event.target.click();
        }
      }
    };

    document.addEventListener('keypress', handleKeyPress);
    return () => document.removeEventListener('keypress', handleKeyPress);
  }, []);

  return (
    <Card aria-label={ariaLabel} role="region">
      <CardContent>
        <Stack spacing={3}>
          {/* Format Selection */}
          <FormControl component="fieldset">
            <Typography variant="subtitle1" component="legend" gutterBottom>
              Export Format
            </Typography>
            <RadioGroup
              aria-label="export format"
              name="export-format"
              value={format}
              onChange={handleFormatChange}
            >
              {EXPORT_FORMATS.map(({ value, label, description }) => (
                <FormControlLabel
                  key={value}
                  value={value}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body1">{label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {description}
                      </Typography>
                    </Box>
                  }
                  aria-describedby={`${value}-description`}
                />
              ))}
            </RadioGroup>
          </FormControl>

          {/* Data Inclusion Options */}
          <FormControl component="fieldset">
            <Typography variant="subtitle1" component="legend" gutterBottom>
              Include Data
            </Typography>
            <FormGroup>
              {Object.entries(includeOptions).map(([key, value]) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      checked={value}
                      onChange={() => handleIncludeOptionChange(key as keyof typeof includeOptions)}
                      name={key}
                      aria-label={`Include ${key} data`}
                    />
                  }
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                />
              ))}
            </FormGroup>
            <FormHelperText>Select at least one data type to include</FormHelperText>
          </FormControl>

          {/* Export Button */}
          <Button
            variant="contained"
            onClick={handleExport}
            disabled={loading || !Object.values(includeOptions).some(v => v)}
            startIcon={loading && <CircularProgress size={20} />}
            aria-busy={loading}
          >
            {loading ? 'Exporting...' : 'Export Data'}
          </Button>
        </Stack>
      </CardContent>

      {/* Error Alert Dialog */}
      <AlertDialog
        open={showAlert}
        title="Export Error"
        message={error || 'An error occurred during export'}
        severity="error"
        onClose={() => setShowAlert(false)}
        onConfirm={() => setShowAlert(false)}
        confirmText="OK"
      />
    </Card>
  );
});

ExportOptions.displayName = 'ExportOptions';

export default ExportOptions;