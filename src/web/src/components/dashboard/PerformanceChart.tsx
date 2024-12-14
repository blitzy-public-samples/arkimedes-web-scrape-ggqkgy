/**
 * @fileoverview Performance metrics chart component with real-time updates and accessibility
 * Implements Chart.js visualization with comprehensive error handling and responsive design
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ChartData } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useErrorBoundary } from 'react-error-boundary';
import debounce from 'lodash/debounce';

import { getSystemMetrics, getTaskMetrics, getScrapingMetrics } from '../../api/metrics';
import { lineChartConfig } from '../../config/charts';
import { LoadingState } from '../../types/common';
import { SystemMetrics, TaskMetrics, ScrapingMetrics } from '../../api/metrics';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Type definitions
interface PerformanceChartProps {
  metricType: 'system' | 'task' | 'scraping';
  taskId?: string;
  height?: number;
  width?: number;
  showLegend?: boolean;
  refreshInterval?: number;
  onError?: (error: Error) => void;
  ariaLabel?: string;
}

interface ChartDimensions {
  width: number;
  height: number;
}

interface MetricsData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
  }[];
}

/**
 * Performance chart component for visualizing system and task metrics
 * @param props - Component properties
 * @returns Rendered chart component
 */
export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  metricType,
  taskId,
  height = 400,
  width = 800,
  showLegend = true,
  refreshInterval = 30000,
  onError,
  ariaLabel = 'Performance Metrics Chart'
}) => {
  // State management
  const [chartData, setChartData] = useState<MetricsData | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [dimensions, setDimensions] = useState<ChartDimensions>({ width, height });
  
  // Refs for cleanup
  const chartRef = useRef<ChartJS | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout>();
  
  // Error boundary integration
  const { showBoundary } = useErrorBoundary();

  /**
   * Transforms metrics data into Chart.js format
   */
  const transformMetricsData = useCallback((data: SystemMetrics | TaskMetrics | ScrapingMetrics[]): MetricsData => {
    switch (metricType) {
      case 'system':
        const systemData = data as SystemMetrics;
        return {
          labels: [new Date().toLocaleTimeString()],
          datasets: [
            {
              label: 'CPU Usage',
              data: [systemData.cpu.usage],
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.5)',
            },
            {
              label: 'Memory Usage',
              data: [systemData.memory.percentage],
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
            },
            {
              label: 'Storage Usage',
              data: [systemData.storage.percentage],
              borderColor: 'rgb(53, 162, 235)',
              backgroundColor: 'rgba(53, 162, 235, 0.5)',
            },
          ],
        };

      case 'task':
        const taskData = data as TaskMetrics[];
        return {
          labels: taskData.map(d => new Date(d.timestamp).toLocaleTimeString()),
          datasets: [
            {
              label: 'Execution Time',
              data: taskData.map(d => d.executionTime),
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.5)',
            },
            {
              label: 'Success Rate',
              data: taskData.map(d => d.successRate),
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
            },
          ],
        };

      case 'scraping':
        const scrapingData = data as ScrapingMetrics[];
        return {
          labels: scrapingData.map(d => new Date(d.timestamp).toLocaleTimeString()),
          datasets: [
            {
              label: 'Pages Scraped',
              data: scrapingData.map(d => d.pagesScraped),
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.5)',
            },
            {
              label: 'Response Time',
              data: scrapingData.map(d => d.responseTime),
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
            },
          ],
        };

      default:
        throw new Error(`Unsupported metric type: ${metricType}`);
    }
  }, [metricType]);

  /**
   * Fetches metrics data from API
   */
  const fetchMetricsData = useCallback(async () => {
    try {
      setLoadingState(LoadingState.LOADING);
      
      let data;
      switch (metricType) {
        case 'system':
          data = await getSystemMetrics({ page: 1, limit: 1 });
          break;
        case 'task':
          data = await getTaskMetrics(taskId);
          break;
        case 'scraping':
          data = await getScrapingMetrics(taskId);
          break;
      }

      if (data.status === 'success') {
        setChartData(transformMetricsData(data.data));
        setLoadingState(LoadingState.SUCCEEDED);
      } else {
        throw new Error('Failed to fetch metrics data');
      }
    } catch (error) {
      setLoadingState(LoadingState.FAILED);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching metrics:', errorMessage);
      onError?.(error as Error);
      showBoundary(error);
    }
  }, [metricType, taskId, transformMetricsData, onError, showBoundary]);

  /**
   * Handles window resize events
   */
  const handleResize = useCallback(debounce(() => {
    if (chartRef.current?.canvas) {
      const canvas = chartRef.current.canvas;
      setDimensions({
        width: canvas.parentElement?.clientWidth || width,
        height: canvas.parentElement?.clientHeight || height,
      });
    }
  }, 250), [width, height]);

  // Initial data fetch and refresh interval setup
  useEffect(() => {
    fetchMetricsData();

    if (refreshInterval > 0) {
      refreshTimerRef.current = setInterval(fetchMetricsData, refreshInterval);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [fetchMetricsData, refreshInterval]);

  // Window resize handler
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Chart configuration
  const chartOptions = {
    ...lineChartConfig.options,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom' as const,
      },
      tooltip: {
        enabled: true,
        mode: 'index' as const,
        intersect: false,
      },
    },
    accessibility: {
      enabled: true,
      announceOnShow: true,
      description: ariaLabel,
    },
  };

  if (loadingState === LoadingState.LOADING && !chartData) {
    return <div>Loading metrics data...</div>;
  }

  if (loadingState === LoadingState.FAILED) {
    return <div>Error loading metrics data. Please try again later.</div>;
  }

  return (
    <div
      style={{ width: dimensions.width, height: dimensions.height }}
      role="region"
      aria-label={ariaLabel}
    >
      {chartData && (
        <Line
          ref={chartRef}
          data={chartData}
          options={chartOptions}
          aria-label={ariaLabel}
        />
      )}
    </div>
  );
};

export type { PerformanceChartProps };