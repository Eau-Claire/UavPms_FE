/**
 * Test Cases for UAV-PMS Frontend
 *
 * This file documents the test scenarios for the implementation.
 * Run with: npm run dev and manually test each scenario
 */

export const TEST_CASES = {
  'TC1: Unauthenticated user redirects to login': {
    description: 'Opening http://localhost:5173 should redirect to /login',
    steps: [
      '1. Open browser DevTools (F12)',
      '2. Open http://localhost:5173',
      '3. Verify you are redirected to http://localhost:5173/login',
      '4. Verify the page shows the navy background with centered card',
    ],
    expectedResult: 'Redirected to login page with correct styling',
  },

  'TC2: Valid login with Admin credentials': {
    description: 'Admin user can login and access dashboard',
    credentials: { username: 'admin', password: 'admin@123' },
    steps: [
      '1. On login page, enter username: admin',
      '2. Enter password: admin@123',
      '3. Click "Đăng nhập"',
      '4. Wait for request to complete',
      '5. Verify you are redirected to /dashboard',
      '6. Verify header shows "Nguyễn Văn Admin" with "Admin" role badge (red)',
      '7. Verify sidebar shows "Quản lý người dùng" menu item (Admin only)',
    ],
    expectedResult: 'Successfully logged in, redirected to dashboard',
  },

  'TC3: Valid login with Manager credentials': {
    description: 'Manager user can login but cannot access /admin/users',
    credentials: { username: 'manager', password: 'manager@123' },
    steps: [
      '1. On login page, enter username: manager',
      '2. Enter password: manager@123',
      '3. Click "Đăng nhập"',
      '4. Verify header shows "Trần Thị Manager" with "Manager" role badge (blue)',
      '5. Verify sidebar does NOT show "Quản lý người dùng" menu item',
      '6. Try navigating to /admin/users manually in browser',
      '7. Verify you are silently redirected to /dashboard (no error shown)',
    ],
    expectedResult: 'Manager can login, but role-based access control blocks /admin/users',
  },

  'TC4: Invalid credentials (401 error)': {
    description: 'Wrong password shows error message',
    credentials: { username: 'admin', password: 'wrongpassword' },
    steps: [
      '1. On login page, enter username: admin',
      '2. Enter password: wrongpassword',
      '3. Click "Đăng nhập"',
      '4. Verify error alert appears above form',
      '5. Verify error message: "Tên đăng nhập hoặc mật khẩu không đúng."',
      '6. Verify password field is cleared',
      '7. Verify you are still on login page',
    ],
    expectedResult: 'Error message shown, password cleared, user stays on login page',
  },

  'TC5: Locked account (423 error)': {
    description: 'Locked account shows specific error and disables form',
    credentials: { username: 'locked', password: 'locked@123' },
    steps: [
      '1. On login page, enter username: locked',
      '2. Enter password: locked@123',
      '3. Click "Đăng nhập"',
      '4. Verify error alert: "Tài khoản đã bị khóa do đăng nhập sai nhiều lần..."',
      '5. Verify login button is permanently disabled (grayed out)',
      '6. Verify password field is cleared',
      '7. Try entering different credentials - button remains disabled',
    ],
    expectedResult: 'Account locked error shown, submit button disabled permanently',
  },

  'TC6: Login form validation': {
    description: 'Form validates empty fields and password minimum length',
    steps: [
      '1. On login page, leave both fields empty',
      '2. Click "Đăng nhập"',
      '3. Verify error: "Tên đăng nhập không được để trống"',
      '4. Enter username: admin',
      '5. Leave password empty and click "Đăng nhập"',
      '6. Verify error: "Mật khẩu phải có ít nhất 6 ký tự"',
      '7. Enter password with 5 chars (test1) and click "Đăng nhập"',
      '8. Verify error: "Mật khẩu phải có ít nhất 6 ký tự"',
    ],
    expectedResult: 'Form validation works correctly',
  },

  'TC7: Sidebar collapse/expand': {
    description: 'Sidebar can collapse and expand',
    prerequisites: 'Logged in as admin',
    steps: [
      '1. Click the menu toggle button (top-left of header)',
      '2. Verify sidebar collapses to 80px width (icon-only mode)',
      '3. Verify logo shows only "UAV" and subtitle is hidden',
      '4. Verify menu items show only icons',
      '5. Click toggle again',
      '6. Verify sidebar expands to 240px width',
      '7. Verify "UAV-PMS" and subtitle are visible',
    ],
    expectedResult: 'Sidebar collapse/expand works smoothly',
  },

  'TC8: Navigation menu': {
    description: 'Menu items navigate to correct routes',
    prerequisites: 'Logged in as admin',
    steps: [
      '1. Click "Tổng quan" menu item',
      '2. Verify URL is /dashboard',
      '3. Click "Quản lý người dùng" menu item',
      '4. Verify URL is /admin/users',
      '5. Verify menu item is highlighted (blue/amber color)',
      '6. Verify disabled items (Quản lý nhiệm vụ, etc.) have gray text',
    ],
    expectedResult: 'Navigation works and active menu item is highlighted',
  },

  'TC9: Logout functionality': {
    description: 'Logout clears auth state and redirects to login',
    prerequisites: 'Logged in as admin',
    steps: [
      '1. Click "Đăng xuất" button in header',
      '2. Verify URL changes to /login',
      '3. Verify login page is displayed',
      '4. Open browser DevTools → Application → LocalStorage',
      '5. Verify localStorage is cleared (no accessToken, refreshToken, user)',
      '6. Try navigating directly to /dashboard',
      '7. Verify you are redirected back to /login',
    ],
    expectedResult: 'Logout clears session and returns to login page',
  },

  'TC10: Admin-only access to /admin/users': {
    description: 'Only Admin role can access /admin/users',
    steps: [
      '1. Login as admin (admin@123)',
      '2. Click "Quản lý người dùng" menu item',
      '3. Verify you can see the page (currently shows placeholder)',
      '4. Logout and login as manager (manager@123)',
      '5. Try navigating to /admin/users directly',
      '6. Verify you are silently redirected to /dashboard',
      '7. Verify no error message is shown',
    ],
    expectedResult: 'Only Admin can access /admin/users, others are silently redirected',
  },

  'TC11: Protected routes while loading': {
    description: 'Show loading spinner while auth state is loading',
    steps: [
      '1. Open DevTools → Network tab',
      '2. Set network throttle to "Slow 3G"',
      '3. Refresh the page while logged out',
      '4. Verify a centered Spin loader appears briefly',
      '5. After loading completes, verify redirect to /login',
      '6. Reset network throttle to normal',
    ],
    expectedResult: 'Loading spinner shown during auth state initialization',
  },

  'TC12: User avatar and role badge': {
    description: 'Header displays user info with role badge',
    prerequisites: 'Logged in as admin',
    steps: [
      '1. Verify avatar in header shows initials (NV for Nguyễn Văn)',
      '2. Verify avatar background is amber (#F59E0B)',
      '3. Verify full name is displayed: "Nguyễn Văn Admin"',
      '4. Verify role badge shows "Admin" in red background',
      '5. Logout and login as manager',
      '6. Verify avatar initials are TT (Trần Thị)',
      '7. Verify role badge shows "Manager" in blue background',
    ],
    expectedResult: 'User avatar and role badge display correctly',
  },
};

export const MOCK_CREDENTIALS_FOR_TESTING = {
  admin: {
    username: 'admin',
    password: 'admin@123',
    expectedRole: 'Admin',
    expectedName: 'Nguyễn Văn Admin',
  },
  manager: {
    username: 'manager',
    password: 'manager@123',
    expectedRole: 'Manager',
    expectedName: 'Trần Thị Manager',
  },
  technician: {
    username: 'technician',
    password: 'tech@123',
    expectedRole: 'Technician',
    expectedName: 'Lê Văn Technician',
  },
  locked: {
    username: 'locked',
    password: 'locked@123',
    expectedStatus: 'Account locked',
  },
};
