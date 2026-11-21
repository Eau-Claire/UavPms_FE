import { AnomalyValidationStatus } from '../../../models/assets.models';
import { UserRole } from '../../../models/auth.models';
import { canAccess, ROUTE_ROLES } from '../../../core/auth/route-access';
import { isManagerRole } from '../../../core/auth/roles';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const ANOMALY_STATUSES: readonly AnomalyValidationStatus[] = ['Pending', 'Confirmed', 'Rejected', 'Resolved'];

const ANOMALY_LABELS: Record<string, string> = {
  Pending: 'Chờ duyệt',
  InReview: 'Chờ thẩm định',
  Confirmed: 'Đã xác nhận',
  Rejected: 'Đã bác bỏ',
  Dismissed: 'Đã bác bỏ',
  Resolved: 'Đã khắc phục',
};

const ANOMALY_TONES: Record<string, Tone> = {
  Pending: 'warning',
  InReview: 'warning',
  Confirmed: 'danger',
  Rejected: 'neutral',
  Dismissed: 'neutral',
  Resolved: 'success',
};

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

export const anomalyStatusLabel = (status: string): string => {
  if (!status) return '—';
  const raw = status.trim();
  if (ANOMALY_LABELS[raw]) return ANOMALY_LABELS[raw];
  const normalized = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (normalized === 'pending' || normalized === 'choduyet') return 'Chờ duyệt';
  if (normalized === 'inreview' || normalized === 'underreview' || normalized === 'chothamdinh' || normalized === 'review') return 'Chờ thẩm định';
  if (normalized === 'confirmed' || normalized === 'daxacnhan') return 'Đã xác nhận';
  if (normalized === 'rejected' || normalized === 'dismissed' || normalized === 'dabacbo') return 'Đã bác bỏ';
  if (normalized === 'resolved' || normalized === 'dakhacphuc' || normalized === 'closed') return 'Đã khắc phục';
  return raw;
};

export const anomalyStatusTone = (status: string): Tone => {
  if (!status) return 'neutral';
  const raw = status.trim();
  if (ANOMALY_TONES[raw]) return ANOMALY_TONES[raw];
  const normalized = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (normalized === 'pending') return 'warning';
  if (normalized === 'inreview' || normalized === 'underreview' || normalized === 'review') return 'warning';
  if (normalized === 'confirmed') return 'danger';
  if (normalized === 'rejected' || normalized === 'dismissed') return 'neutral';
  if (normalized === 'resolved' || normalized === 'closed') return 'success';
  return 'neutral';
};
export const ticketStatusLabel = (status: string): string => TICKET_STATUS_LABELS[status] ?? status;
export const ticketStatusTone = (status: string): Tone => TICKET_STATUS_TONES[status] ?? 'neutral';
export const ticketPriorityLabel = (priority: string): string => PRIORITY_LABELS[priority] ?? priority;
export const ticketPriorityTone = (priority: string): Tone => PRIORITY_TONES[priority] ?? 'neutral';

/** Backend rule (UserRoles.AdminAndManager): only SystemAdmin and Manager may create/update/delete/import towers. */
export const canManageInfrastructure = (role: UserRole | string | null | undefined): boolean => isManagerRole(role);

/** Roles that may open the AI review screen (/ai-review/:id). */
export const canReviewAnomalies = (role: UserRole | string | null | undefined): boolean => canAccess(role, ROUTE_ROLES.aiReview);

/** Roles that may open a maintenance ticket (/maintenance/:id). */
export const canOpenMaintenance = (role: UserRole | string | null | undefined): boolean => canAccess(role, ROUTE_ROLES.maintenance);
