# UAV-PMS Frontend - Test Case Verification Guide

## Mock Data Credentials

Use these credentials for testing (mock interceptors are enabled by default in development):

| User Type | Username | Password | Role | Status |
|-----------|----------|----------|------|--------|
| **Admin** | admin | admin@123 | Admin | Active |
| **Manager** | manager | manager@123 | Manager | Active |
| **Technician** | technician | tech@123 | Technician | Active |
| **Locked** | locked | locked@123 | Viewer | Locked |

---

## Test Scenarios

### TC1: Unauthenticated User Redirect
**Description**: Opening the app redirects unauthenticated users to login page

**Steps**:
1. Open http://localhost:5173
2. Observe the redirect

**Expected Result**: ✅ Should redirect to http://localhost:5173/login

---

### TC2: Login with Valid Admin Credentials
**Description**: Admin user can successfully login

**Steps**:
1. On login page, enter `username: admin` and `password: admin@123`
2. Click "Đăng nhập"
3. Wait for the request

**Expected Results**:
- ✅ Redirected to http://localhost:5173/dashboard
- ✅ Header shows "Nguyễn Văn Admin" with red "Admin" badge
- ✅ Sidebar shows "Quản lý người dùng" menu item (Admin only feature)
- ✅ Avatar shows "NV" initials with amber background

---

### TC3: Login with Valid Manager Credentials
**Description**: Manager user can login but cannot access admin features

**Steps**:
1. Logout if already logged in
2. Enter `username: manager` and `password: manager@123`
3. Click "Đăng nhập"
4. Observe the sidebar and try accessing /admin/users

**Expected Results**:
- ✅ Login successful
- ✅ Header shows "Trần Thị Manager" with blue "Manager" badge
- ✅ Sidebar does NOT show "Quản lý người dùng" menu item
- ✅ Navigating to /admin/users redirects silently to /dashboard (no error shown)
- ✅ Role-based access control working correctly

---

### TC4: Invalid Credentials (401 Error)
**Description**: Wrong password shows 401 error message

**Steps**:
1. On login page, enter `username: admin` and `password: wrongpassword`
2. Click "Đăng nhập"

**Expected Results**:
- ✅ Red error alert appears: "Tên đăng nhập hoặc mật khẩu không đúng."
- ✅ Password field is cleared
- ✅ User remains on login page
- ✅ Can retry with correct credentials

---

### TC5: Locked Account (423 Error)
**Description**: Locked account shows specific error and disables form

**Steps**:
1. On login page, enter `username: locked` and `password: locked@123`
2. Click "Đăng nhập"

**Expected Results**:
- ✅ Red error alert: "Tài khoản đã bị khóa do đăng nhập sai nhiều lần. Vui lòng liên hệ quản trị viên."
- ✅ Password field is cleared
- ✅ Login button becomes permanently disabled (grayed out)
- ✅ Cannot submit form even with different credentials

---

### TC6: Form Validation
**Description**: Form validates required fields and password length

**Steps**:
1. Click "Đăng nhập" without entering anything
2. Enter only username and click "Đăng nhập"
3. Enter password with only 5 characters (e.g., "test1")

**Expected Results**:
- ✅ Error: "Tên đăng nhập không được để trống"
- ✅ Error: "Mật khẩu phải có ít nhất 6 ký tự"
- ✅ Minimum password length is enforced

---

### TC7: Sidebar Collapse/Expand
**Description**: Sidebar can toggle between expanded (240px) and collapsed (80px)

**Prerequisites**: Logged in as admin

**Steps**:
1. Click the menu toggle button (≡ icon) in the top-left of header
2. Observe the sidebar
3. Click toggle button again

**Expected Results**:
- ✅ Sidebar collapses from 240px to 80px (icon-only mode)
- ✅ Logo text changes from "UAV-PMS" to "UAV"
- ✅ Subtitle is hidden when collapsed
- ✅ Menu items show only icons
- ✅ Expanding shows full layout again

---

### TC8: Navigation Menu
**Description**: Menu items navigate correctly and highlight active route

