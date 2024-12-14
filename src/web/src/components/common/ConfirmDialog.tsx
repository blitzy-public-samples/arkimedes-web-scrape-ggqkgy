/**
 * @fileoverview A reusable confirmation dialog component that follows Material Design guidelines
 * and implements WCAG 2.1 Level AA accessibility standards. Supports theme adaptation and
 * keyboard navigation.
 * @version 1.0.0
 * @package @mui/material@5.14.0
 */

import React, { useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  useTheme,
  DialogProps,
} from '@mui/material'; // v5.14.0
import { Theme } from '../../types/common';

/**
 * Props interface for the ConfirmDialog component
 */
export interface ConfirmDialogProps {
  /** Controls dialog visibility */
  open: boolean;
  /** Dialog header text */
  title: string;
  /** Main confirmation message */
  message: string;
  /** Handler for dialog dismissal */
  onClose: () => void;
  /** Handler for confirmation action */
  onConfirm: () => void;
  /** Custom text for confirm button */
  confirmText?: string;
  /** Custom text for cancel button */
  cancelText?: string;
  /** Button color for different states */
  confirmButtonColor?: 'primary' | 'error' | 'warning';
  /** Prevents closing on backdrop click */
  disableBackdropClick?: boolean;
}

/**
 * A confirmation dialog component that implements Material Design guidelines
 * and WCAG 2.1 Level AA accessibility standards.
 * 
 * @param props - Component configuration and handlers
 * @returns Rendered confirmation dialog with proper ARIA attributes
 */
export const ConfirmDialog = React.memo<ConfirmDialogProps>(({
  open,
  title,
  message,
  onClose,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonColor = 'primary',
  disableBackdropClick = false,
}) => {
  const theme = useTheme();

  // Handle keyboard events for accessibility
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && !disableBackdropClick) {
      onClose();
    }
  }, [disableBackdropClick, onClose]);

  // Handle dialog backdrop click
  const handleBackdropClick: DialogProps['onBackdropClick'] = useCallback((event) => {
    if (!disableBackdropClick) {
      onClose();
    }
  }, [disableBackdropClick, onClose]);

  // Set up keyboard event listeners
  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open, handleKeyDown]);

  // Handle confirmation with cleanup
  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onBackdropClick={handleBackdropClick}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      sx={{
        '& .MuiDialog-paper': {
          minWidth: 300,
          maxWidth: 500,
          m: 2,
          p: 1,
          backgroundColor: theme.palette.mode === Theme.DARK 
            ? theme.palette.grey[900] 
            : theme.palette.background.paper,
        },
      }}
    >
      <DialogTitle
        id="confirm-dialog-title"
        sx={{
          pb: 1,
          color: theme.palette.text.primary,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent
        id="confirm-dialog-description"
        sx={{
          py: 2,
          color: theme.palette.text.secondary,
        }}
      >
        {message}
      </DialogContent>
      <DialogActions
        sx={{
          px: 2,
          pb: 2,
          pt: 1,
          justifyContent: 'flex-end',
          gap: 1,
        }}
      >
        <Button
          onClick={onClose}
          color="inherit"
          variant="outlined"
          aria-label={cancelText}
          sx={{
            minWidth: 100,
          }}
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          color={confirmButtonColor}
          variant="contained"
          aria-label={confirmText}
          autoFocus
          sx={{
            minWidth: 100,
          }}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

// Display name for debugging
ConfirmDialog.displayName = 'ConfirmDialog';