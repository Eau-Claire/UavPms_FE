import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Spin } from 'antd';
import type { RootState } from '@store/store';
import type { UserRole } from '@shared/types';
import { ROUTES } from '@router/routes';
import AppLayout from '@components/AppLayout';

interface PrivateRouteProps {
  requiredRole?: UserRole;
}

const PrivateRoute = ({ requiredRole }: PrivateRouteProps) => {
  const location = useLocation();
  const auth = useSelector((state: RootState) => state.auth);
  const isChangePasswordPage = location.pathname === ROUTES.CHANGE_PASSWORD;

  if (auth.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
  }

  if (auth.user?.mustChangePassword && !isChangePasswordPage) {
    return <Navigate to={ROUTES.CHANGE_PASSWORD} replace />;
  }

  if (!auth.user?.mustChangePassword && isChangePasswordPage) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  if (requiredRole && auth.user?.role !== requiredRole) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  if (isChangePasswordPage) {
    return <Outlet />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
};

export default PrivateRoute;
