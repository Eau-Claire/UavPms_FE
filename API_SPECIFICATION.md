# 📋 UAV-PMS Frontend - API Specification for Backend

**Version**: 1.0  
**Date**: 2026-06-11  
**Target Audience**: Backend Development Team  

Tài liệu này định nghĩa **chi tiết các API endpoints** mà backend cần triển khai. Frontend sẽ gọi các endpoint này với request structure được mô tả dưới đây, và backend phải trả về response theo đúng format được định nghĩa.

---

## 🎯 Tổng quan

### Base URL
```
http://localhost:3000/api
```

### Authentication
- **Method**: JWT Bearer Token
- **Header**: `Authorization: Bearer {accessToken}`
- **Token Placement**: Lưu trong localStorage (frontend sẽ tự động gắn vào mỗi request)

### Response Format (Standard)
Mọi response từ API **PHẢI** tuân theo format dưới đây:

```typescript
{
  "statusCode": number,           // HTTP status code (200, 201, 400, 401, 423, etc.)
  "message": string,              // Thông báo mô tả (tiếng Anh hoặc tiếng Việt)
  "success": boolean,             // true nếu thành công, false nếu lỗi
  "data": T                       // Dữ liệu thực tế (object, array, null tùy endpoint)
}
```

### Header Request
```
Content-Type: application/json
Authorization: Bearer {accessToken}  (Không cần gửi với /auth/login)
```

---

## 🔐 Authentication Endpoints

### 1. Login - POST `/auth/login`

**Mô tả**: Xác thực người dùng và cấp token  
**Authentication Required**: ❌ Không  
**Request Body**:
```json
{
  "username": "string",           // Bắt buộc, tên đăng nhập
  "password": "string"            // Bắt buộc, mật khẩu
}
```

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "Login successful",
  "success": true,
  "data": {
    "user": {
      "id": "string",                      // ID người dùng (UUID hoặc số)
      "username": "string",                // Tên đăng nhập
      "fullName": "string",                // Họ tên đầy đủ
      "email": "string",                   // Email
      "role": "Admin|Manager|Technician|Viewer",  // Vai trò
      "status": "Active|Inactive|Locked",  // Trạng thái tài khoản
      "mustChangePassword": "boolean",     // (Optional) Bắt buộc đổi mật khẩu?
      "createdAt": "ISO8601 datetime",     // 2026-06-11T10:30:45Z
      "updatedAt": "ISO8601 datetime"      // 2026-06-11T10:30:45Z
    },
    "tokens": {
      "accessToken": "string",             // JWT token dùng cho requests sau
      "refreshToken": "string"             // JWT token dùng để refresh accessToken
    }
  }
}
```

**Error Response (401) - Invalid Credentials**:
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "success": false
}
```

**Error Response (423) - Account Locked**:
```json
{
  "statusCode": 423,
  "message": "Account locked",
  "success": false
}
```

**Backend Notes**:
- ✅ Validate username và password format
- ✅ Check account status (nếu Locked → trả 423)
- ✅ Tạo cặp accessToken + refreshToken (JWT recommended)
- ✅ accessToken hết hạn sau ~15 phút (tuỳ config)
- ✅ refreshToken có thời gian sống lâu hơn (~7 ngày)
- ✅ Nếu lần đầu tạo user, set `mustChangePassword: true`

---

### 2. Logout - POST `/auth/logout`

**Mô tả**: Đăng xuất và invalidate token phía server  
**Authentication Required**: ✅ Có (Bearer token)  
**Request Body**: Empty  

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "Logout successful",
  "success": true,
  "data": null
}
```

**Backend Notes**:
- ✅ Verify token valid trước khi logout
- ✅ Invalidate refreshToken (nếu tracking tokens trên DB)
- ✅ Frontend sẽ tự xóa localStorage sau khi nhận response
- ✅ Nếu token đã expired, vẫn trả 200 (logout request luôn hợp lệ)

---

### 3. Refresh Token - POST `/auth/refresh`

**Mô tả**: Làm mới access token khi nó sắp hết hạn  
**Authentication Required**: ❌ Không (dùng refresh token thay vì bearer)  
**Request Body**:
```json
{
  "refreshToken": "string"        // Refresh token từ login response
}
```

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "Token refreshed",
  "success": true,
  "data": {
    "accessToken": "string",      // Access token mới
    "refreshToken": "string"      // Refresh token mới (có thể giống cũ)
  }
}
```

