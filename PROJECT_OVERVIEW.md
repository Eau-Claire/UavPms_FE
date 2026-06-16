# 🎯 UAV-PMS Project - Complete Overview

**Version**: 1.0  
**Date**: 2026-06-11  
**Target Audience**: Backend & Full-Stack Teams  

---

## 📋 Project Summary

**UAV-PMS** (Unmanned Aerial Vehicle - Performance Management System) là một hệ thống quản lý hiệu suất cho các thiết bị bay không người lái.

### Scope
- **Frontend**: React + TypeScript + Vite ✅ DONE
- **Backend**: To be implemented (this is where you come in!)
- **Database**: PostgreSQL/MySQL recommended
- **Deployment**: Docker-ready

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────┐
│         Frontend (React)              │
│     http://localhost:5173            │
│  - User authentication                │
│  - Dashboard (coming soon)            │
│  - User management (admin)            │
│  - Responsive design                  │
└────────────────────┬─────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    [Interceptors]   │    [Mock]
    - Auth tokens    │    - For dev
    - Auto refresh   │
    - Error handler  │
         │           │           │
         └───────────┼───────────┘
                     │
            [Axios HTTP Client]
         http://localhost:3000/api
                     │
         ┌───────────┴──────────┐
         │                      │
    Backend (To Build)      Database
    - Node/Express/NestJS  - PostgreSQL/MySQL
    - APIs (9 endpoints)   - User storage
    - Authentication       - Session management
    - Authorization        - Audit logging
         │
    [Database Layer]
```

---

## 👤 User Roles & Permissions

```
┌─────────────────────────────────────────────────────────────┐
│                      Admin                                  │
│  ✓ Full system access                                       │
│  ✓ User management (create, edit, delete, reset password)  │
│  ✓ View all data                                            │
│  ✓ System configuration                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Manager                                │
│  ✓ Dashboard access                                         │
│  ✓ Inspection management                                    │
│  ✓ Task management                                          │
│  ✗ No user management                                       │
│  ✗ No system admin features                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Technician                               │
│  ✓ Dashboard access                                         │
│  ✓ Execute assigned tasks                                   │
│  ✓ View inspection data                                     │
│  ✗ Cannot manage other users                                │
│  ✗ Cannot manage system                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Viewer                                 │
│  ✓ Read-only dashboard access                              │
│  ✗ Cannot perform actions                                  │
│  ✗ Cannot manage anything                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Authentication Mechanism

### Flow
```
User inputs credentials
         ↓
POST /auth/login {username, password}
         ↓
Backend validates (bcrypt password verification)
         ↓
IF valid:
  - Generate JWT accessToken (15 min expiry)
  - Generate JWT refreshToken (7 days expiry)
  - Return {user, tokens}
         ↓
Frontend stores in localStorage + Redux
         ↓
All API requests include:
  Header: Authorization: Bearer {accessToken}
         ↓
IF accessToken expired (401):
  - Auto call POST /auth/refresh {refreshToken}
  - Get new accessToken
  - Retry original request
         ↓
IF refreshToken invalid:
  - Clear session
  - Redirect to login
```

---

## 📱 Frontend Screens (Already Built)

### 1. **Login Page** ✅
- Username & password input
- Error messages (Vietnamese)
- Loading state
- Remember device option (future)
- Responsive design

### 2. **Change Password Page** ✅
- Old password validation
- New password confirmation
- Password strength indicator (future)
- Triggered on first login after account creation

### 3. **Dashboard** 🔜 (Future)
- User profile card
- Role-based menu
- Analytics widgets
- Task list

### 4. **User Management Page** 🔜 (Future)
- Admin only access
- List all users
- Create new user
- Edit user (role, status)
- Delete user
- Reset password
- Search & filter

### 5. **Header Component** ✅
- User name & avatar
- Role badge
- Logout button
- Language switcher (EN/VI)

### 6. **Sidebar Component** ✅
- Role-based menu items
- Active menu indicator
- Responsive (collapsible on mobile)

---

## 🔧 Tech Stack

### Frontend
```
Runtime:     Node.js 18+
Framework:   React 18
Language:    TypeScript
Bundler:     Vite
UI Library:  Ant Design
State Mgmt:  Redux Toolkit
Routing:     React Router v6
HTTP:        Axios
i18n:        react-i18next
Form:        React Hook Form + Zod (validation)
Testing:     Vitest
```

### Backend (Recommendations)
```
Runtime:     Node.js 18+ or Python 3.10+
Framework:   Express, NestJS, FastAPI, Django
Language:    JavaScript/TypeScript or Python
Database:    PostgreSQL 14+ or MySQL 8+
Auth:        JWT (jsonwebtoken library)
Password:    bcrypt
ORM:         Sequelize, TypeORM, SQLAlchemy
Validation:  Joi, class-validator, Pydantic
```

