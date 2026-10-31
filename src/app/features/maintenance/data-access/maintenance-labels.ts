import { UserRole } from '../../../models/auth.models';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_LABELS: Record<string, string> = {
  Open: 'Chờ xử lý',
  InProgress: 'Đang sửa chữa',
  PendingVerification: 'Chờ nghiệm thu',
  Resolved: 'Đã đóng',
  Closed: 'Đã đóng',
};

const STATUS_TONES: Record<string, Tone> = {
  Open: 'warning',
  InProgress: 'info',
  PendingVerification: 'info',
  Resolved: 'success',
  Closed: 'success',
};

const PRIORITY_LABELS: Record<string, string> = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao', Emergency: 'Khẩn cấp' };
const PRIORITY_TONES: Record<string, Tone> = { Low: 'neutral', Medium: 'info', High: 'warning', Emergency: 'danger' };

export const maintenanceStatusLabel = (status: string): string => STATUS_LABELS[status] ?? status;
export const maintenanceStatusTone = (status: string): Tone => STATUS_TONES[status] ?? 'neutral';
export const maintenancePriorityLabel = (priority: string): string => PRIORITY_LABELS[priority] ?? priority;
export const maintenancePriorityTone = (priority: string): Tone => PRIORITY_TONES[priority] ?? 'neutral';

export const isClosedStatus = (status: string): boolean => status === 'Closed' || status === 'Resolved';

const roleOf = (role: UserRole | string | null | undefined): string => (role ?? '').toLowerCase();

/** Backend UserRoles.AdminAndManager: assign, close, list all tickets, list technicians. */
export const isMaintenanceManager = (role: UserRole | string | null | undefined): boolean =>
  ['admin', 'systemadmin', 'administrator', 'manager', 'supervisor'].includes(roleOf(role));

/** Technician / MaintenanceTechnician: GET /maintenance/tickets/my; may work only on their own tickets. */
export const isMaintenanceTechnician = (role: UserRole | string | null | undefined): boolean =>
  ['technician', 'maintenancetechnician'].includes(roleOf(role));
