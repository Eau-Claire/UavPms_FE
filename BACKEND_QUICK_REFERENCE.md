# ⚡ Backend Integration - Quick Reference Card

**For Backend Team** | **Keep handy while developing**

---

## 🎯 Standard Response Format

**EVERY response** must follow this format:

```json
{
  "statusCode": 200,              // HTTP status
  "message": "Success message",   // Description
  "success": true,                // true/false
  "data": { /* actual data */ }   // Payload or null
}
```

---

## 📍 All Endpoints at a Glance

```
┌─ AUTHENTICATION ─────────────────────────────────────────┐
│ POST /auth/login          → 200 {user, tokens} | 401 | 423
│ POST /auth/logout         → 200 null
│ POST /auth/refresh        → 200 {accessToken, refreshToken}
│ POST /auth/change-password → 200 {user}
├─ USER MANAGEMENT (Admin only) ──────────────────────────┤
│ GET /users                → 200 [user...]
│ POST /users               → 201 {user, username, temporaryPassword}
│ PATCH /users/{id}         → 200 {user}
│ DELETE /users/{id}        → 200 null
│ POST /users/{id}/reset-password → 200 {username, temporaryPassword}
└──────────────────────────────────────────────────────────┘
```

---

## 🔑 Login Response (Complete Example)

```json
{
  "statusCode": 200,
  "message": "Login successful",
  "success": true,
  "data": {
    "user": {
      "id": "1",
      "username": "admin",
      "fullName": "Nguyễn Văn Admin",
      "email": "admin@evn.com",
      "role": "Admin",
      "status": "Active",
      "mustChangePassword": false,
      "createdAt": "2026-06-11T00:00:00Z",
      "updatedAt": "2026-06-11T00:00:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

---

## 👥 Create User Response

**INPUT**: 
```json
{
  "fullName": "Trần Văn Test",
  "role": "Manager"
}
```

**OUTPUT**:
```json
{
  "statusCode": 201,
  "message": "User created successfully",
  "success": true,
  "data": {
    "user": {
      "id": "5",
      "username": "tran.van.test",      // ← Backend generates
      "fullName": "Trần Văn Test",
      "email": "tran.van.test@evn.com", // ← Backend generates
      "role": "Manager",
      "status": "Active",
      "mustChangePassword": true,       // ← Always true for new users!
      "createdAt": "2026-06-11T12:30:45Z",
      "updatedAt": "2026-06-11T12:30:45Z"
    },
    "username": "tran.van.test",        // ← Repeat for easy copy
    "temporaryPassword": "Tr@nTest123"  // ← Random, strong password
  }
}
```

---

## ⚠️ Error Responses

| Scenario | Status | Response |
|----------|--------|----------|
| Wrong username/password | 401 | `{statusCode: 401, message: "Invalid credentials", success: false}` |
| Account locked | 423 | `{statusCode: 423, message: "Account locked", success: false}` |
| User not found | 404 | `{statusCode: 404, message: "User not found", success: false}` |
| Not admin role | 403 | `{statusCode: 403, message: "Forbidden", success: false}` |
| Validation failed | 400 | `{statusCode: 400, message: "validation error", success: false}` |

---

## 🧬 User Object Spec

```typescript
{
  id: string;                           // UUID or numeric ID
  username: string;                     // Unique, lowercase, 3-50 chars
  fullName: string;                     // 1-100 chars
  email: string;                        // Valid email
  role: "Admin" | "Manager" | "Technician" | "Viewer";  // Exact values!
  status: "Active" | "Inactive" | "Locked";             // Exact values!
  mustChangePassword: boolean | undefined;
  createdAt: "2026-06-11T10:30:45Z";    // ISO 8601
  updatedAt: "2026-06-11T10:30:45Z";    // ISO 8601
}
```

---

## 🔐 Authentication Flow

```
1. Frontend POST /auth/login {username, password}
   ↓
