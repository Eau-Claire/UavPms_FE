import { AppNotification } from '../../../models/notification.models';
import { UserRole } from '../../../models/auth.models';
import { canAccess, ROUTE_ROLES } from '../../auth/route-access';
import { isFieldRole } from '../../auth/roles';

export interface NotificationLink {
  readonly commands: readonly string[];
  readonly queryParams?: Record<string, string>;
  readonly label: string;
}

type RoleInput = UserRole | string | null | undefined;
type NotificationRef = Pick<AppNotification, 'type' | 'referenceType' | 'referenceId'>;

/** Mission notification types that ask the recipient to accept the assignment (`MissionLifecycleService.Notify`). */
const ACCEPTANCE_TYPES = new Set(['MISSION_ASSIGNED', 'MISSION_ASSIGNMENT', 'MISSION_DISPATCH', 'MISSION_DISPATCHED', 'MISSION_REMINDER']);

const REFERENCE_LABELS: Record<string, string> = {
  mission: 'Nhiệm vụ',
  maintenanceticket: 'Phiếu bảo trì',
  detectedanomaly: 'Phát hiện AI',
  emergencyalert: 'Cảnh báo khẩn cấp',
};

const normalize = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

/** Vietnamese name of the item a notification refers to (the backend sends "Mission", "MISSION", "MaintenanceTicket"...). */
export const referenceTypeLabel = (referenceType: string | null | undefined): string =>
  REFERENCE_LABELS[normalize(referenceType)] ?? (referenceType?.trim() || 'Mục liên quan');

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/**
 * Where "open" on a notification should go for this role, or `null` when there is no page the role may open
 * (so the header never links to the 403 page).
 */
export const notificationLink = (notification: NotificationRef, role: RoleInput): NotificationLink | null => {
  const rawId = notification.referenceId?.trim();
  const id = rawId && rawId !== EMPTY_GUID ? rawId : undefined;
  const refType = normalize(notification.referenceType);
  const type = (notification.type ?? '').trim().toUpperCase();

  switch (refType) {
    case 'mission': {
      if (!id) return null;
      const needsAcceptance = ACCEPTANCE_TYPES.has(type);
      if (needsAcceptance && isFieldRole(role) && canAccess(role, ROUTE_ROLES.missionAssignee)) {
        return { commands: ['/missions', id, 'inspector'], label: 'Tiếp nhận nhiệm vụ' };
      }
      return { commands: ['/missions', id], label: 'Đến trang nhiệm vụ' };
    }
    case 'maintenanceticket':
    case 'maintenance':
      if (!canAccess(role, ROUTE_ROLES.maintenance)) return null;
      return id ? { commands: ['/maintenance', id], label: 'Mở phiếu bảo trì' } : { commands: ['/maintenance'], label: 'Mở danh sách phiếu bảo trì' };
    case 'detectedanomaly':
    case 'anomaly':
    case 'defect':
      if (!canAccess(role, ROUTE_ROLES.aiReview)) return null;
      return id
        ? { commands: ['/ai-review', id], label: 'Thẩm định phát hiện AI' }
        : { commands: ['/ai-review'], label: 'Mở danh sách duyệt khuyết tật' };
    case 'emergencyalert':
    case 'alert':
      return canAccess(role, ROUTE_ROLES.emergencyAlerts)
        ? {
            commands: ['/emergency-alerts'],
            queryParams: id ? { id } : undefined,
            label: 'Mở cảnh báo khẩn cấp',
          }
        : null;
    default:
      return null;
  }
};
