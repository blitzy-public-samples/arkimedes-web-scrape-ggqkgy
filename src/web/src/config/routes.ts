// @ts-nocheck
// External imports - versions locked for production stability
import { lazy } from 'react'; // v18.2.0
import type { RouteObject } from 'react-router-dom'; // v6.4.0

/**
 * Extended route configuration interface with authentication and layout options
 * @interface RouteConfig
 * @extends RouteObject
 */
export interface RouteConfig extends RouteObject {
  path: string;
  component: React.LazyExoticComponent<any>;
  protected?: boolean;
  exact?: boolean;
  layout?: string;
  roles?: string[];
}

/**
 * Public routes that bypass authentication checks
 * @constant
 */
export const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verify-email'
] as const;

/**
 * Default redirect paths for different scenarios
 * @constant
 */
const DEFAULT_REDIRECT = '/dashboard';
const AUTH_REDIRECT = '/login';

/**
 * Role-based redirect mapping for post-authentication navigation
 * @constant
 */
const ROLE_REDIRECTS: Record<string, string> = {
  admin: '/dashboard',
  operator: '/tasks',
  analyst: '/data'
} as const;

/**
 * Main application routes configuration
 * Implements lazy loading for optimized code splitting
 * @constant
 */
const routes: RouteConfig[] = [
  {
    path: '/',
    component: lazy(() => import('../pages/Dashboard')),
    protected: true,
    exact: true,
    layout: 'MainLayout',
    roles: ['admin', 'operator', 'analyst']
  },
  {
    path: '/login',
    component: lazy(() => import('../pages/Auth/Login')),
    protected: false,
    exact: true,
    layout: 'AuthLayout',
    roles: []
  },
  {
    path: '/forgot-password',
    component: lazy(() => import('../pages/Auth/ForgotPassword')),
    protected: false,
    exact: true,
    layout: 'AuthLayout',
    roles: []
  },
  {
    path: '/tasks',
    component: lazy(() => import('../pages/Tasks/TaskList')),
    protected: true,
    exact: true,
    layout: 'MainLayout',
    roles: ['admin', 'operator']
  },
  {
    path: '/tasks/new',
    component: lazy(() => import('../pages/Tasks/TaskCreate')),
    protected: true,
    exact: true,
    layout: 'MainLayout',
    roles: ['admin', 'operator']
  },
  {
    path: '/tasks/:id',
    component: lazy(() => import('../pages/Tasks/TaskDetails')),
    protected: true,
    exact: true,
    layout: 'MainLayout',
    roles: ['admin', 'operator', 'analyst']
  },
  {
    path: '/data',
    component: lazy(() => import('../pages/Data/Explorer')),
    protected: true,
    exact: true,
    layout: 'MainLayout',
    roles: ['admin', 'operator', 'analyst']
  },
  {
    path: '/settings',
    component: lazy(() => import('../pages/Settings')),
    protected: true,
    exact: true,
    layout: 'MainLayout',
    roles: ['admin']
  },
  {
    path: '*',
    component: lazy(() => import('../pages/NotFound')),
    protected: true,
    exact: false,
    layout: 'MainLayout',
    roles: []
  }
];

/**
 * Helper function to check if a route is public
 * @param {string} path - Route path to check
 * @returns {boolean} - True if route is public
 */
export const isPublicRoute = (path: string): boolean => {
  return PUBLIC_ROUTES.includes(path);
};

/**
 * Helper function to get redirect path based on user role
 * @param {string} role - User role
 * @returns {string} - Redirect path
 */
export const getRoleRedirect = (role: string): string => {
  return ROLE_REDIRECTS[role] || DEFAULT_REDIRECT;
};

/**
 * Helper function to get authentication redirect
 * @returns {string} - Authentication redirect path
 */
export const getAuthRedirect = (): string => {
  return AUTH_REDIRECT;
};

export default routes;