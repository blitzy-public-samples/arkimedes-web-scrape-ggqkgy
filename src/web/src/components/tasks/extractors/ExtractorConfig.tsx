/**
 * @fileoverview Advanced React component for configuring web scraping extraction rules
 * Implements comprehensive validation, performance optimization, and accessibility
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress
} from '@mui/material';
import { useForm, useFieldArray } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';

import ExtractorForm from './ExtractorForm';
import ExtractorRules from './ExtractorRules';
import { ExtractorRule } from '../../../types/task';
import useDebounce from '../../../hooks/useDebounce';

// Constants for performance optimization
const VALIDATION_DEBOUNCE_MS = 200;
const PERFORMANCE_THRESHOLD_MS = 100;

/**
 * Interface for ExtractorConfig component props
 */
interface ExtractorConfigProps {
  initialConfig?: Record<string, ExtractorRule>;
  onChange: (config: Record<string, ExtractorRule>) => void;
  onValidationError: (errors: ValidationError[]) => void;
  onTest?: (config: Record<string, ExtractorRule>) => Promise<TestResult>;
  disabled?: boolean;
  mode?: 'basic' | 'advanced';
  performance?: PerformanceConfig;
}

/**
 * Interface for performance configuration
 */
interface PerformanceConfig {
  enableVirtualization?: boolean;
  validationDebounce?: number;
  maxRules?: number;
}

/**
 * Interface for test results
 */
interface TestResult {
  success: boolean;
  data?: any;
  errors?: string[];
}

/**
 * Interface for validation errors
 */
interface ValidationError {
  field: string;
  code: string;
  context: Record<string, any>;
}

/**
 * ExtractorConfig component for managing web scraping extraction rules
 */
const ExtractorConfig: React.FC<ExtractorConfigProps> = ({
  initialConfig = {},
  onChange,
  onValidationError,
  onTest,
  disabled = false,
  mode = 'basic',
  performance = {}
}) => {
  // State management
  const [selectedTab, setSelectedTab] = useState(0);
  const [rules, setRules] = useState<ExtractorRule[]>(Object.values(initialConfig));
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isTestingRule, setIsTestingRule] = useState(false);

  // Performance optimization refs
  const lastUpdateTime = useRef<number>(Date.now());
  const updateCount = useRef<number>(0);

  // Debounced rules for performance optimization
  const debouncedRules = useDebounce(rules, performance.validationDebounce || VALIDATION_DEBOUNCE_MS);

  // Form management with react-hook-form
  const { control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      rules: Object.values(initialConfig)
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'rules'
  });

  /**
   * Handles tab change with validation
   */
  const handleTabChange = useCallback((event: React.SyntheticEvent, newValue: number) => {
    // Validate current configuration before tab switch
    if (validationErrors.length === 0) {
      setSelectedTab(newValue);
    } else {
      onValidationError(validationErrors);
    }
  }, [validationErrors, onValidationError]);

  /**
   * Handles configuration changes with performance optimization
   */
  const handleConfigChange = useCallback((newRules: ExtractorRule[]) => {
    const currentTime = Date.now();
    updateCount.current += 1;

    // Performance monitoring
    if (currentTime - lastUpdateTime.current < PERFORMANCE_THRESHOLD_MS) {
      console.warn('High frequency updates detected in ExtractorConfig');
    }

    lastUpdateTime.current = currentTime;

    // Update rules state
    setRules(newRules);

    // Convert rules array to record
    const configRecord = newRules.reduce((acc, rule) => ({
      ...acc,
      [rule.fieldName]: rule
    }), {});

    onChange(configRecord);
  }, [onChange]);

  /**
   * Handles rule testing with error boundary
   */
  const handleTestRule = useCallback(async (rule: ExtractorRule) => {
    if (!onTest) return;

    setIsTestingRule(true);
    try {
      const result = await onTest({ [rule.fieldName]: rule });
      if (!result.success) {
        onValidationError([{
          field: rule.fieldName,
          code: 'TEST_FAILED',
          context: { errors: result.errors }
        }]);
      }
    } catch (error) {
      onValidationError([{
        field: rule.fieldName,
        code: 'TEST_ERROR',
        context: { error: String(error) }
      }]);
    } finally {
      setIsTestingRule(false);
    }
  }, [onTest, onValidationError]);

  /**
   * Effect for validation on rules change
   */
  useEffect(() => {
    const validateRules = async () => {
      try {
        // Validate rules structure and constraints
        const errors = debouncedRules.reduce<ValidationError[]>((acc, rule, index) => {
          if (!rule.fieldName || !rule.selector) {
            acc.push({
              field: `rules[${index}]`,
              code: 'REQUIRED_FIELDS_MISSING',
              context: { rule }
            });
          }
          return acc;
        }, []);

        setValidationErrors(errors);
        if (errors.length > 0) {
          onValidationError(errors);
        }
      } catch (error) {
        console.error('Validation error:', error);
      }
    };

    validateRules();
  }, [debouncedRules, onValidationError]);

  // Memoized performance configuration
  const performanceConfig = useMemo(() => ({
    enableVirtualization: performance.enableVirtualization || rules.length > 50,
    validationDebounce: performance.validationDebounce || VALIDATION_DEBOUNCE_MS,
    maxRules: performance.maxRules || 100
  }), [performance, rules.length]);

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          aria-label="Extractor configuration tabs"
        >
          <Tab label="Rules List" id="tab-rules" aria-controls="tabpanel-rules" />
          <Tab label="Rule Editor" id="tab-editor" aria-controls="tabpanel-editor" />
        </Tabs>
      </Box>

      {validationErrors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {validationErrors.length} validation error(s) found. Please review your configuration.
        </Alert>
      )}

      <Box role="tabpanel" hidden={selectedTab !== 0}>
        {selectedTab === 0 && (
          <ExtractorRules
            rules={rules}
            onChange={handleConfigChange}
            onValidationError={onValidationError}
            maxRules={performanceConfig.maxRules}
            validationDebounce={performanceConfig.validationDebounce}
            enableVirtualization={performanceConfig.enableVirtualization}
            disabled={disabled}
          />
        )}
      </Box>

      <Box role="tabpanel" hidden={selectedTab !== 1}>
        {selectedTab === 1 && (
          <ExtractorForm
            initialRule={rules[rules.length - 1]}
            onSubmit={async (rule) => {
              handleConfigChange([...rules, rule]);
              setSelectedTab(0);
            }}
            onCancel={() => setSelectedTab(0)}
            onValidationError={onValidationError}
            onPreview={onTest ? (rule) => handleTestRule(rule as ExtractorRule) : undefined}
            disabled={disabled || isTestingRule}
            showAdvancedOptions={mode === 'advanced'}
          />
        )}
      </Box>
    </Paper>
  );
};

export default React.memo(ExtractorConfig);