import { UserRole } from '../../models/auth.models';

/**
 * Role families used across the UI. The backend roles are SystemAdmin, Manager, Inspector, Analyst,
 * Technician and MaintenanceTechnician; older aliases (Admin, Administrator, Supervisor, Pilot) map onto them,
 * the same way `roleGuard` does.
 */
export type RoleFamily = 'admin' | 'manager' | 'inspector' | 'analyst' | 'technician' | 'other';

type RoleInput = UserRole | string | null | undefined;

export const roleFamily = (role: RoleInput): RoleFamily => {
  switch ((role ?? '').toString().trim().toLowerCase()) {
    case 'admin':
    case 'systemadmin':
    case 'administrator':
      return 'admin';
    case 'manager':
    case 'supervisor':
      return 'manager';
    case 'inspector':
    case 'pilot':
      return 'inspector';
    case 'analyst':
      return 'analyst';
    case 'technician':
    case 'maintenancetechnician':
      return 'technician';
    default:
      return 'other';
  }
};

/** SystemAdmin or Manager: plans missions, runs the command console, assigns and closes work. */
export const isManagerRole = (role: RoleInput): boolean => ['admin', 'manager'].includes(roleFamily(role));
export const isAdminRole = (role: RoleInput): boolean => roleFamily(role) === 'admin';
/** Flight crew (Inspector, Pilot): accepts missions, flies, uploads media. */
export const isInspectorRole = (role: RoleInput): boolean => roleFamily(role) === 'inspector';
/** Reviews AI detections and handles emergency alerts. */
export const isAnalystRole = (role: RoleInput): boolean => roleFamily(role) === 'analyst';
/** Technician or MaintenanceTechnician: drone technical checks and maintenance tickets. */
export const isTechnicianRole = (role: RoleInput): boolean => roleFamily(role) === 'technician';
/** Inspector, Analyst or Technician: works on assigned items rather than managing the system. */
export const isFieldRole = (role: RoleInput): boolean => ['inspector', 'analyst', 'technician'].includes(roleFamily(role));

const ROLE_LABELS: Record<RoleFamily, string> = {
  admin: 'Quản trị hệ thống',
  manager: 'Quản lý vận hành',
  inspector: 'Phi công / Inspector',
  analyst: 'Chuyên viên phân tích',
  technician: 'Kỹ thuật viên',
  other: 'Người dùng',
};

/** Vietnamese label for showing the signed-in user's role. */
export const roleLabel = (role: RoleInput): string => ROLE_LABELS[roleFamily(role)];
