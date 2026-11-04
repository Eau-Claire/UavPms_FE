import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth-guard';
import { guestGuard } from './core/auth/guest-guard';
import { roleGuard } from './core/auth/role-guard';
import { ROUTE_ROLES } from './core/auth/route-access';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/pages/login/login').then((m) => m.Login), title: 'Đăng nhập | UAV-PMS' },
  { path: 'forgot-password', canActivate: [guestGuard], loadComponent: () => import('./features/auth/pages/forgot-password/forgot-password').then((m) => m.ForgotPassword), title: 'Quên mật khẩu | UAV-PMS' },
  { path: 'otp', canActivate: [guestGuard], loadComponent: () => import('./features/auth/pages/otp/otp').then((m) => m.Otp), title: 'Xác thực OTP | UAV-PMS' },
  { path: 'reset-password', canActivate: [guestGuard], loadComponent: () => import('./features/auth/pages/reset-password/reset-password').then((m) => m.ResetPassword), title: 'Đặt lại mật khẩu | UAV-PMS' },
  {
    path: '', canActivate: [authGuard], loadComponent: () => import('./core/layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/monitor/pages/dashboard/dashboard').then((m) => m.Dashboard), title: 'Tổng quan giám sát | UAV-PMS' },
      { path: 'inspections', loadComponent: () => import('./features/monitor/pages/inspection-history/inspection-history').then((m) => m.InspectionHistory), title: 'Lịch sử kiểm tra | UAV-PMS' },
      { path: 'change-password', loadComponent: () => import('./features/auth/pages/change-password/change-password').then((m) => m.ChangePassword), title: 'Đổi mật khẩu | UAV-PMS' },
      { path: 'towers', loadComponent: () => import('./features/towers/pages/tower-list/tower-list').then((m) => m.TowerList), title: 'Quản lý cột điện | UAV-PMS' },
      { path: 'towers/:id', loadComponent: () => import('./features/towers/pages/tower-detail/tower-detail').then((m) => m.TowerDetail), title: 'Chi tiết cột điện | UAV-PMS' },
      { path: 'assets', pathMatch: 'full', redirectTo: 'towers' },
      { path: 'assets/:id', redirectTo: 'towers/:id' },
      { path: 'ai-analysis/upload', canActivate: [roleGuard(ROUTE_ROLES.aiAnalysis)], loadComponent: () => import('./features/ai-analysis/pages/standalone-upload/standalone-upload').then((m) => m.StandaloneUpload), title: 'Phân tích AI | UAV-PMS' },
      { path: 'ai-analysis', redirectTo: 'ai-analysis/upload' },
      { path: 'emergency-alerts', canActivate: [roleGuard(ROUTE_ROLES.emergencyAlerts)], loadComponent: () => import('./features/emergency-alerts/pages/emergency-alerts-review/emergency-alerts-review').then((m) => m.EmergencyAlertsReview), title: 'Cảnh Báo Khẩn Cấp Edge AI | UAV-PMS' },
      { path: 'alerts', redirectTo: 'emergency-alerts' },
      { path: 'ai-review', canActivate: [roleGuard(ROUTE_ROLES.aiReview)], loadComponent: () => import('./features/analyst-review/pages/detection-list/detection-list').then((m) => m.DetectionList), title: 'Duyệt sự cố AI | UAV-PMS' },
      { path: 'ai-review/:id', canActivate: [roleGuard(ROUTE_ROLES.aiReview)], loadComponent: () => import('./features/analyst-review/pages/detection-review/detection-review').then((m) => m.DetectionReview), title: 'Thẩm định phát hiện AI | UAV-PMS' },
      { path: 'maintenance', canActivate: [roleGuard(ROUTE_ROLES.maintenance)], loadComponent: () => import('./features/maintenance/pages/maintenance-list/maintenance-list').then((m) => m.MaintenanceList), title: 'Phiếu bảo trì | UAV-PMS' },
      { path: 'maintenance/:id', canActivate: [roleGuard(ROUTE_ROLES.maintenance)], loadComponent: () => import('./features/maintenance/pages/maintenance-detail/maintenance-detail').then((m) => m.MaintenanceDetail), title: 'Chi tiết phiếu bảo trì | UAV-PMS' },
      { path: 'gis', canActivate: [roleGuard(ROUTE_ROLES.gis)], loadComponent: () => import('./features/gis/pages/gis-monitoring/gis-monitoring').then((m) => m.GisMonitoring), title: 'Bản đồ GIS Lưới điện | UAV-PMS' },
      // Every role may read the fleet (`GET /drones`); the page hides write actions by role.
      { path: 'drones', loadComponent: () => import('./features/drones/pages/drone-management/drone-management').then((m) => m.DroneManagement), title: 'Quản lý phương tiện UAV | UAV-PMS' },
      { path: 'admin/drones', redirectTo: 'drones' },
      { path: 'admin/users', canActivate: [roleGuard(ROUTE_ROLES.administration)], loadComponent: () => import('./features/users/pages/user-management/user-management').then((m) => m.UserManagement), title: 'Quản lý người dùng | UAV-PMS' },
      { path: 'system/users', redirectTo: 'admin/users' },
      {
        path: 'system/audit-logs',
        canActivate: [roleGuard(ROUTE_ROLES.administration)],
        loadComponent: () => import('./features/audit/pages/audit-log-viewer/audit-log-viewer').then((m) => m.AuditLogViewer),
        title: 'Nhật ký hệ thống | UAV-PMS',
      },
      { path: 'admin/audit-logs', redirectTo: 'system/audit-logs' },
      { path: 'audit-logs', redirectTo: 'system/audit-logs' },
      { path: 'missions/create', pathMatch: 'full', redirectTo: 'missions/new' },
      { path: 'pre-mission', canActivate: [roleGuard(ROUTE_ROLES.preMission)], loadComponent: () => import('./features/pre-mission/pages/assessment-list/assessment-list').then((m) => m.AssessmentList), title: 'Đánh giá tiền bay | UAV-PMS' },
      { path: 'pre-mission/create', pathMatch: 'full', redirectTo: 'pre-mission/new' },
      { path: 'pre-mission/new', canActivate: [roleGuard(ROUTE_ROLES.planning)], loadComponent: () => import('./features/pre-mission/pages/assessment-create/assessment-create').then((m) => m.AssessmentCreate), title: 'Tạo đánh giá | UAV-PMS' },
      { path: 'pre-mission/:id', canActivate: [roleGuard(ROUTE_ROLES.preMission)], loadComponent: () => import('./features/pre-mission/pages/assessment-workspace/assessment-workspace').then((m) => m.AssessmentWorkspace), title: 'Không gian đánh giá | UAV-PMS' },
      { path: 'missions/new', canActivate: [roleGuard(ROUTE_ROLES.planning)], loadComponent: () => import('./features/missions/pages/mission-create/mission-create').then((m) => m.MissionCreate), title: 'Tạo nhiệm vụ | UAV-PMS' },
      { path: 'missions/:id/inspector', canActivate: [roleGuard(ROUTE_ROLES.missionAssignee)], loadComponent: () => import('./features/missions/pages/mission-inspector/mission-inspector').then((m) => m.MissionInspector), title: 'Tiếp nhận nhiệm vụ | UAV-PMS' },
      { path: 'missions/:id', loadComponent: () => import('./features/missions/pages/mission-detail/mission-detail').then((m) => m.MissionDetail), title: 'Chi tiết nhiệm vụ | UAV-PMS' },
      { path: 'missions', loadComponent: () => import('./features/missions/pages/mission-list/mission-list').then((m) => m.MissionList), title: 'Quản lý nhiệm vụ | UAV-PMS' },
      { path: 'reports', loadComponent: () => import('./features/reports/pages/reports-page/reports-page').then((m) => m.ReportsPage), title: 'Báo cáo & Phân tích | UAV-PMS' },
      { path: '403', loadComponent: () => import('./features/shared/pages/forbidden/forbidden').then((m) => m.Forbidden), title: '403 Quyền truy cập bị từ chối | UAV-PMS' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
