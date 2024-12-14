/**
 * @fileoverview ExtractorRules component for managing web scraping extraction rules
 * Implements comprehensive validation, accessibility, and performance optimization
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo, memo } from 'react';
import {
  Box,
  List,
  ListItem,
  IconButton,
  Typography,
  Alert,
  Button,
  Divider,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { FixedSizeList as VirtualList } from 'react-window';
import debounce from 'lodash/debounce'; // v4.17.21

import { ExtractorRule, ValidationError } from '../../../types/task';
import { extractorRuleSchema, validateExtractorRules } from '../../../validation/task';

// Constants for component configuration
const MAX_RULES_DEFAULT = 50;
const VALIDATION_DEBOUNCE_MS = 300;
const VIRTUAL_LIST_ROW_HEIGHT = 72;
const VALIDATION_CACHE_TTL = 5000;

/**
 * Props interface for ExtractorRules component
 */
interface ExtractorRulesProps {
  rules: ExtractorRule[];
  onChange: (rules: ExtractorRule[]) => void;
  onValidationError: (errors: ValidationError[]) => void;
  maxRules?: number;
  validationDebounce?: number;
  enableVirtualization?: boolean;
  virtualListHeight?: number;
  ariaLabels?: Record<string, string>;
}

/**
 * Cache interface for validation results
 */
interface ValidationCache {
  result: ValidationError[];
  timestamp: number;
}

/**
 * Memoized ExtractorRule component for individual rule display
 */
const ExtractorRuleItem = memo(({ 
  rule, 
  onDelete, 
  index,
  ariaLabels 
}: { 
  rule: ExtractorRule; 
  onDelete: () => void; 
  index: number;
  ariaLabels?: Record<string, string>;
}) => (
  <ListItem
    divider
    sx={{ py: 1 }}
    aria-label={ariaLabels?.ruleItem || `Extraction rule ${index + 1}`}
  >
    <Box sx={{ flexGrow: 1, mr: 2 }}>
      <Typography variant="subtitle2" component="div">
        {rule.fieldName}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {rule.selector} ({rule.type})
        {rule.required && ' • Required'}
      </Typography>
    </Box>
    <Tooltip title={ariaLabels?.deleteRule || "Delete rule"}>
      <IconButton
        onClick={onDelete}
        size="small"
        aria-label={ariaLabels?.deleteRule || `Delete rule ${rule.fieldName}`}
      >
        <DeleteIcon />
      </IconButton>
    </Tooltip>
  </ListItem>
));

/**
 * ExtractorRules component for managing data extraction rules
 */
const ExtractorRules: React.FC<ExtractorRulesProps> = ({
  rules,
  onChange,
  onValidationError,
  maxRules = MAX_RULES_DEFAULT,
  validationDebounce = VALIDATION_DEBOUNCE_MS,
  enableVirtualization = false,
  virtualListHeight = 400,
  ariaLabels = {},
}) => {
  // State for validation and loading
  const [validationCache, setValidationCache] = useState<ValidationCache | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Memoized validation function with debouncing
  const debouncedValidate = useMemo(
    () => debounce(async (rulesToValidate: ExtractorRule[]) => {
      setIsValidating(true);
      try {
        const validationResult = await validateExtractorRules(rulesToValidate);
        setValidationCache({
          result: validationResult.errors,
          timestamp: Date.now(),
        });
        onValidationError(validationResult.errors);
      } catch (error) {
        console.error('Validation error:', error);
        onValidationError([{
          field: 'rules',
          code: 'VALIDATION_ERROR',
          context: { error: String(error) }
        }]);
      } finally {
        setIsValidating(false);
      }
    }, validationDebounce),
    [onValidationError, validationDebounce]
  );

  // Effect for validation on rules change
  useEffect(() => {
    const shouldValidate = !validationCache || 
      Date.now() - validationCache.timestamp > VALIDATION_CACHE_TTL;

    if (shouldValidate) {
      debouncedValidate(rules);
    }

    return () => {
      debouncedValidate.cancel();
    };
  }, [rules, debouncedValidate, validationCache]);

  // Handler for adding new rule
  const handleAddRule = useCallback(async () => {
    if (rules.length >= maxRules) {
      onValidationError([{
        field: 'rules',
        code: 'MAX_RULES_EXCEEDED',
        context: { max: maxRules }
      }]);
      return;
    }

    const newRule: ExtractorRule = {
      fieldName: `field_${rules.length + 1}`,
      selector: '',
      type: 'text',
      required: false,
      validation: null,
      transform: null
    };

    try {
      await extractorRuleSchema.parseAsync(newRule);
      onChange([...rules, newRule]);
    } catch (error) {
      console.error('New rule validation error:', error);
      onValidationError([{
        field: 'newRule',
        code: 'INVALID_RULE',
        context: { error: String(error) }
      }]);
    }
  }, [rules, maxRules, onChange, onValidationError]);

  // Handler for deleting rule
  const handleDeleteRule = useCallback((index: number) => {
    const updatedRules = rules.filter((_, i) => i !== index);
    onChange(updatedRules);
  }, [rules, onChange]);

  // Render function for virtualized list item
  const renderVirtualRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <ExtractorRuleItem
        rule={rules[index]}
        onDelete={() => handleDeleteRule(index)}
        index={index}
        ariaLabels={ariaLabels}
      />
    </div>
  ), [rules, handleDeleteRule, ariaLabels]);

  return (
    <Box
      role="region"
      aria-label={ariaLabels?.container || "Extraction rules configuration"}
    >
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="h2">
          Extraction Rules
          {isValidating && (
            <CircularProgress
              size={16}
              sx={{ ml: 1 }}
              aria-label="Validating rules"
            />
          )}
        </Typography>
        <Tooltip title={rules.length >= maxRules ? "Maximum rules limit reached" : "Add new rule"}>
          <span>
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddRule}
              disabled={rules.length >= maxRules}
              aria-label={ariaLabels?.addRule || "Add new extraction rule"}
            >
              Add Rule
            </Button>
          </span>
        </Tooltip>
      </Box>

      {validationCache?.result.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {validationCache.result.length} validation error(s) found
        </Alert>
      )}

      {enableVirtualization ? (
        <VirtualList
          height={virtualListHeight}
          width="100%"
          itemCount={rules.length}
          itemSize={VIRTUAL_LIST_ROW_HEIGHT}
        >
          {renderVirtualRow}
        </VirtualList>
      ) : (
        <List disablePadding>
          {rules.map((rule, index) => (
            <ExtractorRuleItem
              key={`${rule.fieldName}-${index}`}
              rule={rule}
              onDelete={() => handleDeleteRule(index)}
              index={index}
              ariaLabels={ariaLabels}
            />
          ))}
        </List>
      )}

      {rules.length === 0 && (
        <Typography
          color="text.secondary"
          align="center"
          sx={{ py: 4 }}
          aria-label={ariaLabels?.emptyState || "No extraction rules defined"}
        >
          No extraction rules defined. Click "Add Rule" to get started.
        </Typography>
      )}
    </Box>
  );
};

export default memo(ExtractorRules);