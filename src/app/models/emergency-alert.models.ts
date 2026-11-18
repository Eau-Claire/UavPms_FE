/** Emergency alert lifecycle (api_spec Module 8): Active → Confirmed / Dismissed / Escalated. */
export type AlertStatus = 'Active' | 'Confirmed' | 'Dismissed' | 'Escalated';
export type AlertPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export const ALERT_STATUSES: readonly AlertStatus[] = ['Active', 'Confirmed', 'Dismissed', 'Escalated'];

export interface AlertBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** True when x/y/width/height are percentages of the image (0..100). */
  readonly isNormalized: boolean;
}

export interface AlertLocation {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly towerCode: string;
}

export interface AlertEvidence {
  readonly mediaUrl: string | null;
  readonly boundingBox: AlertBoundingBox | null;
  /** 0..100 */
  readonly confidenceScore: number | null;
}

/** Item of `GET /alerts/active` (raw array, not wrapped in ApiResponse). */
export interface ActiveEmergencyAlert {
  readonly id: string;
  readonly anomalyId: string;
  readonly towerId: string | null;
  readonly towerCode: string;
  readonly alertType: string;
  readonly categoryName: string;
  readonly priority: AlertPriority;
  readonly status: AlertStatus;
  readonly deliveryLatencySeconds: number;
  readonly triggeredAt: string;
  readonly location: AlertLocation;
  readonly evidence: AlertEvidence;
}

/** Item of `GET /alerts?status&page&pageSize`. */
export interface EmergencyAlertHistoryItem {
  readonly id: string;
  readonly towerCode: string;
  readonly alertType: string;
  readonly priority: AlertPriority;
  readonly status: AlertStatus;
  readonly triggeredAt: string;
  readonly resolvedAt: string | null;
  readonly reviewedBy: string | null;
  readonly notes: string | null;
}

/** `GET /alerts?status&page&pageSize` (raw `{ totalCount, page, pageSize, items }`). */
export interface EmergencyAlertHistoryPage {
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly items: readonly EmergencyAlertHistoryItem[];
}

/** `POST /alerts/{id}/escalate` response (201, raw) and items of the detail's escalation history. */
export interface AlertEscalation {
  readonly id: string;
  readonly escalatedBy: string;
  readonly escalatedByName: string;
  readonly escalatedTo: string;
  readonly escalatedToName: string;
  readonly reason: string;
  readonly escalatedAt: string;
}

/** `GET /alerts/{id}` (raw). */
export interface EmergencyAlertDetail extends ActiveEmergencyAlert {
  readonly missionId: string | null;
  readonly receivedAt: string | null;
  readonly resolvedAt: string | null;
  readonly reviewedByUserId: string | null;
  readonly reviewedByName: string | null;
  readonly notes: string | null;
  readonly escalations: readonly AlertEscalation[];
}

export interface AlertHistoryQuery {
  readonly status?: AlertStatus | '';
  readonly page?: number;
  readonly pageSize?: number;
}

/** `PUT /alerts/{id}/review` body (204). */
export interface ReviewAlertPayload {
  readonly status: 'Confirmed' | 'Dismissed';
  readonly notes: string;
}

/** `POST /alerts/{id}/escalate` body. */
export interface EscalateAlertPayload {
  readonly escalatedToUserId: string;
  readonly reason: string;
}

/** `POST /alerts/trigger` body (all optional; priority defaults to Critical). */
export interface TriggerAlertPayload {
  readonly anomalyId?: string;
  readonly missionId?: string;
  readonly towerId?: string;
  readonly towerCode?: string;
  readonly priority?: AlertPriority;
  readonly latitude?: number;
  readonly longitude?: number;
}

/** A user an alert can be escalated to. */
export interface EscalationTarget {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: string;
}

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  Active: 'Đang hoạt động',
  Confirmed: 'Đã xác nhận',
  Dismissed: 'Đã bác bỏ',
  Escalated: 'Đã chuyển cấp',
};

export const ALERT_PRIORITY_LABELS: Record<AlertPriority, string> = {
  Critical: 'Nghiêm trọng',
  High: 'Cao',
  Medium: 'Trung bình',
  Low: 'Thấp',
};
