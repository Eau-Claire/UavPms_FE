import type { UserStatus } from '@types';

/**
 * Label tiếng Việt cho từng trạng thái tài khoản.
 * Dùng thay cho hardcode string trong component.
 */
export const STATUS_LABELS: Record<UserStatus, string> = {
  Active: 'Hoạt động',
  Inactive: 'Không hoạt động',
  Locked: 'Đã khóa',
};

/**
 * Màu Ant Design Tag cho từng trạng thái.
 * Nhận tên màu Ant Design (green, orange, red) hoặc hex.
 */
export const STATUS_COLORS: Record<UserStatus, string> = {
  Active: 'green',
  Inactive: 'orange',
  Locked: 'red',
};