**Prerequisites**: Logged in as admin

**Steps**:
1. Click "Tổng quan" in sidebar
2. Observe URL and highlighting
3. Click "Quản lý người dùng"
4. Observe that disabled items are grayed out

**Expected Results**:
- ✅ URL updates to /dashboard when clicking "Tổng quan"
- ✅ URL updates to /admin/users when clicking "Quản lý người dùng"
- ✅ Active menu item is highlighted with amber color
- ✅ Disabled items (Quản lý nhiệm vụ, etc.) appear grayed out

---

### TC9: Logout Functionality
**Description**: Logout clears session and returns to login

**Prerequisites**: Logged in as admin

**Steps**:
1. Click "Đăng xuất" button in the top-right header
2. Observe redirect and verify localStorage is cleared
3. Try accessing /dashboard directly

**Expected Results**:
- ✅ Redirected to http://localhost:5173/login
- ✅ Login page is displayed
- ✅ localStorage is empty (no accessToken, refreshToken, or user data)
- ✅ Accessing /dashboard redirects back to /login

---

### TC10: Admin-Only Access Control
**Description**: Only Admin role can access /admin/users

**Steps**:
1. Login as admin and navigate to /admin/users ✓
2. Logout and login as manager
3. Try accessing /admin/users directly in browser

**Expected Results**:
- ✅ Admin can view /admin/users page
- ✅ Manager is silently redirected to /dashboard
- ✅ No error message is shown to Manager
- ✅ Role-based access control is working

---

### TC11: User Avatar and Role Badge
**Description**: Header displays correct user info and role styling

**Prerequisites**: Logged in as admin

**Steps**:
1. Observe avatar in header
2. Check the role badge color and text
3. Logout and login as different roles to verify styling

**Expected Results**:
- ✅ Avatar shows user initials (NV, TT, etc.)
- ✅ Avatar background is amber (#F59E0B)
- ✅ Admin badge is red, Manager is blue, Technician is green
- ✅ Full name is displayed correctly
- ✅ Role label matches role (Admin → "Quản trị viên", etc.)

---

### TC12: Loading State
**Description**: Centered loading spinner shown while auth initializes

**Prerequisites**: None

**Steps**:
1. Open DevTools (F12) → Network tab
2. Set network throttle to "Slow 3G"
3. Refresh the page
4. Observe loading state

**Expected Results**:
- ✅ Centered Spin component appears
- ✅ Loading spinner is visible during auth initialization
- ✅ After auth loads, redirect happens (login page for unauthenticated)

---

### TC13: Page Layout Styling
**Description**: Verify colors and layout match EVN brand

**Steps**:
1. Observe sidebar background
2. Observe login page background
3. Observe submit button color
4. Check header background and content area background

**Expected Results**:
- ✅ Sidebar background: EVN Navy (#0A1628)
- ✅ Login page background: EVN Navy (#0A1628)
- ✅ Submit button: EVN Amber (#F59E0B)
- ✅ Header: White background
- ✅ Content area: Light gray background (#F5F5F5)

---

## Quick Test Checklist

Use this checklist to quickly verify the implementation:

- [ ] Unauthenticated user redirected to /login
- [ ] Admin login successful with correct credentials
- [ ] Manager login successful, cannot access /admin/users
- [ ] Invalid credentials show 401 error
- [ ] Locked account shows 423 error and disables form
- [ ] Form validation works (required fields, password min length)
- [ ] Sidebar collapses and expands
- [ ] Menu navigation works and active item is highlighted
- [ ] Logout clears session and redirects to /login
- [ ] Role-based access control blocks unauthorized routes
- [ ] User avatar and role badge display correctly
- [ ] Page styling matches EVN brand colors

---

## Running the Tests

```bash
# Start the development server
npm run dev

# Server will run on http://localhost:5173 or next available port
# Mock interceptors are enabled by default (VITE_USE_MOCK=true in .env.development)

# Use the credentials table above to test different scenarios
```

All test cases can be verified manually by opening the app in a browser and following the steps above.
