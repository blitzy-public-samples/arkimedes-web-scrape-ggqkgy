// External imports with version specifications
import React, { useMemo } from 'react'; // v18.2.0
import { Breadcrumbs as MuiBreadcrumbs } from '@mui/material'; // v5.14.0
import { Link } from '@mui/material'; // v5.14.0
import { Typography } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import { NavigateNext } from '@mui/icons-material'; // v5.14.0
import { useLocation } from 'react-router-dom'; // v6.14.0

// Internal imports
import { routes } from '../../config/routes';

// Interfaces
interface BreadcrumbItem {
  label: string;
  path: string;
  active: boolean;
  requiredRole?: string[];
  visible: boolean;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
  maxItems?: number;
  userRole?: string;
  customSeparator?: React.ReactNode;
}

// Styled components with enhanced accessibility and visual feedback
const BreadcrumbLink = styled(Link)(({ theme }) => ({
  color: theme.palette.text.secondary,
  textDecoration: 'none',
  transition: 'all 0.2s ease-in-out',
  padding: '4px 8px',
  borderRadius: '4px',
  '&:hover': {
    textDecoration: 'underline',
    color: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
  },
  '&:focus': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px',
  },
  '&.active': {
    color: theme.palette.text.primary,
    pointerEvents: 'none',
    fontWeight: theme.typography.fontWeightMedium,
  },
  '@media (max-width: 600px)': {
    padding: '2px 4px',
  },
}));

// Helper function to generate breadcrumb items with role-based filtering
const generateBreadcrumbs = (pathname: string, userRole?: string): BreadcrumbItem[] => {
  const pathSegments = pathname.split('/').filter(Boolean);
  
  return useMemo(() => {
    let currentPath = '';
    const breadcrumbs: BreadcrumbItem[] = [
      {
        label: 'Home',
        path: '/',
        active: pathname === '/',
        visible: true,
      },
    ];

    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const matchedRoute = routes.find(route => {
        const routePathSegments = route.path.split('/').filter(Boolean);
        return routePathSegments[index] === segment || routePathSegments[index]?.startsWith(':');
      });

      if (matchedRoute) {
        // Handle dynamic route parameters
        let label = segment;
        if (matchedRoute.path.includes(':')) {
          label = segment.charAt(0).toUpperCase() + segment.slice(1);
        } else {
          label = matchedRoute.path.split('/').pop() || segment;
          label = label.charAt(0).toUpperCase() + label.slice(1);
        }

        const isVisible = !matchedRoute.roles || !userRole || matchedRoute.roles.includes(userRole);

        breadcrumbs.push({
          label,
          path: currentPath,
          active: currentPath === pathname,
          requiredRole: matchedRoute.roles,
          visible: isVisible,
        });
      }
    });

    return breadcrumbs.filter(item => item.visible);
  }, [pathname, userRole]);
};

// Main component with enhanced accessibility and keyboard navigation
export const CustomBreadcrumbs: React.FC<BreadcrumbsProps> = ({
  className,
  maxItems = 8,
  userRole,
  customSeparator,
}) => {
  const location = useLocation();
  const breadcrumbItems = generateBreadcrumbs(location.pathname, userRole);

  // Enhanced keyboard navigation handler
  const handleKeyNavigation = (
    event: React.KeyboardEvent,
    index: number,
    items: HTMLAnchorElement[]
  ) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        if (index < items.length - 1) {
          items[index + 1]?.focus();
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (index > 0) {
          items[index - 1]?.focus();
        }
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
    }
  };

  return (
    <MuiBreadcrumbs
      className={className}
      maxItems={maxItems}
      aria-label="Page navigation breadcrumb"
      separator={customSeparator || <NavigateNext fontSize="small" />}
      sx={{
        my: 1,
        px: 2,
        '& .MuiBreadcrumbs-separator': {
          mx: 1,
          color: 'text.secondary',
        },
      }}
    >
      {breadcrumbItems.map((item, index) => {
        const isLast = index === breadcrumbItems.length - 1;

        return isLast ? (
          <Typography
            key={item.path}
            variant="body2"
            color="text.primary"
            aria-current="page"
            sx={{ fontWeight: 'medium' }}
          >
            {item.label}
          </Typography>
        ) : (
          <BreadcrumbLink
            key={item.path}
            href={item.path}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              // Handle navigation through your routing system
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLAnchorElement>) => {
              const items = Array.from(
                document.querySelectorAll('.MuiBreadcrumbs-li a')
              ) as HTMLAnchorElement[];
              handleKeyNavigation(e, index, items);
            }}
            className={item.active ? 'active' : ''}
            tabIndex={0}
          >
            {item.label}
          </BreadcrumbLink>
        );
      })}
    </MuiBreadcrumbs>
  );
};

export default React.memo(CustomBreadcrumbs);