**Error Response (401) - Invalid/Expired Refresh Token**:
```json
{
  "statusCode": 401,
  "message": "Invalid refresh token",
  "success": false
}
```

**Backend Notes**:
- ✅ Validate refreshToken signature + expiration
- ✅ Tạo accessToken mới
- ✅ Có thể tạo refreshToken mới hoặc giữ cũ (tuỳ implementation)
- ✅ Nếu refreshToken invalid/expired → trả 401, frontend sẽ redirect login

---

### 4. Change Password - POST `/auth/change-password`

**Mô tả**: Đổi mật khẩu (sau login hoặc khi bị reset)  
**Authentication Required**: ✅ Có (Bearer token)  
**Request Body**:
```json
{
  "currentPassword": "string",    // Mật khẩu hiện tại
  "newPassword": "string"         // Mật khẩu mới
}
```

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "Password changed successfully",
  "success": true,
  "data": {
    "id": "string",
    "username": "string",
    "fullName": "string",
    "email": "string",
    "role": "Admin|Manager|Technician|Viewer",
    "status": "Active|Inactive|Locked",
    "mustChangePassword": false,  // ← IMPORTANT: Set to false after successful change
    "createdAt": "ISO8601 datetime",
    "updatedAt": "ISO8601 datetime"
  }
}
```

**Error Response (401) - Wrong Current Password**:
```json
{
  "statusCode": 401,
  "message": "Current password is incorrect",
  "success": false
}
```

**Backend Notes**:
- ✅ Verify currentPassword trước khi cho phép đổi
- ✅ Validate newPassword format (độ mạnh, độ dài, etc.)
- ✅ Set `mustChangePassword: false` sau khi đổi thành công
- ✅ Return updated user object trong data

---

## 👥 User Management Endpoints

### 5. Get All Users - GET `/users`

**Mô tả**: Lấy danh sách tất cả người dùng  
**Authentication Required**: ✅ Có (Bearer token)  
**Permission Required**: Admin role  
**Query Parameters**: None  
**Request Body**: None  

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "Users retrieved successfully",
  "success": true,
  "data": [
    {
      "id": "string",
      "username": "string",
      "fullName": "string",
      "email": "string",
      "role": "Admin|Manager|Technician|Viewer",
      "status": "Active|Inactive|Locked",
      "mustChangePassword": "boolean",
      "createdAt": "ISO8601 datetime",
      "updatedAt": "ISO8601 datetime"
    }
    // ... more users
  ]
}
```

**Error Response (403) - Unauthorized Role**:
```json
{
  "statusCode": 403,
  "message": "Forbidden - Admin role required",
  "success": false
}
```

**Backend Notes**:
- ✅ Verify token valid
- ✅ Check user role = Admin
- ✅ **NEVER** include password field trong response
- ✅ Return array (có thể rỗng nếu không có users)
- ✅ Sort by createdAt descending (mới nhất trước)

---

### 6. Create User - POST `/users`

**Mô tả**: Tạo user mới (admin chỉ cần fullName + role)  
**Authentication Required**: ✅ Có  
**Permission Required**: Admin role  
**Request Body**:
```json
{
  "fullName": "string",           // Bắt buộc
  "role": "Admin|Manager|Technician|Viewer"  // Bắt buộc
}
```

**Success Response (201)**:
```json
{
  "statusCode": 201,
  "message": "User created successfully",
  "success": true,
  "data": {
    "user": {
      "id": "string",
      "username": "string",        // Backend generated username từ fullName
      "fullName": "string",
      "email": "string",           // Backend generated email từ username
      "role": "string",
      "status": "Active",          // Mặc định: Active
      "mustChangePassword": true,  // IMPORTANT: Luôn true cho user mới
      "createdAt": "ISO8601 datetime",
      "updatedAt": "ISO8601 datetime"
    },
    "username": "string",          // Lặp lại để dễ copy
    "temporaryPassword": "string"  // Mật khẩu tạm thời (random, mạnh)
  }
}
```

