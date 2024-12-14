import React, { useMemo } from 'react';
import { CircularProgress, Box } from '@mui/material'; // @mui/material v5.14.0
import { styled } from '@mui/material/styles'; // @mui/material/styles v5.14.0

// Size mapping for predefined spinner sizes
const SPINNER_SIZES = {
  small: 24,
  medium: 40,
  large: 56,
} as const;

// Props interface with comprehensive customization options
interface LoadingSpinnerProps {
  /**
   * Controls the size of the spinner
   * @default 'medium'
   */
  size?: number | 'small' | 'medium' | 'large';
  
  /**
   * Theme-aware color variant for the spinner
   * @default 'primary'
   */
  color?: 'primary' | 'secondary' | 'inherit';
  
  /**
   * Controls whether spinner appears with a blocking overlay
   * @default false
   */
  overlay?: boolean;
  
  /**
   * Optional loading message displayed below the spinner
   */
  message?: string;
}

// Styled container component for the spinner and message
const SpinnerContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing(2),
  transition: 'all 0.3s ease',
  position: 'relative',
}));

// Styled overlay component with theme-aware background
const SpinnerOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: theme.palette.mode === 'light' 
    ? 'rgba(255, 255, 255, 0.8)' 
    : 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: theme.zIndex.modal - 1,
  backdropFilter: 'blur(2px)',
  transition: 'background-color 0.3s ease',
}));

/**
 * A reusable loading spinner component that provides visual feedback during
 * asynchronous operations. Supports theme-awareness, accessibility, and overlay modes.
 *
 * @param {LoadingSpinnerProps} props - Component props
 * @returns {JSX.Element} Rendered loading spinner component
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = 'primary',
  overlay = false,
  message,
}) => {
  // Calculate actual spinner size
  const spinnerSize = useMemo(() => {
    if (typeof size === 'number') return size;
    return SPINNER_SIZES[size];
  }, [size]);

  // Create base spinner content with accessibility attributes
  const spinnerContent = (
    <SpinnerContainer>
      <CircularProgress
        size={spinnerSize}
        color={color}
        role="progressbar"
        aria-busy="true"
        aria-label={message || 'Loading content'}
      />
      {message && (
        <Box
          component="span"
          sx={{ typography: 'body2' }}
          aria-live="polite"
        >
          {message}
        </Box>
      )}
    </SpinnerContainer>
  );

  // Return spinner with or without overlay
  return overlay ? (
    <SpinnerOverlay role="alert" aria-busy="true">
      {spinnerContent}
    </SpinnerOverlay>
  ) : spinnerContent;
};

export default LoadingSpinner;