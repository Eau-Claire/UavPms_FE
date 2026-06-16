# 🏗️ UAV-PMS Frontend - Architecture & Integration Guide

**Version**: 1.0  
**For**: Backend Development Team  
**Date**: 2026-06-11

---

## 📊 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                       │
│  - React 18 + TypeScript                                        │
│  - Redux Toolkit (State Management)                             │
│  - React Router (Routing)                                       │
│  - Ant Design (UI Components)                                   │
│  - i18n (Multi-language support - EN, VI)                       │
└────────────────────┬────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    [Interceptors]   │    [Mock]
    - Add Auth      │    - For dev/testing
    - Refresh Token │    - Can be disabled
    - Error Handler │
         │           │           │
         └───────────┼───────────┘
                     │
              [Axios Client]
           - JWT Bearer Auth
           - Automatic token refresh
           - Error handling
                     │
         ┌───────────┴───────────┐
         │                       │
    BASE_URL                 MOCK MODE
 http://localhost:3000/api   (VITE_USE_MOCK=true)
         │
         ↓
    ┌─────────────────────────────┐
    │   Backend API Endpoints     │
    │  (Node/Express/NestJS/...)  │
    │                             │
    │  • /auth/login              │
    │  • /auth/logout             │
    │  • /auth/refresh            │
    │  • /auth/change-password    │
    │  • /users (CRUD)            │
    │  • /users/:id/reset-password│
    └─────────────────────────────┘
         │
         ↓
    ┌─────────────────────────────┐
    │     Database                │
    │  (PostgreSQL/MySQL/MongoDB) │
    │                             │
    │  • Users table              │
    │  • Sessions/Tokens table    │
    │  • Audit logs table         │
    └─────────────────────────────┘
```

---

## 🔄 Authentication Flow

### Initial Login Flow

```
┌──────────────────┐
│  User enters     │
│  credentials     │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────┐
│ POST /auth/login                 │
│ { username, password }           │
└────────┬─────────────────────────┘
         │
    Backend validates
    credentials
         │
         ├─→ Invalid → 401 Error
         │   (Clear password field)
         │
         ├─→ Account Locked → 423 Error
         │   (Disable retry)
         │
         └─→ Valid → 200 OK
              {user, tokens}
              │
              ↓
         Frontend stores:
         - localStorage.accessToken
         - localStorage.refreshToken
         - localStorage.user
         - Redux auth state
              │
              ↓
         Check mustChangePassword?
         ├─→ true → Redirect /change-password
         └─→ false → Redirect /dashboard
```

### Authenticated Request Flow

```
┌──────────────────────────────────┐
│ Regular request (e.g., GET /users)
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Request Interceptor              │
│ Add: Authorization: Bearer {token}
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Send to Backend                  │
└────────┬─────────────────────────┘
         │
    Backend validates token
         │
         ├─→ Valid → Process request
         │   │
         │   ↓
         │   200/201/etc with data
         │
         └─→ Invalid/Expired → 401 Error
              │
              ↓
         Response Interceptor catches 401
              │
              ├─→ Is login endpoint?
              │   YES → Return 401 error
              │   NO → Continue refresh flow
              │
              ↓
         POST /auth/refresh
         { refreshToken }
              │
         Backend validates refreshToken
              │
         ├─→ Invalid → Return 401
         │   Frontend redirects to /login
         │   (Session cleared)
         │
         └─→ Valid → Return new tokens
              {accessToken, refreshToken}
              │
              ↓
         Frontend updates:
         - localStorage tokens
         - Redux state
         - Retry original request
              │
              ↓
         Original request succeeds
         (or fails with business logic error)
```

### Logout Flow

```
┌──────────────────┐
│ User clicks      │
│ "Đăng xuất"      │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────┐
│ POST /auth/logout                │
│ Authorization: Bearer {token}    │
└────────┬─────────────────────────┘
         │
    Backend processes logout
    (Invalidate tokens if needed)
         │
         ↓
┌──────────────────────────────────┐
│ Response: 200 OK (or error)      │
└────────┬─────────────────────────┘
         │
    Frontend always:
    - Clear localStorage
    - Clear Redux state
    - Redirect to /login
    (Even if API fails)
