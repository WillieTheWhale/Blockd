# Blockd Interviewer Application

AI-Powered Interview Platform - Frontend Application

## Overview

This is the frontend application for the Blockd interview platform, built with React 19, TypeScript, Vite, and modern web technologies.

## Technology Stack

- **React 19.0.0** - UI library
- **TypeScript 5.7.2** - Type safety
- **Vite 6.x** - Build tool and dev server
- **Tailwind CSS 4.x** - Utility-first CSS framework
- **shadcn/ui** - Component library
- **React Router 7.x** - Client-side routing
- **Zustand 5.x** - State management
- **TanStack Query 5.x** - Data fetching and caching
- **Axios** - HTTP client
- **Vitest** - Testing framework

## Project Structure

```
interviewer-app/
├── src/
│   ├── components/        # Reusable components
│   │   ├── ui/           # shadcn/ui components
│   │   └── ProtectedRoute.tsx
│   ├── layouts/          # Layout components
│   │   ├── MainLayout.tsx
│   │   └── AuthLayout.tsx
│   ├── pages/            # Page components
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── SessionsPage.tsx
│   │   ├── SessionDetailPage.tsx
│   │   ├── CreateSessionPage.tsx
│   │   └── SettingsPage.tsx
│   ├── lib/              # Utilities and helpers
│   │   ├── utils.ts
│   │   ├── api-client.ts
│   │   ├── auth.ts
│   │   └── constants.ts
│   ├── stores/           # Zustand stores
│   │   ├── auth-store.ts
│   │   ├── session-store.ts
│   │   └── ui-store.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── tests/            # Test files
│   │   ├── setup.ts
│   │   └── utils.test.ts
│   ├── App.tsx           # Main application component
│   ├── main.tsx          # Application entry point
│   └── index.css         # Global styles
├── public/               # Static assets
├── index.html           # HTML entry point
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite configuration
├── tailwind.config.js   # Tailwind CSS configuration
├── vitest.config.ts     # Vitest configuration
└── README.md           # This file
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Update environment variables in `.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_APP_NAME=Blockd
VITE_APP_ENV=development
```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Building

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types
- `npm test` - Run tests
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Run tests with coverage

## Features

### Authentication
- Login and registration
- JWT token management
- Protected routes
- Automatic token refresh

### Session Management
- Create interview sessions
- View session details
- Track session status
- Manage candidates

### Dashboard
- Overview of all sessions
- Quick stats and metrics
- Recent sessions

### UI Components
- 14+ shadcn/ui components
- Responsive design
- Dark mode support
- Toast notifications

### State Management
- Zustand for global state
- TanStack Query for server state
- Persistent authentication state

## Routing

```
/                       → Redirect to dashboard
/login                  → Login page
/register               → Registration page
/dashboard              → Main dashboard (protected)
/sessions               → Sessions list (protected)
/sessions/:id           → Session detail (protected)
/sessions/create        → Create session (protected)
/settings               → Settings (protected)
```

## API Integration

The application communicates with the backend API using Axios. All API calls are made through the `apiClient` instance which includes:

- Automatic token injection
- Token refresh on expiration
- Error handling
- Request/response interceptors

## Testing

Run tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Code Style

- ESLint for linting
- Prettier for formatting
- TypeScript strict mode enabled

Format code:

```bash
npm run format
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8000` |
| `VITE_WS_URL` | WebSocket URL | `ws://localhost:8000` |
| `VITE_APP_NAME` | Application name | `Blockd` |
| `VITE_APP_ENV` | Environment | `development` |
| `VITE_ENABLE_ANALYTICS` | Enable analytics | `false` |
| `VITE_ENABLE_DEBUG` | Enable debug mode | `true` |

## Contributing

1. Follow the existing code style
2. Write tests for new features
3. Update documentation as needed
4. Ensure all tests pass before committing

## License

Copyright 2024 Blockd. All rights reserved.
