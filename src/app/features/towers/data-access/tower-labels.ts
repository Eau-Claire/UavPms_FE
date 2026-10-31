import { AnomalyValidationStatus } from '../../../models/assets.models';
import { UserRole } from '../../../models/auth.models';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const ANOMALY_STATUSES: readonly AnomalyValidationStatus[] = ['Pending', 'Confirmed', 'Rejected', 'Resolved'];

const ANOMALY_LABELS: Record<string, string> = {
  Pending: 'Chờ duyệt',
  Confirmed: 'Đã xác nhận',
  Rejected: 'Đã bác bỏ',
  Resolved: 'Đã khắc phục',
};

const ANOMALY_TONES: Record<string, Tone> = { Pending: 'warning', Confirmed: 'danger', Rejected: 'neutral', Resolved: 'success' };

/** Same wording as the maintenance pages (features/maintenance/data-access/maintenance-labels.ts). */
const TICKET_STATUS_LABELS: Record<string, string> = {
  Open: 'Chờ xử lý',
  InProgress: 'Đang sửa chữa',
  PendingVerification: 'Chờ nghiệm thu',
  Resolved: 'Đã đóng',
  Closed: 'Đã đóng',
};

const TICKET_STATUS_TONES: Record<string, Tone> = {
  Open: 'warning', InProgress: 'info', PendingVerification: 'info', Resolved: 'success', Closed: 'neutral',
};

const PRIORITY_LABELS: Record<string, string> = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao', Emergency: 'Khẩn cấp' };
const PRIORITY_TONES: Record<string, Tone> = { Low: 'neutral', Medium: 'info', High: 'warning', Emergency: 'danger' };

export const anomalyStatusLabel = (status: string): string => ANOMALY_LABELS[status] ?? status;
export const anomalyStatusTone = (status: string): Tone => ANOMALY_TONES[status] ?? 'neutral';
export const ticketStatusLabel = (status: string): string => TICKET_STATUS_LABELS[status] ?? status;
export const ticketStatusTone = (status: string): Tone => TICKET_STATUS_TONES[status] ?? 'neutral';
export const ticketPriorityLabel = (priority: string): string => PRIORITY_LABELS[priority] ?? priority;
export const ticketPriorityTone = (priority: string): Tone => PRIORITY_TONES[priority] ?? 'neutral';

/** Backend rule (UserRoles.AdminAndManager): only SystemAdmin and Manager may create/update/delete/import towers. */
export const canManageInfrastructure = (role: UserRole | string | null | undefined): boolean =>
  ['admin', 'systemadmin', 'administrator', 'manager', 'supervisor'].includes((role ?? '').toLowerCase());

/** Roles that may open the AI review screen (/ai-review/:id). */
export const canReviewAnomalies = (role: UserRole | string | null | undefined): boolean =>
  ['admin', 'systemadmin', 'administrator', 'manager', 'supervisor', 'analyst'].includes((role ?? '').toLowerCase());
