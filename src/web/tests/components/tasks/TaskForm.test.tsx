/**
 * @fileoverview Comprehensive test suite for TaskForm component validating form functionality,
 * validation rules, user interactions, accessibility compliance, and error handling.
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // ^14.0.0
import userEvent from '@testing-library/user-event'; // ^14.4.3
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // ^29.6.0
import { axe, toHaveNoViolations } from '@axe-core/react'; // ^4.7.3

import TaskForm from '../../../../src/components/tasks/TaskForm';
import { Task, TaskConfiguration, ExtractorRule } from '../../../../src/types/task';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock validation utilities
jest.mock('../../../../src/utils/validation', () => ({
  validateUrl: jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
  validateSelector: jest.fn().mockReturnValue(true)
}));

// Test data
const validTaskData: Task = {
  name: 'Test Task',
  description: 'Test Description',
  configuration: {
    url: 'https://example.com',
    schedule: {
      frequency: 'daily',
      startDate: new Date().toISOString().split('T')[0],
      endDate: null,
      timeZone: 'UTC'
    },
    extractors: [{
      fieldName: 'title',
      selector: 'h1',
      type: 'text',
      required: true,
      validation: null,
      transform: null
    }],
    priority: 'medium',
    useProxy: false,
    followPagination: false,
    maxPages: 10,
    javascript: false,
    authentication: {
      required: false
    }
  }
};

// Helper function to render TaskForm with test props
const renderTaskForm = (props: {
  initialData?: Task;
  onSubmit?: jest.Mock;
  onCancel?: jest.Mock;
  onValidationChange?: jest.Mock;
} = {}) => {
  const user = userEvent.setup();
  const mockSubmit = props.onSubmit || jest.fn();
  const mockCancel = props.onCancel || jest.fn();
  const mockValidationChange = props.onValidationChange || jest.fn();

  const utils = render(
    <TaskForm
      initialTask={props.initialData}
      onSubmit={mockSubmit}
      onCancel={mockCancel}
      onValidationChange={mockValidationChange}
    />
  );

  return {
    ...utils,
    user,
    mockSubmit,
    mockCancel,
    mockValidationChange
  };
};

describe('TaskForm Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders form with all required fields and proper ARIA labels', () => {
    const { container } = renderTaskForm();

    // Check for required fields
    expect(screen.getByLabelText(/task name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target url/i)).toBeInTheDocument();
    expect(screen.getByText(/extraction rules/i)).toBeInTheDocument();

    // Verify ARIA attributes
    expect(container.querySelector('form')).toHaveAttribute('novalidate');
    expect(screen.getByLabelText(/task name/i)).toHaveAttribute('aria-required', 'true');
  });

  it('validates required fields with proper error messages', async () => {
    const { user } = renderTaskForm();

    // Submit empty form
    const submitButton = screen.getByText(/save task/i);
    await user.click(submitButton);

    // Check for validation messages
    await waitFor(() => {
      expect(screen.getByText(/task name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/url is required/i)).toBeInTheDocument();
    });
  });

  it('performs real-time URL validation with feedback', async () => {
    const { user } = renderTaskForm();
    const urlInput = screen.getByLabelText(/target url/i);

    // Enter invalid URL
    await user.type(urlInput, 'invalid-url');

    await waitFor(() => {
      expect(screen.getByText(/invalid url format/i)).toBeInTheDocument();
    });

    // Enter valid URL
    await user.clear(urlInput);
    await user.type(urlInput, 'https://example.com');

    await waitFor(() => {
      expect(screen.queryByText(/invalid url format/i)).not.toBeInTheDocument();
    });
  });

  it('handles extractor rule addition and removal', async () => {
    const { user } = renderTaskForm();

    // Add new extractor
    const addButton = screen.getByLabelText(/add extraction rule/i);
    await user.click(addButton);

    // Verify new extractor fields
    const extractors = screen.getAllByLabelText(/field name/i);
    expect(extractors).toHaveLength(2);

    // Remove extractor
    const removeButton = screen.getAllByLabelText(/remove extraction rule/i)[0];
    await user.click(removeButton);

    await waitFor(() => {
      expect(screen.getAllByLabelText(/field name/i)).toHaveLength(1);
    });
  });

  it('submits valid form data successfully', async () => {
    const mockSubmit = jest.fn();
    const { user } = renderTaskForm({ onSubmit: mockSubmit });

    // Fill form with valid data
    await user.type(screen.getByLabelText(/task name/i), validTaskData.name);
    await user.type(screen.getByLabelText(/target url/i), validTaskData.configuration.url);
    await user.type(screen.getByLabelText(/field name/i), 'title');
    await user.type(screen.getByLabelText(/css selector/i), 'h1');

    // Submit form
    const submitButton = screen.getByText(/save task/i);
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
        name: validTaskData.name,
        configuration: expect.objectContaining({
          url: validTaskData.configuration.url
        })
      }));
    });
  });

  it('handles form cancellation properly', async () => {
    const mockCancel = jest.fn();
    const { user } = renderTaskForm({ onCancel: mockCancel });

    const cancelButton = screen.getByText(/cancel/i);
    await user.click(cancelButton);

    expect(mockCancel).toHaveBeenCalled();
  });

  it('maintains accessibility standards', async () => {
    const { container } = renderTaskForm({ initialData: validTaskData });
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('supports keyboard navigation', async () => {
    const { user } = renderTaskForm();

    // Navigate through form using Tab
    await user.tab();
    expect(screen.getByLabelText(/task name/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/target url/i)).toHaveFocus();

    // Verify all interactive elements are reachable
    const interactiveElements = container.querySelectorAll('button, input, select');
    interactiveElements.forEach(element => {
      expect(element).toHaveAttribute('tabindex');
    });
  });

  it('displays validation feedback for cross-field dependencies', async () => {
    const { user } = renderTaskForm();

    // Enable pagination without max pages
    const paginationSwitch = screen.getByLabelText(/follow pagination/i);
    await user.click(paginationSwitch);

    await waitFor(() => {
      expect(screen.getByText(/max pages required when pagination is enabled/i)).toBeInTheDocument();
    });
  });

  it('preserves form state during validation errors', async () => {
    const { user } = renderTaskForm();

    // Fill partial form data
    await user.type(screen.getByLabelText(/task name/i), 'Test Task');
    await user.type(screen.getByLabelText(/target url/i), 'invalid-url');

    // Trigger validation
    const submitButton = screen.getByText(/save task/i);
    await user.click(submitButton);

    // Verify form state is preserved
    expect(screen.getByLabelText(/task name/i)).toHaveValue('Test Task');
    expect(screen.getByLabelText(/target url/i)).toHaveValue('invalid-url');
  });
});