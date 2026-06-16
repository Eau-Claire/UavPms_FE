# 📑 Backend Documentation Index

**For Backend Development Team** | **Start here 👈**

---

## 🚀 Quick Start Path

```
1. Read this file (2 min) ←← YOU ARE HERE
   ↓
2. Read: BACKEND_QUICK_REFERENCE.md (3 min)
   ↓
3. Read: API_SPECIFICATION.md (10 min) - Detailed endpoints
   ↓
4. Read: DATABASE_SCHEMA_RECOMMENDATIONS.md (5 min)
   ↓
5. Read: BACKEND_INTEGRATION_GUIDE.md (10 min) - Full architecture
   ↓
6. Start coding! 🎉
```

---

## 📚 Documentation Files

### 1. **BACKEND_QUICK_REFERENCE.md** ⭐ START HERE
   - **Time**: 3-5 minutes
   - **What**: Quick reference card with common patterns
   - **Contains**:
     - Standard response format
     - All endpoints at a glance
     - Complete examples
     - Common mistakes to avoid
     - Checklists
   - **Best for**: Quick lookup while coding

### 2. **API_SPECIFICATION.md** 📖 DETAILED SPEC
   - **Time**: 15-20 minutes
   - **What**: Complete, detailed API specification
   - **Contains**:
     - Base URL and authentication info
     - All 9 endpoints (auth + user management)
     - Full request/response examples for each
     - Error scenarios and status codes
     - Data type definitions
     - Token lifecycle explanation
     - Important DO's and DON'Ts
   - **Best for**: Reference while implementing endpoints

### 3. **DATABASE_SCHEMA_RECOMMENDATIONS.md** 🗄️ DATABASE
   - **Time**: 10-15 minutes
   - **What**: Database schema, indexes, and security
   - **Contains**:
     - SQL schemas for 3 tables (users, refresh_tokens, audit_logs)
     - Enum constraints
     - Performance indexes
     - Security best practices (bcrypt, JWT)
     - Sample Node.js implementation
     - Environment variables
   - **Best for**: Planning database structure

### 4. **BACKEND_INTEGRATION_GUIDE.md** 🏗️ ARCHITECTURE
   - **Time**: 15-20 minutes
   - **What**: Full system architecture and flows
   - **Contains**:
     - High-level system diagram
     - Authentication flow (login, logout, refresh)
     - Frontend project structure (for context)
     - Redux state management explanation
     - Role-based access control (RBAC)
     - All dependencies
     - Common issues & solutions
     - Continuous integration points
   - **Best for**: Understanding the whole system

---

## 🎯 By Role: Which Document to Read?

### 👨‍💼 Backend Team Lead / Architect
1. BACKEND_INTEGRATION_GUIDE.md - Understand full flow
2. DATABASE_SCHEMA_RECOMMENDATIONS.md - Plan database
3. API_SPECIFICATION.md - Know what to build
4. BACKEND_QUICK_REFERENCE.md - Keep handy

### 💻 Backend Developer (Implementing Endpoints)
1. BACKEND_QUICK_REFERENCE.md - Quick patterns
2. API_SPECIFICATION.md - Specific endpoint details
3. DATABASE_SCHEMA_RECOMMENDATIONS.md - Query patterns
4. Keep API_SPECIFICATION.md open while coding

### 🔐 Security Engineer
1. DATABASE_SCHEMA_RECOMMENDATIONS.md - Security best practices
2. API_SPECIFICATION.md - Authentication details
3. BACKEND_INTEGRATION_GUIDE.md - Token lifecycle

### 🧪 QA / Tester
1. BACKEND_QUICK_REFERENCE.md - Common mistakes
2. API_SPECIFICATION.md - Expected responses
3. DATABASE_SCHEMA_RECOMMENDATIONS.md - Test data setup

---

## 📍 Endpoint Locations in Documentation

### Authentication Endpoints

