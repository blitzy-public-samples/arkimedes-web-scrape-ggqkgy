/**
 * @fileoverview A reusable alert dialog component that displays important messages,
 * warnings, or errors with customizable actions and severity levels.
 * Follows WCAG 2.1 Level AA accessibility standards.
 * @version 1.0.0
 */

import React, { useCallback } from 'react'; // v18.2.0
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  AlertTitle,
  Fade,
  AlertProps,
} from '@mui/material'; // v5.14.0
import { Theme } from '../../types/common';

/**
 * Props interface for the AlertDialog component
 */
export interface AlertDialogProps {
  /** Controls dialog visibility */
  open: boolean;
  /** Dialog title text */
  title: string;
  /** Main message content */
  message: string;
  /** Alert severity level */
  severity: AlertProps['severity'];
  /** Handler for dialog close */
  onClose: () => void;
  /** Handler for confirm action */
  onConfirm: () => void;
  /** Custom confirm button text */
  confirmText?: string;
  /** Custom cancel button text */
  cancelText?: string;
  /** Prevents closing on backdrop click */
  disableBackdropClick?: boolean;
  /** Prevents closing on Escape key */
  disableEscapeKeyDown?: boolean;
  /** Controls dialog width */
  fullWidth?: boolean;
  /** Sets maximum dialog width */
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * A customizable alert dialog component that follows accessibility best practices
 * and provides consistent error/warning message display.
 */
export const AlertDialog = React.memo<AlertDialogProps>(({
  open,
  title,
  message,
  severity = 'info',
  onClose,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  disableBackdropClick = false,
  disableEscapeKeyDown = false,
  fullWidth = true,
  maxWidth = 'sm'
}) => {
  // Generate unique IDs for accessibility attributes
  const titleId = `alert-dialog-title-${severity}`;
  const descriptionId = `alert-dialog-description-${severity}`;

  /**
   * Handles dialog close events, checking for backdrop clicks
   */
  const handleClose = useCallback((event: {}, reason: 'backdropClick' | 'escapeKeyDown') => {
    if (disableBackdropClick && reason === 'backdropClick') {
      return;
    }
    if (disableEscapeKeyDown && reason === 'escapeKeyDown') {
      return;
    }
    onClose();
  }, [disableBackdropClick, disableEscapeKeyDown, onClose]);

  /**
   * Memoized confirm action handler
   */
  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      fullWidth={fullWidth}
      maxWidth={maxWidth}
      TransitionComponent={Fade}
      TransitionProps={{ timeout: 300 }}
    >
      <DialogTitle id={titleId}>
        {title}
      </DialogTitle>
      <DialogContent>
        <Alert 
          severity={severity}
          variant="outlined"
          sx={{
            mt: 1,
            '& .MuiAlert-message': {
              width: '100%'
            }
          }}
        >
          <AlertTitle>{title}</AlertTitle>
          <div id={descriptionId}>
            {message}
          </div>
        </Alert>
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          gap: 1
        }}
      >
        <Button
          onClick={onClose}
          color="inherit"
          variant="outlined"
          aria-label={cancelText}
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          color={severity === 'error' ? 'error' : 'primary'}
          variant="contained"
          autoFocus
          aria-label={confirmText}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

// Display name for debugging
AlertDialog.displayName = 'AlertDialog';