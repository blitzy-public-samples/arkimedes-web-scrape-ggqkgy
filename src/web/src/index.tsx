/**
 * @fileoverview Entry point for the web scraping platform frontend application.
 * Initializes React application with concurrent rendering, state management,
 * theme handling, and error monitoring.
 * @version 1.0.0
 */

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ErrorBoundary } from '@sentry/react';

// Internal imports
import App from './App';
import { store } from './store';
import { ThemeProvider } from './context/ThemeContext';

// Constants
const ROOT_ELEMENT_ID = 'root';
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Initializes and renders the React application with all required providers
 * and error handling.
 */
const renderApp = (): void => {
  // Get root element with null check
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (!rootElement) {
    console.error(`Root element not found. Please check if the DOM element with id '${ROOT_ELEMENT_ID}' exists.`);
    return;
  }

  // Create root using concurrent features
  const root = createRoot(rootElement);

  // Configure error monitoring
  if (!isDevelopment) {
    // Initialize Sentry for production
    import('@sentry/react').then(Sentry => {
      Sentry.init({
        dsn: process.env.REACT_APP_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 1.0,
        integrations: [
          new Sentry.BrowserTracing(),
          new Sentry.Replay()
        ]
      });
    });
  }

  // Render application with provider hierarchy
  root.render(
    <StrictMode>
      <ErrorBoundary
        fallback={({ error }) => (
          <div role="alert">
            <h2>Application Error</h2>
            <pre>{error.message}</pre>
          </div>
        )}
        onError={(error) => {
          console.error('Application Error:', error);
          // Log to error monitoring service in production
          if (!isDevelopment) {
            import('@sentry/react').then(Sentry => {
              Sentry.captureException(error);
            });
          }
        }}
      >
        <Provider store={store}>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </Provider>
      </ErrorBoundary>
    </StrictMode>
  );

  // Enable hot module replacement in development
  if (isDevelopment && module.hot) {
    module.hot.accept('./App', () => {
      console.log('Hot reloading application...');
      renderApp();
    });
  }
};

// Initialize application
renderApp();

// Export type declarations for development tools
declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: () => any;
  }
  interface NodeModule {
    hot?: {
      accept: (path: string, callback: () => void) => void;
    };
  }
}