---

## 📊 Database Schema (Recommended)

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,        -- bcrypt
  fullName VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL,                  -- Admin, Manager, Technician, Viewer
  status VARCHAR(50) NOT NULL,                -- Active, Inactive, Locked
  mustChangePassword BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
```

### Refresh Tokens Table (Optional)
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL UNIQUE,   -- Hash of refresh token
  expiresAt TIMESTAMP NOT NULL,
  revokedAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

### Audit Logs Table (Optional)
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50),                        -- login, logout, create_user, etc.
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSON,
  status VARCHAR(20),                        -- success, failed
  createdAt TIMESTAMP DEFAULT NOW()
);
```

---

## 🌐 API Endpoints (9 Total)

### Authentication (4 endpoints)
```
POST   /auth/login              - User login
POST   /auth/logout             - User logout
POST   /auth/refresh            - Refresh access token
POST   /auth/change-password    - Change password
```

### User Management (5 endpoints)
```
GET    /users                   - List all users (admin only)
POST   /users                   - Create new user (admin only)
PATCH  /users/{id}              - Update user (admin only)
DELETE /users/{id}              - Delete user (admin only)
POST   /users/{id}/reset-password - Reset password (admin only)
```

---

## 📝 Frontend Project Structure

```
src/
├── components/           # React components
│   ├── common/          # Common UI (Header, Sidebar)
│   ├── layout/          # Layout components
│   ├── ui/              # UI building blocks
│   └── users/           # User-related components
├── pages/               # Page components
│   ├── LoginPage.tsx
│   ├── ChangePasswordPage.tsx
│   ├── UserManagementPage.tsx
│   └── __tests__/       # Tests
├── features/            # Redux feature slices
│   ├── auth/            # Authentication (login, logout, tokens)
│   └── users/           # User management
├── hooks/               # Custom React hooks
│   ├── useAuth.ts       # Auth context
│   ├── useUsers.ts      # User management
│   ├── usePermission.ts # Role-based access
│   └── useIsMobile.ts   # Responsive
├── services/            # API calls
│   └── api/
│       ├── axiosClient.ts
│       └── userService.ts
├── types/               # TypeScript types
├── constants/           # App constants
├── utils/               # Utilities
├── styles/              # Design tokens
├── locales/             # i18n translations
└── mocks/               # Mock data
```

---

## 🧪 Test Accounts

Use these for testing:

| Username | Password | Role | Status |
|----------|----------|------|--------|
| admin | admin@123 | Admin | Active |
| manager | manager@123 | Manager | Active |
| technician | tech@123 | Technician | Active |
| locked | locked@123 | Viewer | Locked |

---

## 🎨 UI Design System

### Colors
```
Primary Blue:      #1890FF
Success Green:     #52C41A
Warning Orange:    #FAAD14
Error Red:         #FF4D4F
Background:        #FAFAFA
Text:              #000000
Border:            #D9D9D9
```

### Typography
```
App Name:   Noto Sans Bold, 24px
Headings:   Noto Sans Semi-Bold, 16-20px
Body:       Noto Sans Regular, 14px
Small:      Noto Sans Regular, 12px
```

### Spacing
```
xs:  4px
sm:  8px
md:  16px
lg:  24px
xl:  32px
```

---

## 🚀 Development Workflow

### Frontend Development
```bash
cd uav-pms-frontend
npm install
VITE_USE_MOCK=true npm run dev    # With mock API (no backend needed)
```

### Backend Development (You!)
```bash
cd uav-pms-backend
npm install
npm run dev                        # Runs on port 3000
```

### Integration Testing
```bash
# Terminal 1: Frontend
VITE_USE_MOCK=false npm run dev   # Uses real API

# Terminal 2: Backend
npm run dev                        # Provides real API

# Browser: http://localhost:5173/login
# Test with credentials from above
```

---

## 📊 State Management (Redux)

### Auth Slice
```javascript
{
  user: {
    id, username, fullName, email, role, status,
    mustChangePassword, createdAt, updatedAt
  },
  isAuthenticated: true,
  isLoading: false,
  error: null
}
```

### Users Slice
```javascript
{
  users: [
    { id, username, fullName, email, role, status, ... },
    ...
  ],
  isLoading: false,
  error: null
}
```

---

## ✅ Implementation Checklist

### Database Setup
- [ ] Create users table with schema
- [ ] Create refresh_tokens table
- [ ] Create audit_logs table
- [ ] Add indexes
- [ ] Seed with test users

### Backend Development
- [ ] Setup Express/NestJS server
- [ ] Configure PostgreSQL/MySQL
- [ ] Implement JWT authentication
- [ ] Implement bcrypt password hashing
- [ ] Implement CORS
- [ ] Implement error handling
- [ ] Implement input validation

