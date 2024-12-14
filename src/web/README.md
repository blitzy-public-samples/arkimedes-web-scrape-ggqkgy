# Web Scraping Platform - Frontend Application

Enterprise-grade web interface for managing and monitoring web scraping operations at scale.

## Overview

The Web Scraping Platform frontend is a robust, production-ready application built with modern web technologies:

- React 18.2+ with TypeScript 5.0+
- Material-UI 5.14+ component library
- Redux Toolkit for state management
- React Query for server state handling

### Key Features

- Real-time task monitoring and management
- Interactive data visualization dashboard
- Role-based access control (RBAC)
- Responsive design with mobile-first approach
- Enterprise-grade security measures
- Comprehensive accessibility support

## Prerequisites

- Node.js >= 18.0.0 LTS
- pnpm >= 8.0.0
- Docker Desktop >= 24.0.0
- Git >= 2.40.0
- VSCode (recommended)
- Minimum 8GB RAM for development

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd src/web
```

2. Install dependencies:
```bash
pnpm install
```

3. Start development server:
```bash
pnpm dev
```

## Development Setup

### Environment Configuration

1. Copy environment template:
```bash
cp .env.example .env
```

2. Configure environment variables:
- `VITE_API_URL`: Backend API endpoint
- `VITE_AUTH_DOMAIN`: Authentication provider domain
- `VITE_AUTH_CLIENT_ID`: OAuth client ID

### Docker Development Environment

1. Build and start containers:
```bash
docker-compose up -d
```

2. Access development server:
```
http://localhost:3000
```

## Project Structure

```
src/
├── assets/          # Static assets and images
├── components/      # Reusable UI components
├── features/        # Feature-based modules
├── hooks/          # Custom React hooks
├── layouts/        # Page layouts and templates
├── pages/          # Route components
├── services/       # API and external services
├── store/          # Redux store configuration
├── styles/         # Global styles and themes
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Create production build
- `pnpm test` - Run test suite
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm storybook` - Start Storybook
- `pnpm analyze` - Analyze bundle size

## Browser Support

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90
- iOS Safari >= 14
- Android Chrome >= 90

## Performance Requirements

- First Contentful Paint < 1.5s
- Time to Interactive < 3.0s
- Lighthouse Performance Score > 90
- Initial bundle size < 500KB
- Memory usage < 100MB
- CPU usage < 30%

## Development Guidelines

### Code Style

- TypeScript strict mode enabled
- ESLint configuration with recommended rules
- Prettier for consistent formatting
- Component patterns following React best practices
- Comprehensive documentation requirements

### Testing Requirements

- Jest for unit testing
- React Testing Library for component testing
- Cypress for end-to-end testing
- Minimum 80% code coverage
- Performance testing with Lighthouse
- Accessibility testing with axe-core

### State Management

- Redux Toolkit for global state
- React Query for server state
- Local state with React hooks
- Persistence with Redux Persist
- Error boundary implementation
- Type-safe action creators

## Deployment

### Production Build

1. Create optimized build:
```bash
pnpm build
```

2. Test production build locally:
```bash
pnpm preview
```

### Docker Deployment

1. Build production image:
```bash
docker build -t web-scraping-platform-ui:latest .
```

2. Run container:
```bash
docker run -p 80:80 web-scraping-platform-ui:latest
```

## Accessibility

- WCAG 2.1 Level AA compliance
- Full keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management
- ARIA labels and roles

## Security Measures

- OAuth 2.0 + OIDC authentication
- Role-based access control
- XSS protection
- CSRF prevention
- Content Security Policy
- Secure HTTP headers

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## License

[License details here]

## Support

[Support contact information]