2. Backend:
   - Find user by username
   - Verify password (bcrypt)
   - Check status:
     * Locked → return 423
     * Inactive → handle accordingly
     * Active → continue
   - Generate JWT tokens (accessToken + refreshToken)
   - Return {user, tokens}
   ↓
3. Frontend stores tokens in localStorage
   - accessToken: Use for API requests
   - refreshToken: Use to refresh accessToken when expired
```

---

## 🔄 Token Refresh Flow

```
Frontend Request:
  Authorization: Bearer {expiredAccessToken}
  ↓
Backend Response:
  401 Unauthorized
  ↓
Frontend retries with:
  POST /auth/refresh
  Body: {refreshToken}
  ↓
Backend:
  - Verify refreshToken JWT signature
  - Verify not expired
  - Generate new accessToken
  - Return {accessToken, refreshToken}
  ↓
Frontend:
  - Updates localStorage
  - Retries original request
```

---

## 💾 User Creation Password Reset Rule

**When creating a new user**:
```
1. Backend generates temporary password
2. Set mustChangePassword: true
3. User logs in with temporary password
4. Frontend redirects to change-password page
5. User must change password before accessing dashboard
```

**When admin resets password**:
```
1. POST /users/{id}/reset-password
2. Backend generates new temporary password
3. User's session invalidated (if online)
4. Return {username, temporaryPassword}
5. Admin must provide password to user securely
```

---

## 🧪 Test Data

```javascript
const testAccounts = [
  { username: 'admin', password: 'admin@123', role: 'Admin', status: 'Active' },
  { username: 'manager', password: 'manager@123', role: 'Manager', status: 'Active' },
  { username: 'technician', password: 'tech@123', role: 'Technician', status: 'Active' },
  { username: 'locked', password: 'locked@123', role: 'Viewer', status: 'Locked' }
];
```

---

## ✅ Quick Checklist

- [ ] All responses wrapped in `{statusCode, message, success, data}`
- [ ] POST /auth/login returns `{user, tokens}`
- [ ] Roles are exactly: "Admin", "Manager", "Technician", "Viewer"
- [ ] Statuses are exactly: "Active", "Inactive", "Locked"
- [ ] Timestamps in ISO 8601 format (Z suffix)
- [ ] POST /users returns 201 (not 200)
- [ ] POST /users generates username + email + password
- [ ] New users have mustChangePassword: true
- [ ] /users endpoints require Admin role
- [ ] NEVER include password in response
- [ ] DELETE endpoint returns 200 with null data
- [ ] Locked account returns 423 (not 401)

---

## 🚨 Common Mistakes to Avoid

❌ Wrong format:
```json
{ "user": {...} }  // Missing statusCode, message, success, data wrapper
```

✅ Correct:
```json
{ "statusCode": 200, "message": "OK", "success": true, "data": { "user": {...} } }
```

---

❌ Wrong enum:
```json
{ "role": "ADMIN" }  // Should be "Admin" (exact case!)
```

✅ Correct:
```json
{ "role": "Admin" }
```

---

❌ Wrong timestamp:
```
"createdAt": "2026-06-11 10:30:45"  // Wrong format
```

✅ Correct:
```
"createdAt": "2026-06-11T10:30:45Z"  // ISO 8601
```

---

❌ Including password:
```json
{ "user": { ..., "password": "..." } }  // NEVER do this!
```

✅ Correct:
```json
{ "user": { ... } }  // No password field, ever!
```

---

## 📞 Need Details?

- **Full API Spec**: [API_SPECIFICATION.md](API_SPECIFICATION.md)
- **Architecture Guide**: [BACKEND_INTEGRATION_GUIDE.md](BACKEND_INTEGRATION_GUIDE.md)
- **Response Examples**: [MOCK_API_EXAMPLES.md](MOCK_API_EXAMPLES.md)
- **Test Scenarios**: [TEST_CASES.md](TEST_CASES.md)

---

**Version**: 1.0  
**Last Updated**: 2026-06-11  
**Print this and keep on your desk! 📋**
