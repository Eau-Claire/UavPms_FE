import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./features/auth/pages/login/login').then((m) => m.Login), title: 'Sign in | UAV-PMS' },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/pages/forgot-password/forgot-password').then((m) => m.ForgotPassword), title: 'Forgot password | UAV-PMS' },
  { path: 'otp', loadComponent: () => import('./features/auth/pages/otp/otp').then((m) => m.Otp), title: 'Verify OTP | UAV-PMS' },
  { path: 'reset-password', loadComponent: () => import('./features/auth/pages/reset-password/reset-password').then((m) => m.ResetPassword), title: 'Reset password | UAV-PMS' },
  {
    path: '', canActivate: [authGuard], loadComponent: () => import('./core/layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/monitor/pages/dashboard/dashboard').then((m) => m.Dashboard), title: 'Monitoring dashboard | UAV-PMS' },
      { path: 'inspections', loadComponent: () => import('./features/monitor/pages/inspection-history/inspection-history').then((m) => m.InspectionHistory), title: 'Inspection history | UAV-PMS' },
      { path: 'change-password', loadComponent: () => import('./features/auth/pages/change-password/change-password').then((m) => m.ChangePassword), title: 'Change password | UAV-PMS' },
      { path: 'assets', loadComponent: () => import('./features/assets/pages/asset-management/asset-management').then((m) => m.AssetManagement), title: 'Asset management | UAV-PMS' },
      { path: 'admin/users', loadComponent: () => import('./features/users/pages/user-management/user-management').then((m) => m.UserManagement), title: 'User management | UAV-PMS' },
      { path: 'missions', loadComponent: () => import('./features/shared/pages/coming-soon/coming-soon').then((m) => m.ComingSoon), data: { title: 'Mission management' } },
      { path: 'reports', loadComponent: () => import('./features/shared/pages/coming-soon/coming-soon').then((m) => m.ComingSoon), data: { title: 'Reports and analytics' } },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