**Backend Notes**:
- ✅ Generate username từ fullName (ví dụ: "Nguyễn Văn Admin" → "nguyen.van.admin" hoặc "nvadmin")
- ✅ Generate email: `{username}@evn.com`
- ✅ Generate temporaryPassword ngẫu nhiên, mạnh (8+ ký tự, mix case, số, symbols)
- ✅ Set status = "Active", mustChangePassword = true
- ✅ Backend **KHÔNG** nhận password input từ frontend (bảo mật)

---

### 7. Update User - PATCH `/users/{id}`

**Mô tả**: Cập nhật thông tin user (role, status)  
**Authentication Required**: ✅ Có  
**Permission Required**: Admin role  
**URL Parameters**: `id` (user ID)  
**Request Body**:
```json
{
  "role": "Admin|Manager|Technician|Viewer",  // Optional
  "status": "Active|Inactive|Locked"          // Optional
}
```

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "User updated successfully",
  "success": true,
  "data": {
    "id": "string",
    "username": "string",
    "fullName": "string",
    "email": "string",
    "role": "string",
    "status": "string",
    "mustChangePassword": "boolean",
    "createdAt": "ISO8601 datetime",
    "updatedAt": "ISO8601 datetime"  // Update this timestamp
  }
}
```

**Error Response (404) - User Not Found**:
```json
{
  "statusCode": 404,
  "message": "User not found",
  "success": false
}
```

**Backend Notes**:
- ✅ Check user exists trước
- ✅ Chỉ cho phép update `role` và `status` (không cho update username, email, etc.)
- ✅ Update `updatedAt` timestamp
- ✅ Validate role + status values

---

### 8. Delete User - DELETE `/users/{id}`

**Mô tả**: Xóa user  
**Authentication Required**: ✅ Có  
**Permission Required**: Admin role  
**URL Parameters**: `id` (user ID)  
**Request Body**: None  

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "User deleted successfully",
  "success": true,
  "data": null
}
```

**Error Response (404) - User Not Found**:
```json
{
  "statusCode": 404,
  "message": "User not found",
  "success": false
}
```

**Backend Notes**:
- ✅ Check user exists
- ✅ Soft delete recommended (set status = Inactive thay vì xóa thực sự)
- ✅ Hoặc hard delete tuỳ business logic
- ✅ Cannot delete admin user nếu là user cuối cùng (business logic)

---

### 9. Reset Password - POST `/users/{id}/reset-password`

**Mô tả**: Admin reset password cho user (user phải đổi password ở login tiếp theo)  
**Authentication Required**: ✅ Có  
**Permission Required**: Admin role  
**URL Parameters**: `id` (user ID)  
**Request Body**: None  

**Success Response (200)**:
```json
{
  "statusCode": 200,
  "message": "Password reset successfully",
  "success": true,
  "data": {
    "username": "string",
    "temporaryPassword": "string"  // Mật khẩu tạm thời mới
  }
}
```

**Error Response (404) - User Not Found**:
```json
{
  "statusCode": 404,
  "message": "User not found",
  "success": false
}
```

**Backend Notes**:
- ✅ Check user exists
- ✅ Generate temporaryPassword mới (ngẫu nhiên, mạnh)
- ✅ Set `mustChangePassword: true` cho user
- ✅ Invalidate current session của user nếu đang online (optional)

---

## 🎨 Data Types Reference

### User Object
```typescript
interface User {
  id: string;                              // UUID hoặc numeric ID
  username: string;                        // Unique, lowercase, 3-50 chars
  fullName: string;                        // 1-100 chars
  email: string;                           // Valid email format
  role: "Admin" | "Manager" | "Technician" | "Viewer";  // Enum values chính xác
  status: "Active" | "Inactive" | "Locked";  // Enum values chính xác
  mustChangePassword?: boolean;            // true/false (optional field)
  createdAt: string;                       // ISO 8601 format: "2026-06-11T10:30:45Z"
  updatedAt: string;                       // ISO 8601 format
}
```

### Role Definitions
| Role | Permissions |
|------|-------------|
| **Admin** | Full access, user management |
| **Manager** | Manage inspections/tasks (not user management) |
| **Technician** | Execute tasks, view data |
| **Viewer** | Read-only access |

### Status Definitions
| Status | Meaning |
|--------|---------|
| **Active** | User can login |
| **Inactive** | User account disabled (cannot login) |
| **Locked** | Account locked due to failed login attempts |

