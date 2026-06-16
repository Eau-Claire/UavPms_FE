import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/store';
import type { UserRole } from '@types';
import { ROUTES } from '@constants/routes';

interface RoleGuardProps {
  requiredRole?: UserRole;
  children: React.ReactNode;
}

/**
 * Role-based access control wrapper.
 * Checks user role without rendering AppLayout (AppLayout is rendered by root PrivateRoute).
 *
 * @example
 * <RoleGuard requiredRole="Admin">
 *   <UserManagementPage />
 * </RoleGuard>
 */
const RoleGuard = ({ requiredRole, children }: RoleGuardProps) => {
  const auth = useSelector((state: RootState) => state.auth);

  if (requiredRole && auth.user?.role !== requiredRole) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
