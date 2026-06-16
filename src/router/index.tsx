import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import LoginPage from '@pages/LoginPage';
import ChangePasswordPage from '@pages/ChangePasswordPage';
import UserManagementPage from '@pages/UserManagementPage';
import PrivateRoute from '@components/common/PrivateRoute';
import RoleGuard from '@components/common/RoleGuard';
import ComingSoonPage from '@components/common/ComingSoonPage';

export const router = createBrowserRouter([
  {
    path: ROUTES.ROOT,
    element: <Navigate to={ROUTES.LOGIN} replace />,
  },
  {
    path: ROUTES.LOGIN,
    element: <LoginPage />,
  },
  {
    element: <PrivateRoute />,
    children: [
      {
        path: ROUTES.CHANGE_PASSWORD,
        element: <ChangePasswordPage />,
      },
      {
        path: ROUTES.DASHBOARD,
        element: <ComingSoonPage title="Tổng quan" />,
      },
      {
        path: ROUTES.ADMIN_USERS,
        element: (
          <RoleGuard requiredRole="Admin">
            <UserManagementPage />
          </RoleGuard>
        ),
      },
      {
        path: ROUTES.ADMIN_TASKS,
        element: <ComingSoonPage title="Quản lý nhiệm vụ" />,
      },
      {
        path: ROUTES.INSPECTION,
        element: <ComingSoonPage title="Kiểm tra lưới điện" />,
      },
      {
        path: ROUTES.MAINTENANCE,
        element: <ComingSoonPage title="Bảo trì" />,
      },
      {
        path: ROUTES.ANALYTICS,
        element: <ComingSoonPage title="Phân tích" />,
      },
    ],
  },
]);
