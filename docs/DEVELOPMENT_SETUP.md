# Development Setup Guide

## Prerequisites
- Node.js 18+ 
- npm or yarn

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd Frontend
```

2. Install dependencies
```bash
npm install
```

3. Setup environment variables
```bash
# Copy the example file
cp .env.example .env.development
cp .env.example .env.production

# Edit files with your local configuration
```

### .env.development (Local Development)
```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_SIGNALR_HUB_URL=http://localhost:3000/hubs
VITE_APP_NAME=UAV-PMS
VITE_USE_MOCK=true  # Use mock data for development
```

### .env.production (Production Build)
```env
VITE_API_BASE_URL=https://api.uavpms.evn.vn/api
VITE_SIGNALR_HUB_URL=https://api.uavpms.evn.vn/hubs
VITE_APP_NAME=UAV-PMS
```

## Available Scripts

### Development Server
```bash
npm run dev
# Starts Vite dev server at http://localhost:5173/
```

### Production Build
```bash
npm run build
# Creates optimized build in dist/ directory
```

### Preview Build
```bash
npm run preview
# Preview production build locally
```

### Linting
```bash
npm run lint
# Run ESLint to check code quality
```

### Testing
```bash
npm run test
# Run Vitest unit tests
```

## Project Structure

```
src/
├── components/          # Reusable React components
│   ├── common/         # Common components (dialogs, etc)
│   ├── layout/         # Layout components
│   └── users/          # User-related components
├── features/           # Redux slices
├── hooks/              # Custom React hooks
├── pages/              # Page components
├── services/           # API services
├── store/              # Redux store configuration
├── types/              # TypeScript types
├── utils/              # Utility functions
├── locales/            # i18n translations
├── constants/          # App constants
├── mocks/              # Mock data for testing
└── styles/             # Global styles
```

## Important Notes

⚠️ **Never commit the following files:**
- `.env.development` - Local development config
- `.env.production` - Production config
- `node_modules/` - Dependencies
- `dist/` - Build output

These files are added to `.gitignore` and should be created locally on each developer machine.

✅ **These should be committed:**
- `.env.example` - Template for environment variables
- `package.json` and `package-lock.json` - Dependency management
- Source code and configuration files

## Troubleshooting

### Build Fails with "tsc not found"
```bash
# Reinstall dependencies
npm install
```

### Port 5173 already in use
```bash
npm run dev -- --port 3000
# Change to different port
```

### Mock API not responding
- Check VITE_USE_MOCK=true in .env.development
- Ensure mock interceptors are properly configured in `src/mocks/setupMockInterceptors.ts`

## Git Workflow

1. Create a new branch for features
```bash
git checkout -b feature/feature-name
```

2. Make your changes and commit
```bash
git add .
git commit -m "feat: Description of changes"
```

3. Push to remote
```bash
git push origin feature/feature-name
```

4. Create a Pull Request

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| VITE_API_BASE_URL | Backend API endpoint | http://localhost:3000/api |
| VITE_SIGNALR_HUB_URL | SignalR WebSocket hub | http://localhost:3000/hubs |
| VITE_APP_NAME | Application display name | UAV-PMS |
| VITE_USE_MOCK | Enable mock API responses | true/false |