### Endpoints Implementation
- [ ] POST /auth/login
- [ ] POST /auth/logout
- [ ] POST /auth/refresh
- [ ] POST /auth/change-password
- [ ] GET /users
- [ ] POST /users
- [ ] PATCH /users/{id}
- [ ] DELETE /users/{id}
- [ ] POST /users/{id}/reset-password

### Testing & Deployment
- [ ] Test each endpoint manually
- [ ] Test with frontend
- [ ] Setup Docker
- [ ] Setup environment variables
- [ ] Setup CI/CD pipeline (optional)
- [ ] Deploy to production

---

## 📚 Documentation Files

**For Backend Team** (You have received):
1. **BACKEND_DOCUMENTATION_INDEX.md** - Navigation guide
2. **BACKEND_QUICK_REFERENCE.md** - Quick lookup (print this!)
3. **API_SPECIFICATION.md** - Complete API reference
4. **DATABASE_SCHEMA_RECOMMENDATIONS.md** - Database setup
5. **BACKEND_INTEGRATION_GUIDE.md** - Full architecture

**Related Documentation**:
- MOCK_API_EXAMPLES.md - Response examples
- TEST_CASES.md - Frontend test scenarios
- IMPLEMENTATION_REPORT.md - What's done on frontend
- QUICK_DESIGN_REFERENCE.md - UI styling

---

## 🔄 Integration Milestones

### Week 1: Authentication
- [ ] Database setup
- [ ] POST /auth/login working
- [ ] POST /auth/logout working
- [ ] POST /auth/refresh working
- [ ] Frontend can login

### Week 2: Password & User Management
- [ ] POST /auth/change-password working
- [ ] GET /users working
- [ ] POST /users working
- [ ] PATCH /users/{id} working
- [ ] Admin can manage users

### Week 3: Polish & Testing
- [ ] DELETE /users/{id} working
- [ ] POST /users/{id}/reset-password working
- [ ] All endpoints fully tested
- [ ] Error handling complete
- [ ] Ready for production

---

## 🎓 Learning Resources

### Node.js/Express Backend
- Express.js docs: https://expressjs.com
- JWT auth: https://www.npmjs.com/package/jsonwebtoken
- bcrypt: https://www.npmjs.com/package/bcrypt
- Sequelize ORM: https://sequelize.org

### NestJS Backend
- NestJS docs: https://docs.nestjs.com
- Authentication: https://docs.nestjs.com/security/authentication
- TypeORM: https://typeorm.io

### PostgreSQL
- PostgreSQL docs: https://www.postgresql.org/docs
- SQL tutorials: https://www.w3schools.com/sql/

### Frontend Integration
- React Hooks: https://react.dev
- Redux Toolkit: https://redux-toolkit.js.org
- Axios: https://axios-http.com

---

## 🆘 Common Questions

**Q: Should I build with Node.js or Python?**  
A: Both work. Node.js matches frontend tech stack. Either is fine.

**Q: Do I need Docker?**  
A: Not required for development. Recommended for production/deployment.

**Q: How do I handle CORS?**  
A: Add `cors` middleware in Express, configure for http://localhost:5173

**Q: What about rate limiting?**  
A: Optional for MVP. Add later if needed.

**Q: How long does implementation take?**  
A: ~1-2 weeks depending on team size and experience. See milestones above.

**Q: Should I implement all endpoints at once?**  
A: No. Start with /auth/login, test with frontend, then iterate.

---

## 📞 Support & Questions

**For API endpoint details:**
- See API_SPECIFICATION.md

**For database questions:**
- See DATABASE_SCHEMA_RECOMMENDATIONS.md

**For system architecture:**
- See BACKEND_INTEGRATION_GUIDE.md

**For quick reference while coding:**
- Use BACKEND_QUICK_REFERENCE.md (keep printed!)

**For any other questions:**
- Check the relevant documentation
- Contact Frontend team for clarification

---

## 🎉 Ready to Get Started?

1. **Understand the Project**
   - Read this file (5 min)

2. **Learn the API**
   - Start with BACKEND_QUICK_REFERENCE.md (5 min)
   - Then read API_SPECIFICATION.md (20 min)

3. **Plan the Database**
   - Read DATABASE_SCHEMA_RECOMMENDATIONS.md (10 min)
   - Setup your database

4. **Start Coding**
   - Implement POST /auth/login first
   - Test with frontend
   - Iterate on other endpoints

5. **Celebrate! 🎊**
   - You've built an API backend!

---

**Document Created**: 2026-06-11  
**Purpose**: Complete project overview for backend team  
**Status**: Ready to implement ✅

**Next Step**: Open [BACKEND_DOCUMENTATION_INDEX.md](BACKEND_DOCUMENTATION_INDEX.md) for navigation