| Endpoint | Location in API_SPECIFICATION |
|----------|------|
| `POST /auth/login` | Section "Authentication Endpoints" → #5 Login |
| `POST /auth/logout` | Section "Authentication Endpoints" → #2 Logout |
| `POST /auth/refresh` | Section "Authentication Endpoints" → #3 Refresh Token |
| `POST /auth/change-password` | Section "Authentication Endpoints" → #4 Change Password |

### User Management Endpoints

| Endpoint | Location in API_SPECIFICATION |
|----------|------|
| `GET /users` | Section "User Management Endpoints" → #5 Get All Users |
| `POST /users` | Section "User Management Endpoints" → #6 Create User |
| `PATCH /users/{id}` | Section "User Management Endpoints" → #7 Update User |
| `DELETE /users/{id}` | Section "User Management Endpoints" → #8 Delete User |
| `POST /users/{id}/reset-password` | Section "User Management Endpoints" → #9 Reset Password |

---

## 🔑 Key Concepts

### Response Format
**Everywhere** in documentation:
```json
{
  "statusCode": number,
  "message": string,
  "success": boolean,
  "data": { /* payload */ }
}
```

### Roles (Exact Values Required)
- `"Admin"` (capital A)
- `"Manager"` (capital M)
- `"Technician"` (capital T)
- `"Viewer"` (capital V)

### Statuses (Exact Values Required)
- `"Active"`
- `"Inactive"`
- `"Locked"`

### Timestamps (ISO 8601 Required)
- Format: `"2026-06-11T10:30:45Z"`
- Parseable by JavaScript `new Date()`

### Security Rules
1. ❌ NEVER include `password` in response
2. ✅ Always hash passwords with bcrypt
3. ✅ Return JWT tokens (access + refresh)
4. ✅ Set `mustChangePassword: true` for new users
5. ✅ Return 201 for POST (create), 200 for others

---

## 🧪 Test Accounts (from Frontend Mock Data)

Use these for testing:

```
Username: admin        | Password: admin@123       | Role: Admin       | Status: Active
Username: manager      | Password: manager@123     | Role: Manager     | Status: Active
Username: technician   | Password: tech@123        | Role: Technician  | Status: Active
Username: locked       | Password: locked@123      | Role: Viewer      | Status: Locked
```

---

## 🔄 Complete API Flow Example

### User Logs In
```
1. Frontend POST /auth/login { username: "admin", password: "admin@123" }
2. Backend returns:
   {
     "statusCode": 200,
     "message": "Login successful",
     "success": true,
     "data": {
       "user": { id, username, fullName, email, role, status, ... },
       "tokens": { accessToken, refreshToken }
     }
   }
3. Frontend stores tokens in localStorage
4. Frontend includes in next requests:
   Authorization: Bearer {accessToken}
```

### User Views All Users (Admin Only)
```
1. Frontend GET /users
   Header: Authorization: Bearer {accessToken}
2. Backend checks:
   - Token valid? ✓
   - User role = Admin? ✓
3. Backend returns:
   {
     "statusCode": 200,
     "message": "Users retrieved successfully",
     "success": true,
     "data": [ { user1 }, { user2 }, ... ]
   }
```

### Admin Creates New User
```
1. Frontend POST /users
   Body: { fullName: "Ngô Văn Test", role: "Manager" }
   Header: Authorization: Bearer {accessToken}
2. Backend:
   - Token valid? ✓
   - User role = Admin? ✓
   - Validate fullName + role ✓
3. Backend generates:
   - username: "ngo.van.test"
   - email: "ngo.van.test@evn.com"
   - temporaryPassword: "NgTest123!" (random)
4. Backend returns:
   {
     "statusCode": 201,
     "message": "User created successfully",
     "success": true,
     "data": {
       "user": { id, username, fullName, email, role: "Manager", status: "Active", mustChangePassword: true, ... },
       "username": "ngo.van.test",
       "temporaryPassword": "NgTest123!"
     }
   }
5. Frontend shows credentials to admin (for sharing with user)
```

