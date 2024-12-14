// External imports with version specifications
import React from 'react'; // v18.2.0
import { Box, Typography, Stack } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0

// Internal imports
import CustomBreadcrumbs from './Breadcrumbs';

/**
 * Interface for PageHeader component props
 */
interface PageHeaderProps {
  /** Main title of the page */
  title: string;
  /** Optional subtitle for additional context */
  subtitle?: string;
  /** Optional action buttons or controls */
  actions?: React.ReactNode;
  /** Toggle breadcrumb visibility */
  showBreadcrumbs?: boolean;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Styled container for the page header with proper semantic markup and accessibility attributes
 */
const HeaderContainer = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(3),
  padding: theme.spacing(2, 0),
  width: '100%',
  role: 'banner',
  'aria-label': 'page header',
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[1],
}));

/**
 * Styled container for header content with responsive layout
 */
const HeaderContent = styled(Stack)(({ theme }) => ({
  direction: {
    xs: 'column',
    sm: 'row',
  },
  justifyContent: 'space-between',
  alignItems: {
    xs: 'flex-start',
    sm: 'center',
  },
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
  width: '100%',
  [theme.breakpoints.down('sm')]: {
    '& > *': {
      width: '100%',
    },
  },
}));

/**
 * PageHeader component provides consistent page headers with optional breadcrumbs and actions
 * @component
 * @param {PageHeaderProps} props - Component props
 * @returns {JSX.Element} Rendered page header
 */
const PageHeader: React.FC<PageHeaderProps> = React.memo(({
  title,
  subtitle,
  actions,
  showBreadcrumbs = true,
  className,
}) => {
  // Validate required props
  if (!title) {
    throw new Error('PageHeader: title prop is required');
  }

  return (
    <HeaderContainer className={className}>
      {/* Breadcrumb navigation */}
      {showBreadcrumbs && (
        <CustomBreadcrumbs
          maxItems={4}
          aria-label="Page navigation"
        />
      )}

      {/* Header content container */}
      <HeaderContent>
        {/* Title and subtitle section */}
        <Box>
          <Typography
            variant="h4"
            component="h1"
            color="text.primary"
            gutterBottom
            sx={{
              fontWeight: 'bold',
              fontSize: {
                xs: '1.5rem',
                sm: '2rem',
              },
            }}
          >
            {title}
          </Typography>
          
          {subtitle && (
            <Typography
              variant="subtitle1"
              color="text.secondary"
              sx={{
                maxWidth: '800px',
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        {/* Action buttons container */}
        {actions && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: {
                xs: 'flex-start',
                sm: 'flex-end',
              },
            }}
          >
            {actions}
          </Box>
        )}
      </HeaderContent>
    </HeaderContainer>
  );
});

// Display name for debugging
PageHeader.displayName = 'PageHeader';

// Default export
export default PageHeader;

// Named exports for specific use cases
export type { PageHeaderProps };