```

---

## 📱 Frontend Project Structure

```
src/
├── components/              # Reusable React components
│   ├── common/             # Cross-app components (Header, Sidebar, etc.)
│   ├── layout/             # Page layout components
│   ├── ui/                 # UI building blocks
│   └── users/              # User-specific components
│
├── pages/                  # Page components
│   ├── LoginPage.tsx       # Login UI
│   ├── ChangePasswordPage.tsx
│   ├── UserManagementPage.tsx  # Admin user CRUD
│   └── __tests__/          # Page tests
│
├── features/               # Redux feature slices
│   ├── auth/
│   │   ├── authSlice.ts    # Redux reducer + thunks (login, logout)
│   │   └── components/     # Auth-related components
│   └── users/
│       ├── usersSlice.ts   # Redux reducer + thunks (CRUD)
│       └── components/     # User management components
│
├── hooks/                  # Custom React hooks
│   ├── useAuth.ts          # useAuth() hook for login/logout/user
│   ├── useUsers.ts         # useUsers() hook for user management
│   ├── usePermission.ts    # Role-based access check
│   └── useIsMobile.ts      # Responsive design
│
├── services/               # API calls
│   └── api/
│       ├── axiosClient.ts  # Axios instance with interceptors
│       └── userService.ts  # User API methods
│
├── store/                  # Redux store
│   └── store.ts            # Store configuration
│
├── types/                  # TypeScript interfaces
│   └── index.ts            # All types/interfaces defined
│
├── constants/              # App constants
│   ├── roles.ts            # Role labels, colors
│   ├── routes.ts           # Route definitions
│   └── status.ts           # Status constants
│
├── utils/                  # Utility functions
│   ├── storage.ts          # localStorage wrapper
│   ├── formatters.ts       # Format utilities
│   └── userGenerator.ts    # Generate username/password
│
├── styles/                 # Design tokens (colors, spacing)
│   └── tokens.ts
│
├── locales/                # i18n translations
│   ├── en.json
│   ├── vi.json
│   └── i18n.ts
│
├── mocks/                  # Mock data & interceptors
│   ├── mockData.ts
│   ├── mockUserStore.ts    # In-memory user store
│   ├── setupMockInterceptors.ts
│   └── testCases.ts
│
├── App.tsx                 # Root component
├── main.tsx                # Entry point
└── router/
    └── index.tsx           # Route definitions
```

---

## 🔑 Key Redux Slices (State Management)

### Auth Slice
```typescript
// src/features/auth/authSlice.ts
state: {
  user: User | null,           // Current logged-in user
  isAuthenticated: boolean,    // Is user logged in?
  isLoading: boolean,          // Loading state
  error: ApiError | null       // Error object if any
}

// Async Thunks:
- loginThunk(credentials)      // POST /auth/login
- logoutThunk()                // POST /auth/logout
- changePasswordThunk(data)    // POST /auth/change-password
```

### Users Slice
```typescript
// src/features/users/usersSlice.ts
state: {
  users: User[],               // List of users
  isLoading: boolean,
  error: ApiError | null
}

// Async Thunks:
- fetchUsersThunk()            // GET /users
- createUserThunk(data)        // POST /users
- updateUserThunk(id, data)    // PATCH /users/{id}
- deleteUserThunk(id)          // DELETE /users/{id}
- resetPasswordThunk(id)       // POST /users/{id}/reset-password
```

---

## 🌐 API Endpoints Summary

**Base**: `http://localhost:3000/api`

### Authentication
```
POST   /auth/login           - User login
POST   /auth/logout          - User logout
POST   /auth/refresh         - Refresh access token
POST   /auth/change-password - Change user password
```

### User Management (Admin only)
```
GET    /users                - Get all users
POST   /users                - Create new user
PATCH  /users/:id            - Update user (role, status)
DELETE /users/:id            - Delete user
POST   /users/:id/reset-password - Reset user password
```

---

## 🔒 Role-Based Access Control (RBAC)

### Frontend Role Guard (PrivateRoute + RoleGuard)
```typescript
// Routes are protected by role
export const ADMIN_ROUTES = ['/admin/users', '/admin/tasks', ...]
export const MANAGER_ROUTES = ['/dashboard', '/inspection', ...]
export const TECHNICIAN_ROUTES = ['/dashboard', '/inspection', ...]
export const VIEWER_ROUTES = ['/dashboard']
```