---

## ⚠️ Common Mistakes (Detailed)

### ❌ Mistake 1: Wrong Response Format
```json
{ "user": { ... } }
```
**Problem**: Missing statusCode, message, success, data wrapper  
**Fix**: See BACKEND_QUICK_REFERENCE.md or API_SPECIFICATION.md

### ❌ Mistake 2: Wrong Role Value
```json
{ "role": "ADMIN" }  or  { "role": "admin" }
```
**Problem**: Should be exactly `"Admin"` (capital A, lowercase dmin)  
**Fix**: Use exact values from documentation

### ❌ Mistake 3: Including Password in Response
```json
{ "user": { ..., "password": "abc123" } }
```
**Problem**: Security breach! Never expose passwords  
**Fix**: Select without password field or exclude before sending

### ❌ Mistake 4: Wrong HTTP Status for Create
```
POST /users → Response 200 OK
```
**Problem**: Should be 201 Created  
**Fix**: Return 201 for POST that creates resource

### ❌ Mistake 5: Wrong Timestamp Format
```
"createdAt": "2026-06-11 10:30:45"
```
**Problem**: Not ISO 8601, can't parse in JavaScript  
**Fix**: Use `"2026-06-11T10:30:45Z"` format

---

## 🚀 Implementation Order Recommendation

### Phase 1: Authentication (Start Here)
1. Setup database (users table)
2. Implement `POST /auth/login` ← Most important!
3. Implement `POST /auth/logout`
4. Implement `POST /auth/refresh`
5. Setup JWT middleware

### Phase 2: Password Management
6. Implement `POST /auth/change-password`

### Phase 3: User Management
7. Implement `GET /users` (with admin check)
8. Implement `POST /users`
9. Implement `PATCH /users/{id}`
10. Implement `DELETE /users/{id}`
11. Implement `POST /users/{id}/reset-password`

### Phase 4: Polish
12. Add error handling
13. Add input validation
14. Add logging/audit
15. Add CORS configuration
16. Test all endpoints

---

## ✅ Validation Checklist

Before marking backend as "ready":

- [ ] All 9 endpoints implemented
- [ ] All responses follow standard format
- [ ] Test with all 4 test accounts
- [ ] Enum values are exact (Admin, Manager, etc.)
- [ ] Timestamps in ISO 8601 format
- [ ] No passwords in responses
- [ ] POST returns 201, others return 200
- [ ] 401 for invalid credentials
- [ ] 423 for locked account
- [ ] Admin-only endpoints check role
- [ ] CORS configured
- [ ] Error messages informative
- [ ] Database indexes created
- [ ] Passwords bcrypt hashed
- [ ] JWT tokens working
- [ ] Token refresh working
- [ ] Tested with frontend (VITE_USE_MOCK=false)

---

## 📞 How to Use These Documents

### While Planning
- Start with BACKEND_INTEGRATION_GUIDE.md
- Review DATABASE_SCHEMA_RECOMMENDATIONS.md
- Plan your tech stack

### While Implementing
- Use BACKEND_QUICK_REFERENCE.md on your desk
- Reference API_SPECIFICATION.md for each endpoint
- Check DATABASE_SCHEMA_RECOMMENDATIONS.md for SQL

### While Testing
- Use test accounts from above
- Compare responses with examples in API_SPECIFICATION.md
- Check status codes in BACKEND_QUICK_REFERENCE.md

### During Code Review
- Verify format in BACKEND_QUICK_REFERENCE.md
- Check against checklist in Validation section
- Ensure no common mistakes listed above

---

## 🔗 Related Frontend Documentation

Backend team can also reference:
- **MOCK_API_EXAMPLES.md** - Response examples (same as in API_SPECIFICATION.md)
- **TEST_CASES.md** - Frontend test scenarios (helps understand expected behavior)
- **IMPLEMENTATION_REPORT.md** - What's implemented on frontend side

---

## 🎯 Success Criteria

**Backend implementation is successful when:**

