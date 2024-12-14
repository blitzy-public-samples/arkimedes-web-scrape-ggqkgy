/**
 * @fileoverview Root application component that establishes the core application structure
 * with provider hierarchy, routing configuration, error boundaries, and performance optimizations.
 * Implements Material Design 3.0 guidelines with comprehensive security and monitoring.
 * @version 1.0.0
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom'; // v6.14.0
import { CssBaseline } from '@mui/material'; // v5.14.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11

// Internal imports
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import LoadingSpinner from './components/common/LoadingSpinner';

// Lazy-loaded route components for code splitting
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Tasks = React.lazy(() => import('./pages/Tasks/TaskList'));
const TaskCreate = React.lazy(() => import('./pages/Tasks/TaskCreate'));
const TaskDetails = React.lazy(() => import('./pages/Tasks/TaskDetails'));
const DataExplorer = React.lazy(() => import('./pages/Data/Explorer'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Login = React.lazy(() => import('./pages/Auth/Login'));
const MFA = React.lazy(() => import('./pages/Auth/MFA'));
const PasswordReset = React.lazy(() => import('./pages/Auth/PasswordReset'));
const NotFound = React.lazy(() => import('./pages/NotFound'));

/**
 * Global loading fallback component for Suspense boundaries
 */
const SuspenseFallback = () => (
  <LoadingSpinner 
    size="large"
    overlay
    message="Loading application..."
  />
);

/**
 * Root application component that orchestrates providers, routing, and error handling
 */
const App: React.FC = () => {
  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <div role="alert">
          <h2>Application Error</h2>
          <pre>{error.message}</pre>
        </div>
      )}
      onError={(error) => {
        // Log to error monitoring service
        console.error('Application Error:', error);
      }}
    >
      <ThemeProvider>
        <AuthProvider>
          <CssBaseline />
          <BrowserRouter>
            <Suspense fallback={<SuspenseFallback />}>
              <Routes>
                {/* Protected Routes */}
                <Route element={<MainLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/tasks/new" element={<TaskCreate />} />
                  <Route path="/tasks/:id" element={<TaskDetails />} />
                  <Route path="/data" element={<DataExplorer />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>

                {/* Authentication Routes */}
                <Route element={<AuthLayout />}>
                  <Route path="/auth/login" element={<Login />} />
                  <Route path="/auth/mfa" element={<MFA />} />
                  <Route path="/auth/reset-password" element={<PasswordReset />} />
                </Route>

                {/* 404 Route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;