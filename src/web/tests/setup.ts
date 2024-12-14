// @testing-library/jest-dom v5.16.5
import '@testing-library/jest-dom';
// vitest v0.34.0
import { vi } from 'vitest';
// resize-observer-polyfill v1.5.1
import ResizeObserverPolyfill from 'resize-observer-polyfill';

/**
 * Sets up comprehensive global browser API mocks required for testing React components
 * Configures all necessary browser APIs and interfaces for reliable component testing
 */
export function setupGlobalMocks(): void {
  // Mock ResizeObserver API
  global.ResizeObserver = class ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      return new ResizeObserverPolyfill(callback);
    }
    observe(target: Element): void {}
    unobserve(target: Element): void {}
    disconnect(): void {}
  };

  // Mock window.matchMedia
  global.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  // Mock fetch API
  global.fetch = vi.fn();

  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback;
      this.options = options;
    }
    private callback: IntersectionObserverCallback;
    private options?: IntersectionObserverInit;
    
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };

  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

  // Configure error handling for mock failures
  if (process.env.NODE_ENV === 'development') {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      if (args[0]?.includes?.('Warning: ReactDOM.render')) return;
      originalConsoleError(...args);
    };
  }
}

/**
 * Extends Jest with custom DOM element matchers and TypeScript definitions
 * Configures enhanced error messages and TypeScript support for DOM testing
 */
export function setupJestDom(): void {
  // Extend expect with DOM matchers
  expect.extend({
    toBeInTheDocument(received: Element) {
      const pass = received?.ownerDocument?.body?.contains(received);
      return {
        pass,
        message: () =>
          `expected element ${pass ? 'not ' : ''}to be in the document`,
      };
    },
    toHaveAttribute(received: Element, attr: string, value?: string) {
      const hasAttr = received.hasAttribute(attr);
      const attrValue = received.getAttribute(attr);
      const pass = value ? hasAttr && attrValue === value : hasAttr;
      return {
        pass,
        message: () =>
          `expected element ${pass ? 'not ' : ''}to have attribute "${attr}"${
            value ? ` with value "${value}"` : ''
          }`,
      };
    },
  });

  // Configure enhanced error messages
  Error.stackTraceLimit = 100;
}

// Auto-initialize setup when imported
setupGlobalMocks();
setupJestDom();

// Export types for TypeScript support
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveAttribute(attr: string, value?: string): R;
    }
  }
}