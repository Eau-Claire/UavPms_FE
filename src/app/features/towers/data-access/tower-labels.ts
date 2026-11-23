import { AnomalyValidationStatus } from '../../../models/assets.models';
import { UserRole } from '../../../models/auth.models';
import { canAccess, ROUTE_ROLES } from '../../../core/auth/route-access';
import { isManagerRole } from '../../../core/auth/roles';
import { priorityLabel, statusLabel, statusTone } from '../../../shared/status/status';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const ANOMALY_STATUSES: readonly AnomalyValidationStatus[] = ['Pending', 'InReview', 'Confirmed', 'Rejected', 'Resolved'];

export const anomalyStatusLabel = (status: string): string => (status ? statusLabel(status) : '—');
export const anomalyStatusTone = (status: string): Tone => (status ? statusTone(status) : 'neutral');
export const ticketStatusLabel = (status: string): string => (status ? statusLabel(status) : '—');
export const ticketStatusTone = (status: string): Tone => (status ? statusTone(status) : 'neutral');
export const ticketPriorityLabel = (priority: string): string => (priority ? priorityLabel(priority) : '—');
export const ticketPriorityTone = (priority: string): Tone => {
  const key = (priority || '').toUpperCase();
  if (key === 'EMERGENCY' || key === 'CRITICAL') return 'danger';
  if (key === 'HIGH') return 'warning';
  if (key === 'MEDIUM') return 'info';
  return 'neutral';
};

/** Backend rule (UserRoles.AdminAndManager): only SystemAdmin and Manager may create/update/delete/import towers. */
export const canManageInfrastructure = (role: UserRole | string | null | undefined): boolean => isManagerRole(role);

/** Roles that may open the AI review screen (/ai-review/:id). */
export const canReviewAnomalies = (role: UserRole | string | null | undefined): boolean => canAccess(role, ROUTE_ROLES.aiReview);

/** Roles that may open a maintenance ticket (/maintenance/:id). */
export const canOpenMaintenance = (role: UserRole | string | null | undefined): boolean => canAccess(role, ROUTE_ROLES.maintenance);
