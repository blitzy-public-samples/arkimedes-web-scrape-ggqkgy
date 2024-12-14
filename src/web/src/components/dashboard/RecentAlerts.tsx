/**
 * @fileoverview Enhanced dashboard component for displaying real-time system alerts
 * with WebSocket-based updates, alert persistence, and accessibility features.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  Typography,
  Skeleton,
  Alert
} from '@mui/material'; // v5.14.0
import NotificationsIcon from '@mui/icons-material/Notifications'; // v5.14.0
import { formatDistanceToNow } from 'date-fns'; // v2.30.0

import StatusBadge from '../common/StatusBadge';
import { useWebSocket } from '../../hooks/useWebSocket';
import { TaskStatus } from '../../types/common';
import { WEBSOCKET_EVENTS } from '../../services/websocket';

// Constants for component configuration
const MAX_ALERTS = 5;
const ALERT_REFRESH_INTERVAL = 30000;
const WEBSOCKET_RETRY_DELAY = 5000;
const ALERT_BATCH_INTERVAL = 1000;

/**
 * Interface for system alerts with enhanced properties
 */
interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  message: string;
  timestamp: Date;
  taskId: string | null;
  status: TaskStatus | null;
  read: boolean;
  priority: number;
}

/**
 * Props for RecentAlerts component with enhanced options
 */
interface RecentAlertsProps {
  maxAlerts?: number;
  className?: string;
  refreshInterval?: number;
  showLoadingState?: boolean;
}

/**
 * Enhanced component for displaying recent system alerts with real-time updates
 */
const RecentAlerts: React.FC<RecentAlertsProps> = ({
  maxAlerts = MAX_ALERTS,
  className,
  refreshInterval = ALERT_REFRESH_INTERVAL,
  showLoadingState = true
}) => {
  // State management
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(showLoadingState);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection for real-time updates
  const { 
    isConnected,
    connectionState,
    addEventListener,
    removeEventListener,
    lastError
  } = useWebSocket(process.env.VITE_WS_URL || 'ws://localhost:8000/ws');

  /**
   * Determine alert severity based on type and status
   */
  const getAlertSeverity = useCallback((alert: Alert): 'error' | 'warning' | 'info' | 'success' => {
    if (alert.type === 'error' || alert.status === TaskStatus.FAILED) {
      return 'error';
    }
    if (alert.type === 'warning') {
      return 'warning';
    }
    if (alert.status === TaskStatus.COMPLETED) {
      return 'success';
    }
    return 'info';
  }, []);

  /**
   * Sort alerts by priority and timestamp
   */
  const sortedAlerts = useMemo(() => {
    return [...alerts]
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return b.timestamp.getTime() - a.timestamp.getTime();
      })
      .slice(0, maxAlerts);
  }, [alerts, maxAlerts]);

  /**
   * Handle incoming WebSocket alert messages
   */
  const handleAlertMessage = useCallback((message: any) => {
    const newAlert: Alert = {
      id: message.id,
      type: message.payload.type,
      message: message.payload.message,
      timestamp: new Date(message.timestamp),
      taskId: message.payload.taskId || null,
      status: message.payload.status || null,
      read: false,
      priority: message.payload.priority || 1
    };

    setAlerts(prevAlerts => {
      const updatedAlerts = [newAlert, ...prevAlerts]
        .filter((alert, index, self) => 
          index === self.findIndex(a => a.id === alert.id)
        );
      
      // Persist alerts to localStorage
      localStorage.setItem('recentAlerts', JSON.stringify(updatedAlerts));
      
      return updatedAlerts;
    });
  }, []);

  /**
   * Load persisted alerts from localStorage
   */
  useEffect(() => {
    const persistedAlerts = localStorage.getItem('recentAlerts');
    if (persistedAlerts) {
      try {
        const parsedAlerts = JSON.parse(persistedAlerts);
        setAlerts(parsedAlerts.map((alert: any) => ({
          ...alert,
          timestamp: new Date(alert.timestamp)
        })));
      } catch (err) {
        console.error('Error loading persisted alerts:', err);
      }
    }
    setIsLoading(false);
  }, []);

  /**
   * Set up WebSocket event listeners
   */
  useEffect(() => {
    addEventListener(WEBSOCKET_EVENTS.ALERT, handleAlertMessage);
    
    return () => {
      removeEventListener(WEBSOCKET_EVENTS.ALERT, handleAlertMessage);
    };
  }, [addEventListener, removeEventListener, handleAlertMessage]);

  /**
   * Update error state based on WebSocket connection status
   */
  useEffect(() => {
    if (lastError) {
      setError('Connection error: Please check your network connection');
    } else if (!isConnected && connectionState !== 'connecting') {
      setError('Disconnected: Attempting to reconnect...');
    } else {
      setError(null);
    }
  }, [isConnected, connectionState, lastError]);

  /**
   * Render loading skeleton
   */
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader
          title={<Skeleton width={200} />}
          avatar={<Skeleton variant="circular" width={40} height={40} />}
        />
        <CardContent>
          <List>
            {Array.from({ length: maxAlerts }).map((_, index) => (
              <ListItem key={index}>
                <ListItemText
                  primary={<Skeleton width="80%" />}
                  secondary={<Skeleton width="40%" />}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader
        title="Recent Alerts"
        avatar={<NotificationsIcon aria-hidden="true" />}
        titleTypographyProps={{
          variant: 'h6',
          component: 'h2',
          'aria-label': 'Recent system alerts'
        }}
      />
      <CardContent>
        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            role="alert"
          >
            {error}
          </Alert>
        )}
        
        {sortedAlerts.length === 0 ? (
          <Typography
            color="textSecondary"
            align="center"
            sx={{ py: 2 }}
          >
            No recent alerts
          </Typography>
        ) : (
          <List aria-label="Alert list">
            {sortedAlerts.map(alert => (
              <ListItem
                key={alert.id}
                divider
                sx={{
                  opacity: alert.read ? 0.7 : 1,
                  transition: 'opacity 0.2s'
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5
                    }}
                  >
                    <Typography
                      variant="body2"
                      component="div"
                      sx={{ fontWeight: alert.read ? 400 : 500 }}
                    >
                      {alert.message}
                    </Typography>
                    {alert.status && (
                      <StatusBadge
                        status={alert.status}
                        size="small"
                      />
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    component="div"
                  >
                    {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                  </Typography>
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentAlerts;