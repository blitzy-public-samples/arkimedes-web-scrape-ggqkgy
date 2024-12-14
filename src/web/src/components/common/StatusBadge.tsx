/**
 * @fileoverview A reusable, accessible status badge component that displays task states
 * with Material Design 3.0 compliant visual indicators.
 * @version 1.0.0
 */

import React from 'react';
import { Chip } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Sync as SyncIcon,
  Cancel as CancelIcon
} from '@mui/icons-material'; // v5.14.0

import { TaskStatus } from '../../types/common';

/**
 * Interface defining the props for the StatusBadge component
 */
interface StatusBadgeProps {
  /** Current status to display */
  status: TaskStatus;
  /** Optional size variant */
  size?: 'small' | 'medium';
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Optional custom aria label */
  ariaLabel?: string;
}

/**
 * Status-specific color mappings using MUI theme colors
 * that meet WCAG 2.1 Level AA contrast requirements
 */
const STATUS_COLORS = {
  [TaskStatus.PENDING]: 'warning.main',
  [TaskStatus.RUNNING]: 'info.main',
  [TaskStatus.COMPLETED]: 'success.main',
  [TaskStatus.FAILED]: 'error.main',
  [TaskStatus.CANCELLED]: 'grey.500'
} as const;

/**
 * Hover state colors with proper contrast ratios
 */
const STATUS_HOVER_COLORS = {
  [TaskStatus.PENDING]: 'warning.dark',
  [TaskStatus.RUNNING]: 'info.dark',
  [TaskStatus.COMPLETED]: 'success.dark',
  [TaskStatus.FAILED]: 'error.dark',
  [TaskStatus.CANCELLED]: 'grey.600'
} as const;

/**
 * Enhanced MUI Chip component with custom styling and accessibility features
 */
const StyledChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== 'status'
})<{ status: TaskStatus; size?: 'small' | 'medium' }>(({ theme, status, size }) => ({
  fontWeight: 500,
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: theme.transitions.duration.short,
  }),
  backgroundColor: theme.palette[STATUS_COLORS[status]],
  color: theme.palette.getContrastText(theme.palette[STATUS_COLORS[status]]),
  
  // Size-specific styles
  height: size === 'small' ? 24 : 32,
  fontSize: size === 'small' ? 12 : 14,
  padding: size === 'small' ? '0 8px' : '0 12px',
  
  // Ensure minimum touch target size for accessibility
  minWidth: 44,
  
  '&:hover': {
    backgroundColor: theme.palette[STATUS_HOVER_COLORS[status]],
  },
  
  // Focus visible styles for keyboard navigation
  '&.Mui-focusVisible': {
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}`,
  },
  
  // Icon styles
  '& .MuiChip-icon': {
    fontSize: size === 'small' ? 16 : 20,
    marginLeft: size === 'small' ? 4 : 6,
  },
}));

/**
 * Generates status-specific configuration including colors and semantic icons
 */
const getStatusConfig = (status: TaskStatus) => {
  const configs = {
    [TaskStatus.PENDING]: {
      icon: <PendingIcon />,
      label: 'Pending',
      ariaLabel: 'Task status: Pending',
    },
    [TaskStatus.RUNNING]: {
      icon: <SyncIcon className="rotating" />,
      label: 'Running',
      ariaLabel: 'Task status: Running',
    },
    [TaskStatus.COMPLETED]: {
      icon: <CheckCircleIcon />,
      label: 'Completed',
      ariaLabel: 'Task status: Completed',
    },
    [TaskStatus.FAILED]: {
      icon: <ErrorIcon />,
      label: 'Failed',
      ariaLabel: 'Task status: Failed',
    },
    [TaskStatus.CANCELLED]: {
      icon: <CancelIcon />,
      label: 'Cancelled',
      ariaLabel: 'Task status: Cancelled',
    },
  };

  return configs[status];
};

/**
 * StatusBadge component for displaying task states with accessible visual indicators
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'medium',
  className,
  ariaLabel,
}) => {
  const config = getStatusConfig(status);

  return (
    <StyledChip
      status={status}
      size={size}
      icon={config.icon}
      label={config.label}
      className={className}
      role="status"
      aria-label={ariaLabel || config.ariaLabel}
      // Ensure chip is keyboard focusable
      tabIndex={0}
    />
  );
};

export default StatusBadge;