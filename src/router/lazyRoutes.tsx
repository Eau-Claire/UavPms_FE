import { lazy } from 'react';

export const LoginPage = lazy(() => import('@pages/LoginPage'));
export const ChangePasswordPage = lazy(() => import('@pages/ChangePasswordPage'));
export const UserManagementPage = lazy(() => import('@pages/UserManagementPage'));
export const PrivateRoute = lazy(() => import('@components/common/PrivateRoute'));
export const RoleGuard = lazy(() => import('@components/common/RoleGuard'));
export const ComingSoonPage = lazy(() => import('@components/common/ComingSoonPage'));
