import type { UserRole } from '@types';

export const ROLES: { [key: string]: UserRole } = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  TECHNICIAN: 'Technician',
  VIEWER: 'Viewer',
};

export const ROLE_LABELS: { [key in UserRole]: string } = {
  Admin: 'Quản trị viên',
  Manager: 'Quản lý',
  Technician: 'Kỹ thuật viên',
  Viewer: 'Người xem',
};

export const ROLE_COLORS: { [key in UserRole]: string } = {
  Admin: '#FF4D4F',
  Manager: '#1890FF',
  Technician: '#52C41A',
  Viewer: '#FAAD14',
};

export const ROLE_DESCRIPTIONS: { [key in UserRole]: string } = {
  Admin: 'Truy cập toàn bộ hệ thống',
  Manager: 'Quản lý nhiệm vụ và người dùng',
  Technician: 'Thực hiện kiểm tra và báo cáo',
  Viewer: 'Xem thông tin chỉ đọc',
};
