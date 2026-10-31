import { UserRole } from '../../models/auth.models';
import { roleFamily } from './roles';

type RoleInput = UserRole | string | null | undefined;

/**
 * Roles allowed on each guarded page. `app.routes.ts` uses these lists in `roleGuard`, and links/menus use
 * `canAccess` with the same lists, so the UI never shows a link that ends on the 403 page.
 * The lists mirror the backend `[Authorize(Roles = ...)]` of the API each page depends on.
 */
export const ROUTE_ROLES = {
  /** `/ai-review`, `/ai-review/:id`: anomaly review (`AnomaliesController`). */
  aiReview: ['Admin', 'Manager', 'Analyst'],
  /** `/ai-analysis/upload`: standalone AI analysis. */
  aiAnalysis: ['Admin', 'Manager', 'Analyst'],
  /** `/emergency-alerts`: `GET /alerts*` is SystemAdmin, Manager, Analyst. */
  emergencyAlerts: ['Admin', 'Manager', 'Analyst'],
  /** `/maintenance`, `/maintenance/:id`. */
  maintenance: ['Admin', 'Manager', 'Technician', 'MaintenanceTechnician'],
  /** `/gis`: `GET /gis/infrastructure` allows every role. */
  gis: ['Admin', 'Manager', 'Analyst', 'Inspector', 'Technician', 'MaintenanceTechnician'],
  /** `/pre-mission`, `/pre-mission/:id`: `GET /pre-mission-assessments*` (Analyst gets 403). */
  preMission: ['Admin', 'Manager', 'Inspector', 'Technician', 'MaintenanceTechnician'],
  /** `/pre-mission/new`, `/missions/new`. */
  planning: ['Admin', 'Manager'],
  /** `/missions/:id/inspector`: assignee view for field roles. */
  missionAssignee: ['Inspector', 'Analyst', 'Technician', 'MaintenanceTechnician'],
  /** `/admin/users`, `/system/audit-logs`. */
  administration: ['Admin', 'SystemAdmin', 'Manager'],
} as const satisfies Record<string, readonly UserRole[]>;

/**
 * True when `role` matches one of `allowed`, with the same alias rules as `roleGuard`
 * (Admin = SystemAdmin = Administrator, Manager = Supervisor, Inspector = Pilot, Technician = MaintenanceTechnician).
 */
export const canAccess = (role: RoleInput, allowed: readonly (UserRole | string)[]): boolean => {
  const family = roleFamily(role);
  const raw = (role ?? '').toString().trim().toLowerCase();
  if (!raw) return false;
  return allowed.some((target) => {
    const targetFamily = roleFamily(target);
    return targetFamily === 'other' ? target.toLowerCase() === raw : targetFamily === family;
  });
};
