/**
 * @fileoverview Dashboard quick actions component providing easy access to common tasks
 * with role-based access control and accessibility features.
 * @version 1.0.0
 */

import React, { useCallback, useState } from 'react'; // v18.2.0
import { 
  Grid, 
  Card, 
  CardContent, 
  Button, 
  Typography, 
  CircularProgress 
} from '@mui/material'; // v5.14.0
import { 
  Add as AddIcon, 
  Upload as UploadIcon, 
  Assessment as AssessmentIcon 
} from '@mui/icons-material'; // v5.14.0
import { useNavigate } from 'react-router-dom'; // v6.14.0

import { useAuth } from '../../hooks/useAuth';
import { AlertDialog, AlertDialogProps } from '../common/AlertDialog';
import { UserRole } from '../../types/auth';

/**
 * Props interface for QuickActions component
 */
export interface QuickActionsProps {
  /** Optional class name for styling */
  className?: string;
  /** Callback for action completion */
  onActionComplete?: (action: string, success: boolean) => void;
  /** Custom actions to be added */
  customActions?: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    handler: () => Promise<void>;
  }>;
  /** Loading states for actions */
  loading?: Record<string, boolean>;
}

/**
 * Quick actions component for dashboard providing easy access to common tasks
 */
export const QuickActions = React.memo<QuickActionsProps>(({
  className,
  onActionComplete,
  customActions = [],
  loading = {}
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  // Check user permissions
  const canCreateTask = user?.role && [UserRole.ADMIN, UserRole.OPERATOR].includes(user.role);
  const canImportConfig = user?.role === UserRole.ADMIN;
  const canViewReports = user?.role && [UserRole.ADMIN, UserRole.ANALYST].includes(user.role);

  /**
   * Handles new task creation
   */
  const handleNewTask = useCallback(async () => {
    try {
      if (!canCreateTask) {
        throw new Error('Insufficient permissions to create tasks');
      }
      navigate('/tasks/new');
      onActionComplete?.('new-task', true);
    } catch (err) {
      setError({
        title: 'Task Creation Error',
        message: err instanceof Error ? err.message : 'Failed to create new task'
      });
      onActionComplete?.('new-task', false);
    }
  }, [canCreateTask, navigate, onActionComplete]);

  /**
   * Handles configuration import
   */
  const handleImportConfig = useCallback(async () => {
    try {
      if (!canImportConfig) {
        throw new Error('Insufficient permissions to import configurations');
      }
      navigate('/settings/import');
      onActionComplete?.('import-config', true);
    } catch (err) {
      setError({
        title: 'Import Error',
        message: err instanceof Error ? err.message : 'Failed to import configuration'
      });
      onActionComplete?.('import-config', false);
    }
  }, [canImportConfig, navigate, onActionComplete]);

  /**
   * Handles usage report navigation
   */
  const handleUsageReport = useCallback(async () => {
    try {
      if (!canViewReports) {
        throw new Error('Insufficient permissions to view reports');
      }
      navigate('/reports/usage');
      onActionComplete?.('usage-report', true);
    } catch (err) {
      setError({
        title: 'Report Access Error',
        message: err instanceof Error ? err.message : 'Failed to access usage report'
      });
      onActionComplete?.('usage-report', false);
    }
  }, [canViewReports, navigate, onActionComplete]);

  return (
    <>
      <Grid container spacing={2} className={className}>
        {/* New Task Button */}
        {canCreateTask && (
          <Grid item xs={12} sm={6} md={4}>
            <Card elevation={2}>
              <CardContent>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  startIcon={loading['new-task'] ? <CircularProgress size={20} /> : <AddIcon />}
                  onClick={handleNewTask}
                  disabled={loading['new-task']}
                  aria-label="Create new task"
                >
                  <Typography variant="button">New Task</Typography>
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Import Config Button */}
        {canImportConfig && (
          <Grid item xs={12} sm={6} md={4}>
            <Card elevation={2}>
              <CardContent>
                <Button
                  fullWidth
                  variant="contained"
                  color="secondary"
                  startIcon={loading['import-config'] ? <CircularProgress size={20} /> : <UploadIcon />}
                  onClick={handleImportConfig}
                  disabled={loading['import-config']}
                  aria-label="Import configuration"
                >
                  <Typography variant="button">Import Config</Typography>
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Usage Report Button */}
        {canViewReports && (
          <Grid item xs={12} sm={6} md={4}>
            <Card elevation={2}>
              <CardContent>
                <Button
                  fullWidth
                  variant="contained"
                  color="info"
                  startIcon={loading['usage-report'] ? <CircularProgress size={20} /> : <AssessmentIcon />}
                  onClick={handleUsageReport}
                  disabled={loading['usage-report']}
                  aria-label="View usage report"
                >
                  <Typography variant="button">Usage Report</Typography>
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Custom Actions */}
        {customActions.map(action => (
          <Grid item xs={12} sm={6} md={4} key={action.id}>
            <Card elevation={2}>
              <CardContent>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  startIcon={loading[action.id] ? <CircularProgress size={20} /> : action.icon}
                  onClick={action.handler}
                  disabled={loading[action.id]}
                  aria-label={action.label}
                >
                  <Typography variant="button">{action.label}</Typography>
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Error Dialog */}
      {error && (
        <AlertDialog
          open={!!error}
          title={error.title}
          message={error.message}
          severity="error"
          onClose={() => setError(null)}
          onConfirm={() => setError(null)}
          confirmText="OK"
          maxWidth="sm"
        />
      )}
    </>
  );
});

QuickActions.displayName = 'QuickActions';

export default QuickActions;