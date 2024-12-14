/**
 * @fileoverview React component for testing web scraping extraction rules in real-time
 * with live preview, validation feedback, and enhanced error handling capabilities.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'; // ^18.2.0
import { 
  Box, 
  TextField, 
  Button, 
  CircularProgress, 
  Alert, 
  Paper, 
  Typography,
  Divider,
  Tooltip 
} from '@mui/material'; // ^5.14.0
import { 
  PlayArrow as PlayArrowIcon,
  Error as ErrorIcon 
} from '@mui/icons-material'; // ^5.14.0
import { debounce } from 'lodash'; // ^4.17.21

import { ExtractorRule } from '../../../types/task';
import { validateExtractorRules } from '../../../validation/task';
import { testExtractor } from '../../../api/tasks';
import ErrorBoundary from '../../../components/common/ErrorBoundary';

// Constants for configuration
const TEST_TIMEOUT = 30000; // 30 seconds
const VALIDATION_CACHE_DURATION = 5000; // 5 seconds
const MAX_RETRIES = 3;
const DEBOUNCE_DELAY = 500;

/**
 * Props interface for ExtractorTest component
 */
interface ExtractorTestProps {
  rule: ExtractorRule;
  onTestComplete: (result: any) => void;
  onError: (error: Error) => void;
  onValidationChange: (isValid: boolean) => void;
  disabled?: boolean;
}

/**
 * Interface for test execution results
 */
interface TestResult {
  data: any;
  timestamp: Date;
  executionTime: number;
  status: 'success' | 'error';
}

/**
 * Component for testing and validating extraction rules with real-time feedback
 */
const ExtractorTest: React.FC<ExtractorTestProps> = ({
  rule,
  onTestComplete,
  onError,
  onValidationChange,
  disabled = false
}) => {
  // State management
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const retryCountRef = useRef(0);

  /**
   * Validates and caches extraction rule with debouncing
   */
  const validateAndCacheRule = useCallback(
    debounce(async (rule: ExtractorRule) => {
      try {
        const validationResult = await validateExtractorRules([rule]);
        const isValid = validationResult.isValid;
        
        setValidationError(
          isValid ? null : validationResult.errors[0]?.message || 'Invalid extraction rule'
        );
        onValidationChange(isValid);
        
        return isValid;
      } catch (error) {
        setValidationError('Validation error occurred');
        onValidationChange(false);
        return false;
      }
    }, DEBOUNCE_DELAY),
    [onValidationChange]
  );

  /**
   * Effect to validate rule changes
   */
  useEffect(() => {
    validateAndCacheRule(rule);
    return () => validateAndCacheRule.cancel();
  }, [rule, validateAndCacheRule]);

  /**
   * Handles test execution with enhanced error handling
   */
  const handleTest = useCallback(async (event: React.MouseEvent) => {
    event.preventDefault();
    
    if (disabled || loading) return;

    setLoading(true);
    const startTime = Date.now();

    // Setup timeout handler
    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      setValidationError('Test execution timed out');
      onError(new Error('Test execution timed out'));
    }, TEST_TIMEOUT);

    try {
      // Validate before testing
      const isValid = await validateAndCacheRule(rule);
      if (!isValid) {
        throw new Error('Invalid extraction rule');
      }

      // Execute test
      const result = await testExtractor(rule);
      
      // Clear timeout and prepare result
      clearTimeout(timeoutRef.current);
      const executionTime = Date.now() - startTime;
      
      const testResult: TestResult = {
        data: result.data,
        timestamp: new Date(),
        executionTime,
        status: 'success'
      };

      setTestResult(testResult);
      onTestComplete(result.data);
      retryCountRef.current = 0;

    } catch (error) {
      clearTimeout(timeoutRef.current);
      
      // Handle retries
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        handleTest(event);
        return;
      }

      setTestResult({
        data: null,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
        status: 'error'
      });

      const errorMessage = error instanceof Error ? error.message : 'Test execution failed';
      setValidationError(errorMessage);
      onError(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  }, [rule, disabled, loading, validateAndCacheRule, onTestComplete, onError]);

  /**
   * Renders test result preview with formatting
   */
  const renderTestResult = useCallback((result: TestResult) => {
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" color="textSecondary">
          Test Result
        </Typography>
        <Paper 
          variant="outlined" 
          sx={{ 
            p: 2, 
            mt: 1, 
            maxHeight: 300, 
            overflow: 'auto',
            backgroundColor: (theme) => 
              result.status === 'error' 
                ? theme.palette.error.light 
                : theme.palette.background.paper
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(result.data, null, 2)}
          </pre>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="textSecondary">
            Execution time: {result.executionTime}ms
            {' | '}
            Timestamp: {result.timestamp.toLocaleString()}
          </Typography>
        </Paper>
      </Box>
    );
  }, []);

  return (
    <ErrorBoundary>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TextField
            fullWidth
            label="Selector Preview"
            value={rule.selector}
            disabled
            error={!!validationError}
            helperText={validationError}
            InputProps={{
              endAdornment: validationError && (
                <Tooltip title={validationError}>
                  <ErrorIcon color="error" />
                </Tooltip>
              )
            }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleTest}
            disabled={disabled || loading || !!validationError}
            startIcon={loading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
          >
            Test
          </Button>
        </Box>

        {validationError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {validationError}
          </Alert>
        )}

        {testResult && renderTestResult(testResult)}
      </Box>
    </ErrorBoundary>
  );
};

export default ExtractorTest;