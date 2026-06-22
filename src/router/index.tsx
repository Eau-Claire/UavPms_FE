import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ROUTES } from '@router/routes';
import {
  AssetManagementPage,
  ChangePasswordPage,
  ComingSoonPage,
  ForgotPasswordPage,
  LoginPage,
  OtpPage,
  PrivateRoute,
  ResetPasswordPage,
  RoleGuard,
  UserManagementPage,
} from './lazyRoutes';

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<div className="min-h-screen" />}>{element}</Suspense>
);

export const router = createBrowserRouter([
  {
    path: ROUTES.ROOT,
    element: <Navigate to={ROUTES.LOGIN} replace />,
  },
  {
    path: ROUTES.LOGIN,
    element: withSuspense(<LoginPage />),
  },
  {
    path: ROUTES.FORGOT_PASSWORD,
    element: withSuspense(<ForgotPasswordPage />),
  },
  {
    path: ROUTES.OTP,
    element: withSuspense(<OtpPage />),
  },
  {
    path: ROUTES.RESET_PASSWORD,
    element: withSuspense(<ResetPasswordPage />),
  },
  {
    element: withSuspense(<PrivateRoute />),
    children: [
      {
        path: ROUTES.CHANGE_PASSWORD,
        element: withSuspense(<ChangePasswordPage />),
      },
      {
        path: ROUTES.DASHBOARD,
        element: withSuspense(<ComingSoonPage title="Tổng quan" />),
      },
      {
        path: ROUTES.ASSETS,
        element: withSuspense(<AssetManagementPage />),
      },
      {
        path: ROUTES.ADMIN_USERS,
        element: (
          withSuspense(
            <RoleGuard requiredRole="Admin">
              <UserManagementPage />
            </RoleGuard>,
          )
        ),
      },
      {
        path: ROUTES.ADMIN_TASKS,
        element: withSuspense(<ComingSoonPage title="Quản lý nhiệm vụ" />),
      },
      {
        path: ROUTES.INSPECTION,
        element: withSuspense(<ComingSoonPage title="Kiểm tra lưới điện" />),
      },
      {
        path: ROUTES.MAINTENANCE,
        element: withSuspense(<ComingSoonPage title="Bảo trì" />),
      },
      {
        path: ROUTES.ANALYTICS,
        element: withSuspense(<ComingSoonPage title="Phân tích" />),
      },
    ],
  },
]);
