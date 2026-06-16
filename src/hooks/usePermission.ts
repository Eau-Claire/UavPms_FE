import { useSelector } from 'react-redux';
import type { RootState } from '@store/store';
import type { UserRole } from '@types';

/**
 * Hook kiểm tra quyền hạn của người dùng hiện tại.
 *
 * Trả về **boolean trực tiếp** (không phải function) — dễ dùng trong JSX:
 *
 * @example
 * const { isAdmin, canManageUsers } = usePermission();
 *
 * // ✅ Đúng — isAdmin là boolean
 * if (isAdmin) { ... }
 * {isAdmin && <AdminPanel />}
 *
 * // ❌ Sai — isAdmin KHÔNG phải function
 * if (isAdmin()) { ... }
 */
export const usePermission = () => {
  const user = useSelector((state: RootState) => state.auth.user);

  /**
   * Kiểm tra user có vai trò cụ thể không.
   * Dùng cho kiểm tra vai trò động (truyền vào từ ngoài).
   *
   * @example
   * const { hasRole } = usePermission();
   * hasRole('Manager') // true/false
   */
  const hasRole = (role: UserRole): boolean => user?.role === role;

  const isAdmin = user?.role === 'Admin';
  const isAdminOrManager = user?.role === 'Admin' || user?.role === 'Manager';

  /** Admin mới có quyền thêm/sửa/xóa người dùng */
  const canManageUsers = isAdmin;

  return {
    hasRole,
    isAdmin,
    isAdminOrManager,
    canManageUsers,
  };
};
