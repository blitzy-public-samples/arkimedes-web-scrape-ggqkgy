/**
 * @fileoverview Main settings page component providing centralized system configuration
 * with role-based access control, enhanced security, and accessibility features.
 * @version 1.0.0
 */

import React, { useState, useCallback, Suspense } from 'react';
import {
  Box,
  Container,
  Tab,
  Tabs,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

// Internal imports
import DashboardLayout from '../layouts/DashboardLayout';
import ErrorBoundary from '../components/common/ErrorBoundary';
import useAuth from '../hooks/useAuth';
import { UserRole } from '../types/auth';

// Lazy loaded settings components for code splitting
const SystemSettings = React.lazy(() => import('../components/settings/SystemSettings'));
const ProxySettings = React.lazy(() => import('../components/settings/ProxySettings'));
const SecuritySettings = React.lazy(() => import('../components/settings/SecuritySettings'));
const StorageSettings = React.lazy(() => import('../components/settings/StorageSettings'));
const NotificationSettings = React.lazy(() => import('../components/settings/NotificationSettings'));
const UserSettings = React.lazy(() => import('../components/settings/UserSettings'));

/**
 * Interface for settings tab configuration with role-based access
 */
interface SettingsTabConfig {
  id: string;
  label: string;
  component: React.ReactNode;
  requiredRole: UserRole;
  analyticsId: string;
}

/**
 * Configuration for settings tabs with role-based access control
 */
const SETTINGS_TABS: SettingsTabConfig[] = [
  {
    id: 'system',
    label: 'System Performance',
    component: <SystemSettings />,
    requiredRole: UserRole.ADMIN,
    analyticsId: 'settings_system'
  },
  {
    id: 'proxy',
    label: 'Proxy Configuration',
    component: <ProxySettings />,
    requiredRole: UserRole.ADMIN,
    analyticsId: 'settings_proxy'
  },
  {
    id: 'security',
    label: 'Security & Access',
    component: <SecuritySettings />,
    requiredRole: UserRole.ADMIN,
    analyticsId: 'settings_security'
  },
  {
    id: 'storage',
    label: 'Storage Management',
    component: <StorageSettings />,
    requiredRole: UserRole.ADMIN,
    analyticsId: 'settings_storage'
  },
  {
    id: 'notifications',
    label: 'Notifications',
    component: <NotificationSettings />,
    requiredRole: UserRole.OPERATOR,
    analyticsId: 'settings_notifications'
  },
  {
    id: 'user',
    label: 'User Profile',
    component: <UserSettings />,
    requiredRole: UserRole.OPERATOR,
    analyticsId: 'settings_user'
  }
];

/**
 * Main settings page component with role-based access control and error handling
 */
const Settings: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  
  // Get active tab from URL or default to first accessible tab
  const [activeTab, setActiveTab] = useState<number>(() => {
    const tabId = new URLSearchParams(location.search).get('tab');
    const tabIndex = SETTINGS_TABS.findIndex(tab => tab.id === tabId);
    return tabIndex >= 0 ? tabIndex : 0;
  });

  /**
   * Handle tab change with role validation and analytics
   */
  const handleTabChange = useCallback((event: React.SyntheticEvent, newValue: number) => {
    const selectedTab = SETTINGS_TABS[newValue];
    
    // Validate user role access
    if (!user || user.role < selectedTab.requiredRole) {
      return;
    }

    // Update URL with selected tab
    navigate(`/settings?tab=${selectedTab.id}`, { replace: true });
    setActiveTab(newValue);

    // Track tab change in analytics
    if (process.env.NODE_ENV === 'production') {
      window.gtag?.('event', 'settings_tab_change', {
        tab_id: selectedTab.id,
        analytics_id: selectedTab.analyticsId
      });
    }
  }, [navigate, user]);

  // Filter tabs based on user role
  const accessibleTabs = SETTINGS_TABS.filter(tab => 
    user && user.role >= tab.requiredRole
  );

  if (!isAuthenticated) {
    return (
      <Container maxWidth="sm">
        <Alert severity="error">
          Please log in to access settings
        </Alert>
      </Container>
    );
  }

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs
                value={activeTab}
                onChange={handleTabChange}
                aria-label="Settings navigation tabs"
                variant="scrollable"
                scrollButtons="auto"
              >
                {accessibleTabs.map((tab) => (
                  <Tab
                    key={tab.id}
                    label={tab.label}
                    id={`settings-tab-${tab.id}`}
                    aria-controls={`settings-tabpanel-${tab.id}`}
                  />
                ))}
              </Tabs>
            </Box>

            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" p={4}>
                  <CircularProgress />
                </Box>
              }
            >
              {accessibleTabs.map((tab, index) => (
                <Box
                  key={tab.id}
                  role="tabpanel"
                  hidden={activeTab !== index}
                  id={`settings-tabpanel-${tab.id}`}
                  aria-labelledby={`settings-tab-${tab.id}`}
                >
                  {activeTab === index && (
                    <Box sx={{ py: 2 }}>
                      <ErrorBoundary>
                        {tab.component}
                      </ErrorBoundary>
                    </Box>
                  )}
                </Box>
              ))}
            </Suspense>
          </Paper>
        </Container>
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default Settings;