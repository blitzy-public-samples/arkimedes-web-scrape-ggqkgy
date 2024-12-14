import React, { useState, useCallback, useRef, memo } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  Badge,
  Avatar,
  Tooltip,
  CircularProgress,
} from '@mui/material'; // v5.14.0
import {
  Menu as MenuIcon,
  Notifications,
  LightMode,
  DarkMode,
  Settings,
  Error,
} from '@mui/icons-material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import useMediaQuery from '@mui/material'; // v5.14.0

// Internal imports
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import SearchBar from './SearchBar';

// Constants
const NOTIFICATION_POLLING_INTERVAL = 30000;
const SEARCH_DEBOUNCE_DELAY = 300;
const THEME_TRANSITION_DURATION = 200;

// Props interface
interface TopbarProps {
  onMenuClick: () => void;
  onSearch: (query: string) => void;
  className?: string;
  testId?: string;
}

// Styled components
const TopbarContainer = styled(AppBar)(({ theme }) => ({
  position: 'fixed',
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(['margin', 'width'], {
    duration: theme.transitions.duration.standard,
  }),
}));

const SearchContainer = styled('div')(({ theme }) => ({
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  marginLeft: theme.spacing(2),
  marginRight: theme.spacing(2),
  '@media (max-width: 768px)': {
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
  },
}));

const ActionsContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  '@media (max-width: 768px)': {
    gap: theme.spacing(0.5),
  },
}));

/**
 * Topbar component providing navigation, search, theme switching, and user controls
 */
const Topbar = memo<TopbarProps>(({
  onMenuClick,
  onSearch,
  className,
  testId = 'topbar',
}) => {
  // State hooks
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notificationPollRef = useRef<NodeJS.Timeout>();

  // Custom hooks
  const { user, logout, isLoading, error } = useAuth();
  const { theme, setTheme } = useTheme();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Handlers
  const handleUserMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  }, []);

  const handleUserMenuClose = useCallback(() => {
    setUserMenuAnchor(null);
  }, []);

  const handleNotificationsOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchor(event.currentTarget);
  }, []);

  const handleNotificationsClose = useCallback(() => {
    setNotificationsAnchor(null);
  }, []);

  const handleThemeToggle = useCallback(() => {
    setTheme(theme === 'LIGHT' ? 'DARK' : 'LIGHT');
  }, [theme, setTheme]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      handleUserMenuClose();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout, handleUserMenuClose]);

  // Effects
  React.useEffect(() => {
    const pollNotifications = async () => {
      try {
        // Implement notification polling logic here
        // const response = await fetchNotifications();
        // setNotifications(response.data);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    notificationPollRef.current = setInterval(pollNotifications, NOTIFICATION_POLLING_INTERVAL);
    return () => {
      if (notificationPollRef.current) {
        clearInterval(notificationPollRef.current);
      }
    };
  }, []);

  // Render loading state
  if (isLoading) {
    return (
      <TopbarContainer position="fixed" className={className}>
        <Toolbar>
          <CircularProgress size={24} color="inherit" />
        </Toolbar>
      </TopbarContainer>
    );
  }

  // Render error state
  if (error) {
    return (
      <TopbarContainer position="fixed" className={className} color="error">
        <Toolbar>
          <Error />
          <Typography variant="body2" sx={{ ml: 1 }}>
            Authentication Error
          </Typography>
        </Toolbar>
      </TopbarContainer>
    );
  }

  return (
    <TopbarContainer position="fixed" className={className} data-testid={testId}>
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="open drawer"
          onClick={onMenuClick}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{ display: { xs: 'none', sm: 'block' } }}
        >
          Web Scraping Platform
        </Typography>

        <SearchContainer>
          <SearchBar
            value=""
            onChange={onSearch}
            debounceMs={SEARCH_DEBOUNCE_DELAY}
            placeholder="Search tasks..."
            fullWidth
          />
        </SearchContainer>

        <ActionsContainer>
          <Tooltip title={`Switch to ${theme === 'LIGHT' ? 'dark' : 'light'} theme`}>
            <IconButton color="inherit" onClick={handleThemeToggle}>
              {theme === 'LIGHT' ? <DarkMode /> : <LightMode />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Notifications">
            <IconButton
              color="inherit"
              onClick={handleNotificationsOpen}
              aria-label={`${notifications.length} notifications`}
            >
              <Badge badgeContent={notifications.length} color="error">
                <Notifications />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title="Account settings">
            <IconButton
              edge="end"
              color="inherit"
              onClick={handleUserMenuOpen}
              aria-label="user account"
              aria-controls="user-menu"
              aria-haspopup="true"
            >
              <Avatar
                alt={user?.username || 'User'}
                src={user?.avatar}
                sx={{ width: 32, height: 32 }}
              />
            </IconButton>
          </Tooltip>
        </ActionsContainer>

        {/* User Menu */}
        <Menu
          id="user-menu"
          anchorEl={userMenuAnchor}
          open={Boolean(userMenuAnchor)}
          onClose={handleUserMenuClose}
          keepMounted
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={handleUserMenuClose}>Profile</MenuItem>
          <MenuItem onClick={handleUserMenuClose}>Settings</MenuItem>
          <MenuItem onClick={handleLogout}>Logout</MenuItem>
        </Menu>

        {/* Notifications Menu */}
        <Menu
          id="notifications-menu"
          anchorEl={notificationsAnchor}
          open={Boolean(notificationsAnchor)}
          onClose={handleNotificationsClose}
          keepMounted
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          {notifications.length === 0 ? (
            <MenuItem disabled>No new notifications</MenuItem>
          ) : (
            notifications.map((notification) => (
              <MenuItem key={notification.id} onClick={handleNotificationsClose}>
                {notification.message}
              </MenuItem>
            ))
          )}
        </Menu>
      </Toolbar>
    </TopbarContainer>
  );
});

Topbar.displayName = 'Topbar';

export default Topbar;