// External imports - versions specified for dependency tracking
import React, { useState, useCallback, useRef } from 'react'; // v18.2.0
import { TextField, InputAdornment, IconButton } from '@mui/material'; // v5.14.0
import { Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material'; // v5.14.0
import { styled, useTheme } from '@mui/material/styles'; // v5.14.0

// Internal imports
import useDebounce from '../../hooks/useDebounce';
import LoadingSpinner from './LoadingSpinner';

// Default debounce delay in milliseconds
const DEFAULT_DEBOUNCE_MS = 300;

// Props interface with comprehensive type definitions
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  debounceMs?: number;
  fullWidth?: boolean;
  disabled?: boolean;
  error?: boolean;
  errorText?: string;
  ariaLabel?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  customStyles?: React.CSSProperties;
}

// Styled container component with theme-aware styling
const SearchContainer = styled('div')<{ fullWidth?: boolean }>(({ theme, fullWidth }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  width: fullWidth ? '100%' : 'auto',
  transition: theme.transitions.create(['background-color', 'box-shadow']),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '&:focus-within': {
    boxShadow: theme.shadows[2],
  },
}));

/**
 * A reusable search bar component that provides real-time search functionality
 * with debounced input handling, following Material Design guidelines and
 * supporting both light and dark themes with comprehensive accessibility features.
 *
 * @param {SearchBarProps} props - Component props
 * @returns {JSX.Element} Rendered search bar component
 */
const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  isLoading = false,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  fullWidth = false,
  disabled = false,
  error = false,
  errorText = '',
  ariaLabel = 'Search input field',
  onFocus,
  onBlur,
  customStyles,
}) => {
  // Theme hook for dynamic styling
  const theme = useTheme();
  
  // Internal state for controlled input
  const [internalValue, setInternalValue] = useState<string>(value);
  
  // Input ref for focus management
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the search value changes
  const debouncedValue = useDebounce<string>(internalValue, debounceMs);

  // Effect to propagate debounced value changes
  React.useEffect(() => {
    if (debouncedValue !== value) {
      onChange(debouncedValue);
    }
  }, [debouncedValue, onChange, value]);

  // Handle input change
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(event.target.value);
  }, []);

  // Handle clear button click
  const handleClear = useCallback(() => {
    setInternalValue('');
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  // Handle keyboard events for accessibility
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClear();
    }
  }, [handleClear]);

  return (
    <SearchContainer 
      fullWidth={fullWidth} 
      style={customStyles}
      role="search"
    >
      <TextField
        inputRef={inputRef}
        fullWidth
        value={internalValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        error={error}
        helperText={errorText}
        placeholder={placeholder}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon 
                color={error ? 'error' : 'action'}
                aria-hidden="true"
              />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {isLoading ? (
                <LoadingSpinner 
                  size="small" 
                  color="inherit"
                  aria-label="Searching"
                />
              ) : internalValue && (
                <IconButton
                  onClick={handleClear}
                  edge="end"
                  aria-label="Clear search"
                  disabled={disabled}
                  size="small"
                >
                  <ClearIcon />
                </IconButton>
              )}
            </InputAdornment>
          ),
          'aria-label': ariaLabel,
          'aria-invalid': error,
          'aria-errormessage': error ? errorText : undefined,
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: error ? theme.palette.error.main : 'inherit',
            },
            '&:hover fieldset': {
              borderColor: error ? theme.palette.error.main : theme.palette.primary.main,
            },
            '&.Mui-focused fieldset': {
              borderColor: error ? theme.palette.error.main : theme.palette.primary.main,
            },
          },
        }}
      />
    </SearchContainer>
  );
};

export default SearchBar;