/**
 * @fileoverview Enhanced Material UI sidebar navigation component with role-based access control,
 * responsive behavior, and accessibility features for the web scraping platform.
 * @version 1.0.0
 */

import React, { memo, useCallback, useState } from 'react'; // v18.2.0
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  IconButton, 
  useTheme, 
  Collapse,
  Tooltip,
  Typography
} from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import {
  Dashboard as DashboardIcon,
  Task as TaskIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ExpandLess,
  ExpandMore
} from '@mui/icons-material'; // v5.14.0
import { useLocation, useNavigate } from 'react-router-dom'; // v6.14.0

import { useMediaQuery } from '../../hooks/useMediaQuery';
import { routes } from '../../config/routes';
import { useAuth } from '../../hooks/useAuth';

// Styled components with enhanced accessibility and animations
const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  justifyContent: 'flex-end',
  minHeight: 64,
  borderBottom: `1px solid ${theme.palette.divider}`,
  transition: theme.transitions.create(['margin', 'width'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));

const StyledDrawer = styled(Drawer, {
  shouldForwardProp: (prop) => prop !== 'open' && prop !== 'width',
})<{ open: boolean; width: number }>(({ theme, open, width }) => ({
  width: open ? width : theme.spacing(7),
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  '& .MuiDrawer-paper': {
    width: open ? width : theme.spacing(7),
    overflowX: 'hidden',
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },
}));

const StyledListItem = styled(ListItem)(({ theme }) => ({
  marginBottom: theme.spacing(0.5),
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '&.active': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '& .MuiListItemIcon-root': {
      color: theme.palette.primary.contrastText,
    },
  },
}));

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  width: number;
  variant?: 'permanent' | 'temporary' | 'persistent';
  elevation?: number;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  protected?: boolean;
  requiredRoles?: string[];
  children?: NavItem[];
}

const navigationItems: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon />,
    protected: true,
    requiredRoles: ['admin', 'operator', 'analyst']
  },
  {
    path: '/tasks',
    label: 'Tasks',
    icon: <TaskIcon />,
    protected: true,
    requiredRoles: ['admin', 'operator'],
    children: [
      {
        path: '/tasks/new',
        label: 'Create Task',
        icon: <TaskIcon />,
        protected: true,
        requiredRoles: ['admin', 'operator']
      }
    ]
  },
  {
    path: '/data',
    label: 'Data Explorer',
    icon: <StorageIcon />,
    protected: true,
    requiredRoles: ['admin', 'operator', 'analyst']
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: <SettingsIcon />,
    protected: true,
    requiredRoles: ['admin']
  }
];

const Sidebar: React.FC<SidebarProps> = memo(({
  open,
  onClose,
  width = 240,
  variant = 'permanent',
  elevation = 1
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { matches: isMobile } = useMediaQuery('(max-width: 768px)');
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Handle navigation with role checking and analytics
  const handleNavigation = useCallback((path: string, item: NavItem) => {
    if (!user || (item.requiredRoles && !item.requiredRoles.includes(user.role))) {
      return;
    }

    if (item.children) {
      setExpandedItems(prev => 
        prev.includes(path) 
          ? prev.filter(p => p !== path)
          : [...prev, path]
      );
      return;
    }

    navigate(path);
    if (isMobile) {
      onClose();
    }
  }, [user, navigate, isMobile, onClose]);

  // Filter navigation items based on user role
  const filteredItems = navigationItems.filter(item => 
    !item.requiredRoles || (user && item.requiredRoles.includes(user.role))
  );

  const renderNavItem = (item: NavItem, depth = 0) => {
    const isExpanded = expandedItems.includes(item.path);
    const isActive = location.pathname === item.path;
    const hasChildren = item.children && item.children.length > 0;

    return (
      <React.Fragment key={item.path}>
        <Tooltip title={open ? '' : item.label} placement="right">
          <StyledListItem
            button
            onClick={() => handleNavigation(item.path, item)}
            className={isActive ? 'active' : ''}
            sx={{ pl: theme.spacing(depth + 2) }}
            aria-label={item.label}
            role="menuitem"
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText 
              primary={
                <Typography noWrap>
                  {item.label}
                </Typography>
              }
            />
            {hasChildren && (isExpanded ? <ExpandLess /> : <ExpandMore />)}
          </StyledListItem>
        </Tooltip>
        
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.children.map(child => renderNavItem(child, depth + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  return (
    <StyledDrawer
      variant={variant}
      open={open}
      width={width}
      elevation={elevation}
      onClose={onClose}
      aria-label="navigation sidebar"
      role="navigation"
    >
      <DrawerHeader>
        <IconButton onClick={onClose} aria-label={open ? 'close drawer' : 'open drawer'}>
          {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </DrawerHeader>
      
      <List
        component="nav"
        aria-label="main navigation"
        sx={{ 
          width: '100%',
          p: theme.spacing(1),
        }}
      >
        {filteredItems.map(item => renderNavItem(item))}
      </List>
    </StyledDrawer>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;