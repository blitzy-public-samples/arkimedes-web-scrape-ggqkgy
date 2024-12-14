import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { axe } from '@axe-core/react';
import DataExplorer from '../../../src/components/data/DataExplorer';
import { fetchData } from '../../../src/api/data';
import { ScrapedData } from '../../../src/types/data';

// Mock dependencies
vi.mock('../../../src/api/data');
vi.mock('@mui/material/useMediaQuery');

// Mock data
const mockScrapedData: ScrapedData[] = [
  {
    id: '1',
    execution_id: 'exec-1',
    collected_at: '2024-01-20T10:00:00Z',
    version: '1.0.0',
    status: 'valid',
    raw_data: { title: 'Test Item 1' },
    transformed_data: { title: 'Transformed Test 1' },
    validation_results: [{ field: 'title', status: 'valid' }],
    metadata: { source: 'test' }
  },
  {
    id: '2',
    execution_id: 'exec-2',
    collected_at: '2024-01-20T11:00:00Z',
    version: '1.0.0',
    status: 'invalid',
    raw_data: { title: 'Test Item 2' },
    transformed_data: { title: 'Transformed Test 2' },
    validation_results: [{ field: 'title', status: 'invalid', message: 'Invalid format' }],
    metadata: { source: 'test' }
  }
];

// Mock error scenarios
const mockErrorData = {
  network: new Error('Network error'),
  validation: new Error('Validation failed'),
  server: new Error('Internal server error')
};

describe('DataExplorer', () => {
  // Setup and teardown
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (fetchData as jest.Mock).mockResolvedValue({
      data: mockScrapedData,
      total: mockScrapedData.length
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    test('renders initial loading state correctly', () => {
      render(<DataExplorer onExport={() => Promise.resolve()} />);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByLabelText(/loading content/i)).toBeInTheDocument();
    });

    test('renders data table with correct columns', async () => {
      render(<DataExplorer onExport={() => Promise.resolve()} />);
      
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(6); // Including checkbox column
      expect(headers[1]).toHaveTextContent('ID');
      expect(headers[2]).toHaveTextContent('Status');
      expect(headers[3]).toHaveTextContent('Collected At');
      expect(headers[4]).toHaveTextContent('Version');
    });

    test('renders data preview panel on large screens', async () => {
      vi.mocked(window.matchMedia).mockImplementation(query => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(<DataExplorer onExport={() => Promise.resolve()} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('data-preview')).toBeInTheDocument();
      });
    });
  });

  describe('Filtering and Sorting', () => {
    test('applies filters correctly', async () => {
      const user = userEvent.setup();
      render(<DataExplorer onExport={() => Promise.resolve()} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Test status filter
      const statusFilter = screen.getByLabelText(/status/i);
      await user.click(statusFilter);
      await user.click(screen.getByText('Valid'));

      expect(fetchData).toHaveBeenCalledWith(expect.objectContaining({
        status: 'valid'
      }));
    });

    test('handles sorting correctly', async () => {
      const user = userEvent.setup();
      render(<DataExplorer onExport={() => Promise.resolve()} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Test column sorting
      const sortButton = screen.getByLabelText(/sort by collected at/i);
      await user.click(sortButton);

      expect(fetchData).toHaveBeenCalledWith(expect.objectContaining({
        sortField: 'collected_at',
        sortDirection: 'asc'
      }));
    });
  });

  describe('Data Selection and Export', () => {
    test('handles row selection correctly', async () => {
      const user = userEvent.setup();
      const mockExport = vi.fn().mockResolvedValue(undefined);
      
      render(<DataExplorer onExport={mockExport} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Select first row
      const checkbox = screen.getAllByRole('checkbox')[1];
      await user.click(checkbox);

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    test('triggers export with selected data', async () => {
      const user = userEvent.setup();
      const mockExport = vi.fn().mockResolvedValue(undefined);
      
      render(<DataExplorer onExport={mockExport} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Select and export
      const checkbox = screen.getAllByRole('checkbox')[1];
      await user.click(checkbox);
      await user.click(screen.getByLabelText(/export selected/i));

      expect(mockExport).toHaveBeenCalledWith([mockScrapedData[0].id]);
    });
  });

  describe('Error Handling', () => {
    test('displays network error correctly', async () => {
      (fetchData as jest.Mock).mockRejectedValue(mockErrorData.network);
      
      render(<DataExplorer onExport={() => Promise.resolve()} />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
      });
    });

    test('displays validation error correctly', async () => {
      (fetchData as jest.Mock).mockRejectedValue(mockErrorData.validation);
      
      render(<DataExplorer onExport={() => Promise.resolve()} />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/validation failed/i);
      });
    });
  });

  describe('Accessibility', () => {
    test('meets WCAG 2.1 Level AA standards', async () => {
      const { container } = render(<DataExplorer onExport={() => Promise.resolve()} />);
      
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    test('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<DataExplorer onExport={() => Promise.resolve()} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Test tab navigation
      await user.tab();
      expect(screen.getByLabelText(/select all/i)).toHaveFocus();

      // Test row selection with keyboard
      await user.keyboard('{Space}');
      expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    test('debounces filter changes', async () => {
      vi.useFakeTimers();
      render(<DataExplorer onExport={() => Promise.resolve()} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Type in search field
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'test');

      // Fast-forward timers
      vi.runAllTimers();

      expect(fetchData).toHaveBeenCalledTimes(1);
      expect(fetchData).toHaveBeenCalledWith(expect.objectContaining({
        searchTerm: 'test'
      }));
    });

    test('handles large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        ...mockScrapedData[0],
        id: `id-${i}`
      }));

      (fetchData as jest.Mock).mockResolvedValue({
        data: largeDataset,
        total: largeDataset.length
      });

      const { container } = render(<DataExplorer onExport={() => Promise.resolve()} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Check virtualization
      const renderedRows = container.querySelectorAll('tr').length;
      expect(renderedRows).toBeLessThan(largeDataset.length);
    });
  });
});