/**
 * @fileoverview Test suite for SystemHealth component validating real-time system health metrics display
 * with proper accessibility support and threshold-based visual feedback.
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import SystemHealth from '../../src/components/dashboard/SystemHealth';
import { getSystemMetrics } from '../../src/api/metrics';

// Mock the metrics API module
vi.mock('../../src/api/metrics');

// Mock sample metrics data
const mockMetricsData = {
  cpu: {
    usage: 40,
    load: 1.5,
    cores: 8,
    temperature: 65
  },
  memory: {
    used: 8192,
    total: 16384,
    percentage: 50,
    swap: {
      used: 1024,
      total: 4096
    }
  },
  storage: {
    used: 102400,
    total: 512000,
    percentage: 20,
    devices: [
      { path: '/dev/sda1', used: 51200, total: 256000 },
      { path: '/dev/sdb1', used: 51200, total: 256000 }
    ],
    readSpeed: 150,
    writeSpeed: 100
  }
};

// Mock error response
const mockErrorResponse = {
  message: 'Failed to fetch system metrics',
  code: 'METRICS_FETCH_ERROR',
  details: 'Connection timeout'
};

describe('SystemHealth Component', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Mock successful API response by default
    (getSystemMetrics as jest.Mock).mockResolvedValue({ data: mockMetricsData });
  });

  it('displays loading state correctly', async () => {
    // Mock delayed API response
    (getSystemMetrics as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );

    render(<SystemHealth />);

    // Verify loading indicators
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('System Health')).toBeInTheDocument();
    
    // Verify loading skeletons
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons).toHaveLength(3);
  });

  it('handles and displays error states appropriately', async () => {
    // Mock API error
    (getSystemMetrics as jest.Mock).mockRejectedValue(mockErrorResponse);

    render(<SystemHealth />);

    // Wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText(/Error loading system metrics/i)).toBeInTheDocument();
    });

    // Verify error message accessibility
    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveAttribute('aria-live', 'polite');
  });

  it('renders metrics with correct thresholds and colors', async () => {
    render(<SystemHealth />);

    // Wait for metrics to load
    await waitFor(() => {
      expect(screen.getByText(/CPU Usage:/)).toBeInTheDocument();
    });

    // Verify CPU metrics
    const cpuProgress = screen.getByRole('progressbar', { name: /cpu usage/i });
    expect(cpuProgress).toHaveAttribute('aria-valuenow', '40');
    expect(cpuProgress).toHaveClass('MuiLinearProgress-colorPrimary');

    // Verify memory metrics
    const memoryProgress = screen.getByRole('progressbar', { name: /memory usage/i });
    expect(memoryProgress).toHaveAttribute('aria-valuenow', '50');
    expect(memoryProgress).toHaveClass('MuiLinearProgress-colorPrimary');

    // Verify storage metrics
    const storageProgress = screen.getByRole('progressbar', { name: /storage usage/i });
    expect(storageProgress).toHaveAttribute('aria-valuenow', '20');
    expect(storageProgress).toHaveClass('MuiLinearProgress-colorPrimary');
  });

  it('updates metrics in real-time with proper announcements', async () => {
    const user = userEvent.setup();
    render(<SystemHealth />);

    // Wait for initial metrics
    await waitFor(() => {
      expect(screen.getByText(/CPU Usage:/)).toBeInTheDocument();
    });

    // Mock updated metrics with significant change
    const updatedMetrics = {
      ...mockMetricsData,
      cpu: { ...mockMetricsData.cpu, usage: 85 }
    };

    // Simulate metrics update
    (getSystemMetrics as jest.Mock).mockResolvedValue({ data: updatedMetrics });

    // Wait for metrics update
    await waitFor(() => {
      const cpuText = screen.getByText(/CPU Usage: 85/);
      expect(cpuText).toBeInTheDocument();
    });

    // Verify accessibility announcement
    const announcement = screen.getByRole('status', { hidden: true });
    expect(announcement).toHaveTextContent(/CPU usage changed to 85%/);
  });

  it('displays tooltips with detailed information', async () => {
    const user = userEvent.setup();
    render(<SystemHealth />);

    // Wait for metrics to load
    await waitFor(() => {
      expect(screen.getByText(/CPU Usage:/)).toBeInTheDocument();
    });

    // Hover over CPU metric
    const cpuMetric = screen.getByText(/CPU Usage:/);
    await user.hover(cpuMetric);

    // Verify tooltip content
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Load: 1.5/);

    // Hover over memory metric
    const memoryMetric = screen.getByText(/Memory:/);
    await user.hover(memoryMetric);

    // Verify memory tooltip
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Swap:/);
  });

  it('handles threshold-based color changes correctly', async () => {
    // Mock metrics with values crossing thresholds
    const criticalMetrics = {
      ...mockMetricsData,
      cpu: { ...mockMetricsData.cpu, usage: 95 },
      memory: { ...mockMetricsData.memory, percentage: 88 }
    };

    (getSystemMetrics as jest.Mock).mockResolvedValue({ data: criticalMetrics });

    render(<SystemHealth />);

    // Wait for metrics to load
    await waitFor(() => {
      expect(screen.getByText(/CPU Usage: 95/)).toBeInTheDocument();
    });

    // Verify critical CPU threshold color
    const cpuProgress = screen.getByRole('progressbar', { name: /cpu usage/i });
    expect(cpuProgress).toHaveClass('MuiLinearProgress-colorError');

    // Verify warning memory threshold color
    const memoryProgress = screen.getByRole('progressbar', { name: /memory usage/i });
    expect(memoryProgress).toHaveClass('MuiLinearProgress-colorWarning');
  });

  it('maintains accessibility during loading and updates', async () => {
    render(<SystemHealth />);

    // Verify loading state accessibility
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-busy', 'true');

    // Wait for metrics to load
    await waitFor(() => {
      expect(screen.getByText(/CPU Usage:/)).toBeInTheDocument();
    });

    // Verify metric accessibility attributes
    const metrics = screen.getAllByRole('progressbar');
    metrics.forEach(metric => {
      expect(metric).toHaveAttribute('aria-valuemin', '0');
      expect(metric).toHaveAttribute('aria-valuemax', '100');
      expect(metric).toHaveAttribute('aria-valuenow');
    });
  });
});