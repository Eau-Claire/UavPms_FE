# SEPPMS Angular Frontend

Angular 21 frontend for SEPPMS (UAV Powerline Management System), deployed at https://uav-pms-fe-mw3s.vercel.app/.

This app is the written with Angular, it uses standalone Angular components, zoneless change detection, signal-based local state, lazy routes, ng-zorro UI primitives, Tailwind CSS v4, and SCSS feature styles.

## Features

- Authentication: login, OTP verification, forgot/reset password, password change, token refresh.
- Monitor dashboard: summary metrics, defect statistics, mission status, active alerts, recent defects, and inspection history.
- Notifications: bell popover, unread count, filters, sort, mark-as-read, delete, detail view, polling refresh.
- User and asset management pages.
- Responsive EVN-themed layout using Angular standalone components.

## Requirements

- Node.js compatible with Angular 21.
- npm 11.x recommended. This repo declares `packageManager: npm@11.17.0`.

## Commands

```bash
npm install
npm start
npm run build
npm test -- --watch=false
npm run lint
```

`npm start` serves on port `5173`.

## Project Layout

```text
src/app/core
  auth/        Authentication service, interceptor, session state
  layout/      App shell, header, sidebar

src/app/features
  auth/        Login, OTP, password flows
  monitor/     Dashboard and inspection history
  notifications/data-access
  users/       User management
  assets/      Asset management

src/app/models
  Shared API, auth, monitor, notification models

src/environments
  Runtime API URL and polling intervals
```

## Testing

Unit tests use Angular's unit-test builder with Vitest.

```bash
npm test -- --watch=false
```

Current API tests cover auth, monitor API, notification API, and auth interceptor behavior.

## Backend Connectivity

- Primary API / SignalR Hub: `https://uavpms.ddns.net`
- Automatic Fallback (on network/gateway errors `0`, `502`, `503`, `504`): `https://uavpms.duckdns.org`

## Build And Deploy

Production build:

```bash
npm run build
```

Build output is written to `dist/uav-pms-frontend/browser`.

### CI/CD (GitHub Actions -> Vercel)

- Workflow: `.github/workflows/deploy-vercel.yml`
- On Pull Requests (`main`): runs `npm ci`, unit tests (`ng test --watch=false`), and production build verification (`npm run build`).
- On Push / Merge (`main`): runs tests, builds artifacts via `vercel build --prod`, and deploys automatically to Vercel using repository secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).