---

## ⚠️ Error Handling

### Standard HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|------------|
| **200** | OK | Successful GET, POST, PATCH, DELETE |
| **201** | Created | Successful user creation |
| **400** | Bad Request | Invalid input (validation error) |
| **401** | Unauthorized | Invalid credentials, expired token |
| **403** | Forbidden | Valid token but insufficient permissions |
| **404** | Not Found | Resource doesn't exist |
| **423** | Locked | Account locked |
| **500** | Internal Server Error | Backend error |

### Response Format for Errors

```json
{
  "statusCode": 400,
  "message": "Validation error - password must be at least 6 characters",
  "success": false
}
```

### Frontend Error Handling
Frontend xử lý errors như sau:
- **401**: Thử refresh token, nếu refresh fail → redirect login
- **423**: Hiển thị message "Tài khoản bị khóa", disable retry
- **400/403/404/500**: Hiển thị error message từ backend

---

## 🧪 Test Credentials (Mock Data)

Để testing, backend có thể dùng data này:

| Username | Password | Role | Status | Note |
|----------|----------|------|--------|------|
| admin | admin@123 | Admin | Active | Main admin account |
| manager | manager@123 | Manager | Active | Manager testing |
| technician | tech@123 | Technician | Active | Technician testing |
| locked | locked@123 | Viewer | Locked | For testing lock scenario |

---

## 🔄 Token Lifecycle

```
1. User login → Get accessToken + refreshToken
2. Frontend stores both in localStorage
3. Frontend gắn accessToken vào Authorization header
4. Server validate accessToken
5. Khi accessToken sắp hết hạn (401) → Frontend gọi /auth/refresh
6. Backend verify refreshToken + trả accessToken mới
7. Frontend update tokens + retry original request
8. User logout → Frontend xóa tokens, gọi /auth/logout
```

**Frontend Interceptor Flow**:
```
Request → Gắn Bearer token → Response
                                ↓
                         401 Unauthorized?
                                ↓
                         YES: Call /auth/refresh
                                ↓
                         Refresh success?
                                ↓
                         YES: Update token → Retry request
                         NO: Redirect /login
```

---

## 📝 Important Notes for Backend

✅ **DO**:
- ✅ Return ISO 8601 timestamps for `createdAt`, `updatedAt`
- ✅ Use consistent field names (camelCase in JSON)
- ✅ Always include `statusCode`, `message`, `success` in response
- ✅ Return 201 for create, 200 for others
- ✅ Set `mustChangePassword: true` for new users
- ✅ Validate input strictly (fullName, password strength, etc.)
- ✅ Log authentication events (login, logout, failed attempts)
- ✅ Implement CORS if frontend on different origin

❌ **DON'T**:
- ❌ Include password field in any response
- ❌ Return inconsistent status codes (200 when should be 201)
- ❌ Return plain objects without wrapper (must have statusCode, message, success)
- ❌ Use different field names (role vs Role)
- ❌ Return timestamps in wrong format
- ❌ Allow password input in POST /users (backend generates only)
- ❌ Allow updating username/email after creation

---

## 🚀 Implementation Checklist

- [ ] Setup Node/Express/NestJS or equivalent
- [ ] Configure database (PostgreSQL/MySQL recommended)
- [ ] Implement JWT token generation + validation
- [ ] Implement role-based access control (RBAC)
- [ ] Implement all endpoints from this spec
- [ ] Add input validation (Joi, Zod, class-validator, etc.)
- [ ] Add error handling middleware
- [ ] Add request/response logging
- [ ] Test all endpoints with provided test credentials
- [ ] Implement CORS headers
- [ ] Add API documentation (Swagger/OpenAPI optional but recommended)
- [ ] Setup environment variables (.env file)
- [ ] Prepare database seed with test users

---

## 📞 Questions & Support

Nếu backend team có câu hỏi về API format, vui lòng liên hệ frontend team hoặc tham khảo:
- File: `MOCK_API_EXAMPLES.md` - Ví dụ chi tiết
- File: `TEST_CASES.md` - Test scenarios
- Folder: `src/mocks/` - Mock implementations
- File: `src/types/index.ts` - TypeScript interfaces

---

**Last Updated**: 2026-06-11  
**API Version**: 1.0
