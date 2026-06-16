import type { User } from '@types';
import { mockUserStore } from './mockUserStore';

/**
 * Dữ liệu người dùng mock cho môi trường development.
 *
 * Tài khoản test:
 * | Username    | Password      | Role       | Status  |
 * |-------------|---------------|------------|---------|
 * | admin       | admin@123     | Admin      | Active  |
 * | manager     | manager@123   | Manager    | Active  |
 * | technician  | tech@123      | Technician | Active  |
 * | locked      | locked@123    | Viewer     | Locked  |
 */
export { mockUserStore, type MockUserRecord } from './mockUserStore';

/** @deprecated Dùng mockUserStore.findByUsername thay thế */
export const MOCK_USERS = mockUserStore;

/** Danh sách user mock KHÔNG có password — dùng trong UI */
export const MOCK_USERS_LIST: User[] = mockUserStore.getAll();

/** Credentials hợp lệ dùng cho testing */
export const MOCK_VALID_CREDENTIALS = [
  { username: 'admin', password: 'admin@123' },
  { username: 'manager', password: 'manager@123' },
  { username: 'technician', password: 'tech@123' },
];

/** Credentials sai dùng để test trường hợp 401 */
export const MOCK_INVALID_CREDENTIALS = [
  { username: 'admin', password: 'wrongpassword' },
  { username: 'nonexistent', password: 'password@123' },
];

/** Tài khoản bị khóa dùng để test trường hợp 423 */
export const MOCK_LOCKED_ACCOUNT = { username: 'locked', password: 'locked@123' };
