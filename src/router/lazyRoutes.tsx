import { lazy } from 'react';

export const LoginPage = lazy(() => import('@pages/LoginPage'));
export const ForgotPasswordPage = lazy(() => import('@pages/ForgotPasswordPage'));
export const OtpPage = lazy(() => import('@pages/OtpPage'));
export const ResetPasswordPage = lazy(() => import('@pages/ResetPasswordPage'));
export const ChangePasswordPage = lazy(() => import('@pages/ChangePasswordPage'));
export const AssetManagementPage = lazy(() => import('@pages/AssetManagementPage'));
export const UserManagementPage = lazy(() => import('@pages/UserManagementPage'));
export const PrivateRoute = lazy(() => import('@router/guards/PrivateRoute'));
export const RoleGuard = lazy(() => import('@router/guards/RoleGuard'));
export const ComingSoonPage = lazy(() => import('@pages/ComingSoonPage'));