**Frontend checks role** before rendering admin pages:
- If user not authenticated → Redirect /login
- If user role not allowed → Silently redirect to /dashboard
- If role allowed → Show page

### Backend Role Check
Backend **MUST** also verify user role for sensitive endpoints:
```
GET /users:
  - Require: role === 'Admin'
  - Return 403 if not admin

POST /users:
  - Require: role === 'Admin'
  - Return 403 if not admin
```

---

## 🧪 Development & Testing

### Environment Variables
```bash
# .env.local (Frontend)
VITE_API_URL=http://localhost:3000/api
VITE_USE_MOCK=true                        # true = use mock, false = use real API
```

### Run Frontend
```bash
npm install
npm run dev          # Runs on http://localhost:5173
```

### Test Credentials (Mock Data)
| Username | Password | Role | 
|----------|----------|------|
| admin | admin@123 | Admin |
| manager | manager@123 | Manager |
| technician | tech@123 | Technician |
| locked | locked@123 | Locked (test 423) |

### Testing Flow
1. Set `VITE_USE_MOCK=true` → Frontend uses mock interceptors
2. Mock interceptors simulate API responses
3. Useful for frontend testing without backend
4. When backend ready, set `VITE_USE_MOCK=false` → Use real API

---

## 📦 Dependencies

**Core**:
- react 18.x
- react-router-dom (routing)
- redux-toolkit (state management)
- react-redux (redux hooks)
- axios (HTTP client)
- antd (UI components)

**Development**:
- vite (bundler)
- typescript
- eslint
- vitest (testing)
- react-i18next (translations)

**Utilities**:
- react-hook-form (form handling)
- zod (validation)

---

## 🔄 Continuous Integration Points

### Frontend waits for Backend:
1. ✅ Mock interceptor test (VITE_USE_MOCK=true)
2. ⚠️ Real API test (need backend running)
3. ✅ TypeScript compilation
4. ✅ ESLint checks

### Backend needs to provide:
1. ✅ All endpoints from [API_SPECIFICATION.md](API_SPECIFICATION.md)
2. ✅ Correct response format (statusCode, message, success, data)
3. ✅ JWT token generation + validation
4. ✅ Role-based access control
5. ✅ Error handling with correct status codes
6. ✅ Input validation
7. ✅ CORS configuration

---

## 📝 Data Type Contract

**Enum Values** (Must be exactly as shown):
- Roles: "Admin", "Manager", "Technician", "Viewer"
- Statuses: "Active", "Inactive", "Locked"

**Timestamp Format**:
- ISO 8601: "2026-06-11T10:30:45Z" or "2026-06-11T10:30:45+00:00"
- Must be parseable by JavaScript `new Date(createdAt)`

**Email Format**:
- Must be valid email (RFC 5322)
- Format: username@domain.com

---

## 🚨 Common Issues & Solutions

### Issue: Frontend shows "Lỗi kết nối mạng"
**Causes**:
- Backend not running
- Wrong VITE_API_URL
- CORS not configured
- Network error (5xx, timeout)

**Solution**:
- Check backend is running on port 3000
- Check .env.local VITE_API_URL is correct
- Add CORS headers to backend responses
- Check network in browser DevTools

### Issue: Login always fails (401)
**Causes**:
- Credentials don't match backend
- Backend validation logic issue
- Wrong password hashing

**Solution**:
- Use test credentials: admin/admin@123
- Check backend logs for validation errors
- Verify password hashing (bcrypt recommended)

### Issue: Token refresh loops
**Causes**:
- Token expiration time too short
- Refresh token validation too strict
- Clock skew between frontend/backend

**Solution**:
- Set accessToken expiry to 15-30 minutes
- Set refreshToken expiry to 7-30 days
- Use NTP-sync for server time

---

## 📚 Additional Resources

- [API_SPECIFICATION.md](API_SPECIFICATION.md) - Detailed API endpoints
- [MOCK_API_EXAMPLES.md](MOCK_API_EXAMPLES.md) - Mock response examples
- [TEST_CASES.md](TEST_CASES.md) - Frontend test scenarios
- [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) - What's implemented
- [QUICK_DESIGN_REFERENCE.md](QUICK_DESIGN_REFERENCE.md) - UI styling

---

**Created**: 2026-06-11  
**For**: Backend Development Team  
**Questions?** See API_SPECIFICATION.md or contact Frontend Team
