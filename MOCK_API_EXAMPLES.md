# Mock API Response Examples

## 1. Login Success (200)

### Request
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin@123"
}
```

### Response (Mock)
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
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-01T00:00:00Z"
    },
    "tokens": {
      "accessToken": "mock_access_token_admin",
      "refreshToken": "mock_refresh_token_admin"
    }
  }
}
```

---

## 2. Invalid Credentials (401)

### Request
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "wrongpassword"
}
```

### Response (Mock)
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "success": false
}
```

**Frontend Behavior**:
- Show error: "Tên đăng nhập hoặc mật khẩu không đúng."
- Clear password field
- User remains on login page

---

## 3. Locked Account (423)

### Request
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "locked",
  "password": "locked@123"
}
```

### Response (Mock)
```json
{
  "statusCode": 423,
  "message": "Account locked",
  "success": false
}
```

**Frontend Behavior**:
- Show error: "Tài khoản đã bị khóa do đăng nhập sai nhiều lần. Vui lòng liên hệ quản trị viên."
- Clear password field
- Disable login button permanently
- User cannot retry

---

## 4. Logout (200)

### Request
```http
POST /api/auth/logout
Authorization: Bearer mock_access_token_admin
```

### Response (Mock)
```json
{
  "statusCode": 200,
  "message": "Logout successful",
  "success": true,
  "data": null
}
```

**Frontend Behavior**:
- Clear Redux auth state
- Clear localStorage
- Redirect to /login

---

## 5. Token Refresh (200)

### Request
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "mock_refresh_token_admin"
}
```

### Response (Mock)
```json
{
  "statusCode": 200,
  "message": "Token refreshed",
  "success": true,
  "data": {
    "accessToken": "mock_new_access_token",
    "refreshToken": "mock_new_refresh_token"
  }
}
```

**Frontend Behavior**:
- Update localStorage with new tokens
- Update Redux state
- Retry original request with new token

---

## Frontend Redux State After Login

```json
{
  "auth": {
    "user": {
      "id": "1",
      "username": "admin",
      "fullName": "Nguyễn Văn Admin",
      "email": "admin@evn.com",
      "role": "Admin",
      "status": "Active",
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-01T00:00:00Z"
    },
    "isAuthenticated": true,
    "isLoading": false,
    "error": null
  },
  "users": {
    "users": [],
    "isLoading": false,
    "error": null
  }
}
```

---

## localStorage After Login

```json
{
  "accessToken": "mock_access_token_admin",
  "refreshToken": "mock_refresh_token_admin",
  "user": {
    "id": "1",
    "username": "admin",
    "fullName": "Nguyễn Văn Admin",
    "email": "admin@evn.com",
    "role": "Admin",
    "status": "Active",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z"
  }
}
```

---

## Routing Behavior

### Before Login (Unauthenticated)
```
GET / → Redirects to /login
GET /login → Show login page
GET /dashboard → Redirects to /login
GET /admin/users → Redirects to /login
```

### After Admin Login
```
GET / → Redirects to /login (not needed, already logged in)
GET /login → Shows dashboard (already authenticated)
GET /dashboard → Shows dashboard ✓
GET /admin/users → Shows user management ✓
```

### After Manager Login
```
GET / → Redirects to /login
GET /login → Shows dashboard (already authenticated)
GET /dashboard → Shows dashboard ✓
GET /admin/users → Redirects to /dashboard (role check fails, silent redirect)
```

---

## Error Scenarios Testing

### Test Case: Wrong Credentials
```
1. Login with admin/wrongpassword
2. Frontend receives 401 status
3. Error message shows in Vietnamese
4. Password field cleared
5. Can retry immediately
```

### Test Case: Locked Account
```
1. Login with locked/locked@123
2. Frontend receives 423 status
3. Error message shows in Vietnamese
4. Password field cleared
5. Submit button disabled
6. Cannot retry (even with correct credentials)
```

### Test Case: Network Error
```
1. Turn off mock interceptors (set VITE_USE_MOCK=false)
2. Try to login
3. Backend returns generic error or timeout
4. Frontend shows: "Đã có lỗi xảy ra. Vui lòng thử lại sau."
5. User can retry
```
