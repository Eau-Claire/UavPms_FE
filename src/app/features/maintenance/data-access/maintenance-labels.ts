import { UserRole } from '../../../models/auth.models';
import { priorityLabel, statusLabel, statusTone } from '../../../shared/status/status';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const maintenanceStatusLabel = (status: string): string => (status ? statusLabel(status) : '—');
export const maintenanceStatusTone = (status: string): Tone => (status ? statusTone(status) : 'neutral');
export const maintenancePriorityLabel = (priority: string): string => (priority ? priorityLabel(priority) : '—');
export const maintenancePriorityTone = (priority: string): Tone => {
  const key = (priority || '').toUpperCase();
  if (key === 'EMERGENCY' || key === 'CRITICAL') return 'danger';
  if (key === 'HIGH') return 'warning';
  if (key === 'MEDIUM') return 'info';
  return 'neutral';
};

export const isClosedStatus = (status: string): boolean => status === 'Closed' || status === 'Resolved';

const roleOf = (role: UserRole | string | null | undefined): string => (role ?? '').toLowerCase();

/** Backend UserRoles.AdminAndManager: assign, close, list all tickets, list technicians. */
export const isMaintenanceManager = (role: UserRole | string | null | undefined): boolean =>
  ['admin', 'systemadmin', 'administrator', 'manager', 'supervisor'].includes(roleOf(role));

/** Technician / MaintenanceTechnician: GET /maintenance/tickets/my; may work only on their own tickets. */
export const isMaintenanceTechnician = (role: UserRole | string | null | undefined): boolean =>
  ['technician', 'maintenancetechnician'].includes(roleOf(role));
