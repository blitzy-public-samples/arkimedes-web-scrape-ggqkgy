/**
 * @fileoverview Enhanced Toast Notification Context Provider with theme support and accessibility
 * @version 1.0.0
 * 
 * This context provides a centralized system for managing toast notifications across the application
 * with support for themes, animations, accessibility, and enhanced customization options.
 */

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react'; // v18.2.0
import { Snackbar, Alert, AlertColor, useTheme, Slide, SlideProps } from '@mui/material'; // v5.14.0
import { Theme } from '../types/common';

// Global constants for toast configuration
const DEFAULT_TOAST_DURATION = 3000;
const MIN_TOAST_DURATION = 2000;
const MAX_TOAST_DURATION = 10000;
const MAX_VISIBLE_TOASTS = 3;
const ANIMATION_DURATION = 300;
const DEFAULT_TOAST_POSITION = {
  vertical: 'top' as const,
  horizontal: 'right' as const
};

/**
 * Interface defining the enhanced options for toast notifications
 */
interface ToastOptions {
  message: string;
  severity: AlertColor;
  duration?: number | null;
  position?: {
    vertical: 'top' | 'bottom';
    horizontal: 'left' | 'center' | 'right';
  };
  theme?: Theme;
  autoHideDuration?: number;
  disableWindowBlur?: boolean;
  animation?: SlideProps;
  role?: string;
  ariaLabel?: string;
}

/**
 * Interface defining the enhanced toast context type with additional control options
 */
interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
  clearAll: () => void;
  updateToast: (options: Partial<ToastOptions>) => void;
  isVisible: boolean;
}

/**
 * Interface defining the props for the ToastProvider component
 */
interface ToastProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  maxVisible?: number;
  defaultDuration?: number;
}

// Create the context with enhanced type safety
const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Enhanced Toast Provider Component
 * Manages toast notifications with theme support and accessibility features
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  defaultTheme = Theme.LIGHT,
  maxVisible = MAX_VISIBLE_TOASTS,
  defaultDuration = DEFAULT_TOAST_DURATION,
}) => {
  const [open, setOpen] = useState(false);
  const [toastQueue, setToastQueue] = useState<ToastOptions[]>([]);
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const muiTheme = useTheme();

  // Cleanup function for toast timeouts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  /**
   * Shows a toast notification with enhanced features
   */
  const showToast = useCallback((options: ToastOptions) => {
    const enhancedOptions: ToastOptions = {
      ...options,
      duration: options.duration || defaultDuration,
      position: options.position || DEFAULT_TOAST_POSITION,
      theme: options.theme || defaultTheme,
      role: options.role || 'alert',
      ariaLabel: options.ariaLabel || options.message,
    };

    setToastQueue(prev => {
      const newQueue = [...prev, enhancedOptions];
      if (newQueue.length > maxVisible) {
        newQueue.shift();
      }
      return newQueue;
    });

    if (!open) {
      setCurrentToast(enhancedOptions);
      setOpen(true);
    }
  }, [defaultDuration, defaultTheme, maxVisible, open]);

  /**
   * Hides the current toast notification with cleanup
   */
  const hideToast = useCallback(() => {
    setOpen(false);
    
    // Process next toast in queue after animation
    timeoutRef.current = setTimeout(() => {
      setToastQueue(prev => {
        const [, ...rest] = prev;
        if (rest.length > 0) {
          setCurrentToast(rest[0]);
          setOpen(true);
        } else {
          setCurrentToast(null);
        }
        return rest;
      });
    }, ANIMATION_DURATION);
  }, []);

  /**
   * Clears all pending toast notifications
   */
  const clearAll = useCallback(() => {
    setToastQueue([]);
    setCurrentToast(null);
    setOpen(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  /**
   * Updates the current toast notification
   */
  const updateToast = useCallback((options: Partial<ToastOptions>) => {
    if (currentToast) {
      const updatedToast = { ...currentToast, ...options };
      setCurrentToast(updatedToast);
      setToastQueue(prev => [updatedToast, ...prev.slice(1)]);
    }
  }, [currentToast]);

  /**
   * Custom slide transition for toast animations
   */
  const SlideTransition = (props: SlideProps) => {
    return <Slide {...props} direction={currentToast?.position?.horizontal === 'left' ? 'right' : 'left'} />;
  };

  return (
    <ToastContext.Provider
      value={{
        showToast,
        hideToast,
        clearAll,
        updateToast,
        isVisible: open,
      }}
    >
      {children}
      {currentToast && (
        <Snackbar
          open={open}
          autoHideDuration={currentToast.duration}
          onClose={(_, reason) => {
            if (reason !== 'clickaway' && !currentToast.disableWindowBlur) {
              hideToast();
            }
          }}
          anchorOrigin={currentToast.position}
          TransitionComponent={currentToast.animation?.direction ? Slide : SlideTransition}
          TransitionProps={currentToast.animation}
          sx={{
            '& .MuiAlert-root': {
              backgroundColor: muiTheme.palette.background.paper,
              color: muiTheme.palette.text.primary,
            },
          }}
        >
          <Alert
            onClose={hideToast}
            severity={currentToast.severity}
            variant="filled"
            elevation={6}
            role={currentToast.role}
            aria-label={currentToast.ariaLabel}
          >
            {currentToast.message}
          </Alert>
        </Snackbar>
      )}
    </ToastContext.Provider>
  );
};

/**
 * Custom hook for accessing toast context with type safety
 * @throws {Error} When used outside of ToastProvider
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Export the context for advanced use cases
export { ToastContext };