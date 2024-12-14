/**
 * @fileoverview SystemHealth component for displaying real-time system resource metrics
 * with visual indicators and alerts. Implements comprehensive monitoring capabilities
 * for the web scraping platform dashboard.
 * @version 1.0.0
 */

import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Tooltip,
  Skeleton,
} from '@mui/material'; // ^5.14.0
import { useApi } from '../../hooks/useApi';
import { getSystemMetrics, SystemMetrics } from '../../api/metrics';

// Threshold configurations for resource monitoring
const RESOURCE_THRESHOLDS = {
  cpu: {
    warning: 70,
    critical: 90,
  },
  memory: {
    warning: 80,
    critical: 95,
  },
  storage: {
    warning: 85,
    critical: 95,
  },
} as const;

// Polling interval for metrics updates (in milliseconds)
const METRICS_POLLING_INTERVAL = 30000;

/**
 * Helper function to determine progress bar color based on usage percentage
 */
const getProgressColor = (percentage: number, type: keyof typeof RESOURCE_THRESHOLDS): string => {
  const thresholds = RESOURCE_THRESHOLDS[type];
  if (percentage >= thresholds.critical) return 'error';
  if (percentage >= thresholds.warning) return 'warning';
  return 'primary';
};

/**
 * Helper function to format bytes into human-readable format
 */
const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
};

/**
 * SystemHealth component displays real-time system metrics with visual indicators
 */
const SystemHealth: React.FC = () => {
  // Reference for storing previous metrics for comparison
  const prevMetricsRef = useRef<SystemMetrics | null>(null);

  // Fetch system metrics with automatic polling
  const { data: metrics, loading, error } = useApi<SystemMetrics>(() => 
    getSystemMetrics({ page: 1, limit: 1 }), {
      pollingInterval: METRICS_POLLING_INTERVAL,
      retryCount: 3,
    }
  );

  // Memoized resource usage calculations
  const resourceUsage = useMemo(() => {
    if (!metrics) return null;

    return {
      cpu: {
        percentage: metrics.cpu.usage,
        label: `CPU Usage: ${metrics.cpu.usage.toFixed(1)}% (${metrics.cpu.cores} cores)`,
        load: `Load: ${metrics.cpu.load.toFixed(2)}`,
      },
      memory: {
        percentage: metrics.memory.percentage,
        label: `Memory: ${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`,
        swap: `Swap: ${formatBytes(metrics.memory.swap.used)} / ${formatBytes(metrics.memory.swap.total)}`,
      },
      storage: {
        percentage: metrics.storage.percentage,
        label: `Storage: ${formatBytes(metrics.storage.used)} / ${formatBytes(metrics.storage.total)}`,
        devices: metrics.storage.devices,
      },
    };
  }, [metrics]);

  // Effect to check for significant metric changes and announce to screen readers
  useEffect(() => {
    if (metrics && prevMetricsRef.current) {
      const significantChange = (current: number, previous: number) => Math.abs(current - previous) > 10;

      if (significantChange(metrics.cpu.usage, prevMetricsRef.current.cpu.usage)) {
        const message = `CPU usage changed to ${metrics.cpu.usage.toFixed(1)}%`;
        announceMetricChange(message);
      }
    }
    prevMetricsRef.current = metrics;
  }, [metrics]);

  // Announce metric changes for accessibility
  const announceMetricChange = useCallback((message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, []);

  // Error handling with fallback UI
  if (error) {
    return (
      <Card>
        <CardContent>
          <Typography color="error">
            Error loading system metrics. Please try again later.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          System Health
        </Typography>

        {loading && !metrics ? (
          // Loading skeleton
          <Box>
            {[...Array(3)].map((_, index) => (
              <Box key={index} sx={{ my: 2 }}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="rectangular" height={10} />
              </Box>
            ))}
          </Box>
        ) : resourceUsage ? (
          // Resource metrics display
          <Box>
            {/* CPU Usage */}
            <Box sx={{ my: 2 }}>
              <Tooltip title={resourceUsage.cpu.load} placement="right">
                <Typography variant="body2" gutterBottom>
                  {resourceUsage.cpu.label}
                </Typography>
              </Tooltip>
              <LinearProgress
                variant="determinate"
                value={resourceUsage.cpu.percentage}
                color={getProgressColor(resourceUsage.cpu.percentage, 'cpu')}
                sx={{ height: 10, borderRadius: 1 }}
              />
            </Box>

            {/* Memory Usage */}
            <Box sx={{ my: 2 }}>
              <Tooltip title={resourceUsage.memory.swap} placement="right">
                <Typography variant="body2" gutterBottom>
                  {resourceUsage.memory.label}
                </Typography>
              </Tooltip>
              <LinearProgress
                variant="determinate"
                value={resourceUsage.memory.percentage}
                color={getProgressColor(resourceUsage.memory.percentage, 'memory')}
                sx={{ height: 10, borderRadius: 1 }}
              />
            </Box>

            {/* Storage Usage */}
            <Box sx={{ my: 2 }}>
              <Tooltip 
                title={
                  <Box>
                    {resourceUsage.storage.devices.map((device, index) => (
                      <Typography key={index} variant="caption" display="block">
                        {`${device.path}: ${formatBytes(device.used)} / ${formatBytes(device.total)}`}
                      </Typography>
                    ))}
                  </Box>
                }
                placement="right"
              >
                <Typography variant="body2" gutterBottom>
                  {resourceUsage.storage.label}
                </Typography>
              </Tooltip>
              <LinearProgress
                variant="determinate"
                value={resourceUsage.storage.percentage}
                color={getProgressColor(resourceUsage.storage.percentage, 'storage')}
                sx={{ height: 10, borderRadius: 1 }}
              />
            </Box>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default SystemHealth;