1. ✅ Frontend can login with test credentials
2. ✅ Frontend receives correct user data
3. ✅ Frontend can make authenticated requests
4. ✅ Frontend can see list of users (admin only)
5. ✅ Frontend can create/update/delete users (admin only)
6. ✅ Frontend can change password
7. ✅ Frontend logout clears session
8. ✅ Token refresh works automatically
9. ✅ All error messages display correctly
10. ✅ No console errors on frontend

---

## 💡 Pro Tips

1. **Keep BACKEND_QUICK_REFERENCE.md printed** - For quick lookup while coding
2. **Test each endpoint individually** - Don't wait until all endpoints done
3. **Use frontend mock mode first** - See what responses frontend expects
4. **Start with login endpoint** - It's the foundation for everything else
5. **Setup proper error handling early** - Saves debugging time later
6. **Use audit logging** - Helps troubleshoot issues in production
7. **Test with all 4 accounts** - Especially test the locked account (423)

---

## 📊 Document Statistics

| Document | Pages | Time to Read | Purpose |
|----------|-------|--------------|---------|
| BACKEND_QUICK_REFERENCE.md | ~2-3 | 3-5 min | Quick reference while coding |
| API_SPECIFICATION.md | ~8-10 | 15-20 min | Complete endpoint reference |
| DATABASE_SCHEMA_RECOMMENDATIONS.md | ~5-7 | 10-15 min | Database planning & security |
| BACKEND_INTEGRATION_GUIDE.md | ~6-8 | 15-20 min | Full system architecture |
| **Total** | **~20-25** | **~45-60 min** | Complete understanding |

---

## 🆘 Troubleshooting

**"I don't know where to start"**
→ Read BACKEND_QUICK_REFERENCE.md first (5 min), then API_SPECIFICATION.md

**"Frontend shows error 'invalid response'"**
→ Check your response format against BACKEND_QUICK_REFERENCE.md

**"Can't get login working"**
→ See #5 Login in API_SPECIFICATION.md, verify statusCode/message/success/data structure

**"Frontend says 'role not allowed'"**
→ Check if user role is exact (Admin, not ADMIN), see Roles section

**"Don't know what database schema to use"**
→ See DATABASE_SCHEMA_RECOMMENDATIONS.md, copy the SQL directly

**"Need to understand the whole flow"**
→ Read BACKEND_INTEGRATION_GUIDE.md, see the diagrams

---

## 📝 Next Steps

1. ✅ **Read** BACKEND_QUICK_REFERENCE.md (5 min)
2. ✅ **Read** API_SPECIFICATION.md (20 min)
3. ✅ **Setup** database using DATABASE_SCHEMA_RECOMMENDATIONS.md (30 min)
4. ✅ **Implement** POST /auth/login endpoint (1-2 hours)
5. ✅ **Test** with frontend VITE_USE_MOCK=false (30 min)
6. ✅ **Iterate** on other endpoints
7. ✅ **Done!** 🎉

---

**Version**: 1.0  
**Created**: 2026-06-11  
**For**: Backend Development Team  

**Questions?** Check the relevant document or contact Frontend Team.

---

## 📚 Complete Document Map

```
📁 Backend Documentation
├─ 📄 BACKEND_DOCUMENTATION_INDEX.md ← YOU ARE HERE
├─ 📄 BACKEND_QUICK_REFERENCE.md ⭐ (START NEXT)
├─ 📄 API_SPECIFICATION.md
├─ 📄 DATABASE_SCHEMA_RECOMMENDATIONS.md
├─ 📄 BACKEND_INTEGRATION_GUIDE.md
└─ 📄 Related Frontend Docs (FYI):
   ├─ MOCK_API_EXAMPLES.md
   ├─ TEST_CASES.md
   ├─ IMPLEMENTATION_REPORT.md
   └─ QUICK_DESIGN_REFERENCE.md
```

**👉 Next: Open BACKEND_QUICK_REFERENCE.md**
