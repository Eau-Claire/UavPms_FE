export type MissionPriority = 'NORMAL' | 'HIGH' | 'EMERGENCY' | string;

export type InspectionObjective =
  | 'PERIODIC_INSPECTION'
  | 'TARGETED_REINSPECTION'
  | 'INCIDENT_FOLLOW_UP'
  | 'EMERGENCY_INSPECTION'
  | string;

export const PRIORITY_DEFECT_CATEGORIES = [
  { key: 'Insulator', label: 'Khuyết tật cách điện (Insulator defects)' },
  { key: 'Conductor', label: 'Khuyết tật dây dẫn (Conductor defects)' },
  { key: 'SurgeArrester', label: 'Chống sét van (Surge arrester defects)' },
  { key: 'ForeignObject', label: 'Tổ chim / Dị vật (Foreign objects)' },
  { key: 'TowerCorrosion', label: 'Ăn mòn cột (Tower corrosion)' },
  { key: 'Other', label: 'Khác (Other)' },
] as const;

/** Trạng thái nhiệm vụ đúng như backend trả về (`MissionStatus.ToString()`). */
export type MissionStatus =
  | 'Draft'
  | 'PendingAcceptance'
  | 'Assigned'
  | 'Preparing'
  | 'Ready'
  | 'InProgress'
  | 'Suspended'
  | 'Postponed'
  | 'Completed'
  | 'Cancelled'
  | string;

export const MISSION_STATUSES: readonly MissionStatus[] = [
  'Draft',
  'PendingAcceptance',
  'Assigned',
  'Preparing',
  'Ready',
  'InProgress',
  'Suspended',
  'Postponed',
  'Completed',
  'Cancelled',
];

const MISSION_STATUS_LABELS: Record<string, string> = {
  Draft: 'Bản nháp',
  PendingAcceptance: 'Chờ thành viên tiếp nhận',
  Assigned: 'Đã tiếp nhận',
  Preparing: 'Đang chuẩn bị',
  Ready: 'Sẵn sàng bay',
  InProgress: 'Đang bay khảo sát',
  Suspended: 'Tạm đình chỉ',
  Postponed: 'Tạm hoãn',
  Completed: 'Đã hoàn thành',
  Cancelled: 'Đã hủy',
};

export function missionStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeMissionStatus(status);
  return MISSION_STATUS_LABELS[normalized] ?? normalized;
}

/**
 * Chuẩn hóa trạng thái nhiệm vụ về giá trị của backend.
 * Một số sự kiện realtime vẫn gửi dạng `PENDING_CONFIRMATION`, `CONFIRMED`, `Executing`...
 */
export function normalizeMissionStatus(status: string | null | undefined): MissionStatus {
  const raw = String(status ?? '').trim();
  const key = raw.replace(/[\s_-]/g, '').toUpperCase();
  switch (key) {
    case '':
    case 'DRAFT':
    case 'PENDING':
      return 'Draft';
    case 'PENDINGACCEPTANCE':
    case 'PENDINGCONFIRMATION':
      return 'PendingAcceptance';
    case 'ASSIGNED':
    case 'CONFIRMED':
    case 'RESUMED':
      return 'Assigned';
    case 'PREPARING':
      return 'Preparing';
    case 'READY':
      return 'Ready';
    case 'INPROGRESS':
    case 'EXECUTING':
    case 'STARTED':
      return 'InProgress';
    case 'SUSPENDED':
      return 'Suspended';
    case 'POSTPONED':
      return 'Postponed';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
    case 'CANCELED':
      return 'Cancelled';
    default:
      return raw;
  }
}

/** Ánh xạ mục tiêu kiểm tra từ backend (`PeriodicInspection`) sang mã FE (`PERIODIC_INSPECTION`). */
export function normalizeObjective(value: unknown): InspectionObjective {
  const key = String(value ?? '').replace(/[\s_-]/g, '').toUpperCase();
  if (key.includes('TARGETED') || key.includes('REINSPECTION')) return 'TARGETED_REINSPECTION';
  if (key.includes('INCIDENT') || key.includes('FOLLOWUP')) return 'INCIDENT_FOLLOW_UP';
  if (key.includes('EMERGENCY')) return 'EMERGENCY_INSPECTION';
  return 'PERIODIC_INSPECTION';
}

export interface MissionCommunicationLog {
  readonly id: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly senderRole: 'MANAGER' | 'INSPECTOR' | 'SYSTEM';
  readonly type: 'DISPATCH' | 'CONFIRM' | 'POSTPONE' | 'SUSPEND' | 'RESUME' | 'CANCEL' | 'REMINDER' | 'MESSAGE' | 'START' | 'COMPLETE';
  readonly content: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}

/** Vai trò phân công trong nhiệm vụ (`assignmentRole`). */
export type MissionOperationalRole = 'INSPECTOR' | 'ANALYST' | 'TECHNICIAN' | 'PILOT' | 'CO_PILOT' | 'OBSERVER' | string;

export type AssignmentResponseStatus = 'PENDING' | 'ACCEPTED' | 'POSTPONED' | 'REPLACED' | 'CANCELLED' | string;

/** `GET /missions/{id}/assignments` (`MissionAssignmentsOverviewDto`). */
export interface MissionAssignmentsOverview {
  readonly missionId: string;
  readonly totalRequiredCount: number;
  readonly confirmedCount: number;
  readonly allConfirmed: boolean;
  readonly confirmationDeadline?: string | null;
  readonly assignments: readonly MissionAssignment[];
}

/** `GET /missions/{id}/detections` (`MissionDetectionDto`). */
export interface MissionBackendDetection {
  readonly id: string;
  readonly missionId: string;
  readonly mediaId?: string;
  readonly title: string;
  readonly confidence: number;
  readonly categoryCode?: string;
  readonly severityWeight?: number;
  readonly isEmergency?: boolean;
  readonly status: 'Pending' | 'Approved' | 'Rejected' | string;
  readonly boundingBox?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly timestampSeconds?: number | null;
  readonly timestampLabel?: string;
  readonly frameIndex?: number | null;
  readonly imageUrl?: string;
  readonly sourceUrl?: string;
  readonly towerId?: string;
  readonly tower?: string;
  readonly gps?: string;
  readonly description?: string;
  readonly detectedAt?: string;
  readonly reviewedByUserId?: string | null;
  readonly reviewedAt?: string | null;
  readonly reviewNotes?: string | null;
}

/** `GET /missions/{id}/maintenance-tasks` (`MissionMaintenanceTaskDto`). */
export interface MissionBackendMaintenanceTask {
  readonly id: string;
  readonly missionId: string;
  readonly detectionId?: string;
  readonly title: string;
  readonly priority: 'Urgent' | 'High' | 'Medium' | 'Low' | string;
  readonly towerCode?: string;
  readonly defectDescription?: string;
  readonly suggestedAction?: string;
  readonly status: 'Pending' | 'Approved' | 'InProgress' | 'Completed' | string;
  readonly assignedTeam?: string;
  readonly createdAt?: string;
}

/** `GET /missions/{id}/activities` (`MissionActivityDto`). */
export interface MissionBackendActivity {
  readonly id: string;
  readonly missionId: string;
  readonly senderUserId?: string;
  readonly senderName: string;
  readonly senderRole: 'MANAGER' | 'INSPECTOR' | 'ANALYST' | 'TECHNICIAN' | 'SYSTEM' | string;
  readonly content: string;
  readonly timestamp: string;
}

export interface MissionAssignment {
  readonly id: string;
  readonly missionId?: string;
  readonly userId: string;
  readonly userName: string;
  readonly userFullName?: string;
  readonly assignmentRole: MissionOperationalRole;
  readonly status: string; // 'Active' | 'Unavailable' | 'Revoked' | string
  readonly responseStatus?: AssignmentResponseStatus;
  readonly isRequired?: boolean;
  readonly assignedAt?: string;
  readonly respondedAt?: string | null;
  readonly responseReason?: string | null;
  readonly checkedInAt?: string | null;
}

/** Cột điện thuộc phạm vi nhiệm vụ (`MissionTargetDto`). */
export interface MissionTarget {
  readonly towerId: string;
  readonly towerCode: string;
  readonly sequence: number | null;
  readonly inspectionStatus: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly regionId?: string;
}

/** `GET /missions/{id}` (`MissionDto`). */
export interface Mission {
  readonly id: string;
  readonly missionCode: string;
  readonly title: string;
  readonly routeData: string;
  readonly assignedToUserId: string;
  readonly assignedToUsername: string;
  readonly droneCode: string;
  readonly droneId?: string | null;
  readonly status: MissionStatus;
  readonly description: string;
  readonly managerId: string;
  readonly managerUsername: string;
  readonly createdAt: string;
  readonly updatedAt: string | null;
  readonly targets: readonly MissionTarget[];
  readonly sourceAssessmentId?: string | null;
  readonly scheduledStartAt?: string | null;
  readonly regionId?: string;
  readonly regionName?: string;
  readonly missionType?: string;
  readonly triggerReason?: string | null;
  readonly plannedStart?: string | null;
  readonly plannedEnd?: string | null;
  readonly actualStart?: string | null;
  readonly actualCompleted?: string | null;
  readonly boundaryWkt?: string | null;
  readonly team?: readonly MissionAssignment[];
  readonly confirmationDeadline?: string | null;
  readonly managerInstructions?: string | null;
  readonly postponeReason?: string | null;
  readonly suspendedReason?: string | null;
  readonly cancellationReason?: string | null;
  readonly priority?: MissionPriority;
  readonly objective?: InspectionObjective;
  readonly priorityDefects?: readonly string[];
  readonly emergencyReason?: string | null;
  readonly isImmediate?: boolean;
  readonly communicationLogs?: readonly MissionCommunicationLog[];
  // Tiến độ xác nhận của các thành viên
  readonly confirmedAt?: string | null;
  readonly confirmedCount?: number;
  readonly totalRequiredCount?: number;
  readonly confirmationProgress?: number | string;
  readonly allConfirmed?: boolean;
  readonly pendingRoles?: readonly string[];
  readonly requiresReassignment?: boolean;
}

export interface MissionPage {
  readonly items: readonly Mission[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

/** Nhân sự được phân công khi tạo nhiệm vụ từ hồ sơ đánh giá (`MissionPersonnelAssignmentRequest`). */
export interface MissionPersonnelAssignment {
  readonly userId: string;
  readonly role: MissionOperationalRole;
  readonly isRequired: boolean;
}

/**
 * Body của `POST /pre-mission-assessments/{id}/create-mission` (`CreateMissionFromAssessmentRequest`).
 * Đây là cách duy nhất để tạo nhiệm vụ: `POST /missions` đã bị gỡ.
 */
export interface CreateMissionFromAssessmentRequest {
  readonly assessmentId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly personnel: readonly MissionPersonnelAssignment[];
  readonly droneIds: readonly string[];
  readonly priority: MissionPriority;
  readonly objective: InspectionObjective;
  readonly priorityDefects?: readonly string[] | null;
  readonly emergencyReason?: string | null;
  readonly isImmediate: boolean;
  readonly idempotencyKey?: string | null;
}

/** Nhiệm vụ vừa tạo (backend trả về thực thể nhiệm vụ). */
export interface CreatedMission {
  readonly id: string;
  readonly missionCode: string;
  readonly title: string;
  readonly status: string;
}

/** Body của `PUT /missions/{id}/towers`. */
export interface MissionTowersRequest {
  readonly boundaryWkt: string;
  readonly towerIds: readonly string[];
}

/** Body của `POST /missions/{id}/incidents` (`SubmitIncidentReportRequest`). Sự cố không có tệp đính kèm. */
export interface SubmitIncidentReportRequest {
  readonly incidentType: string;
  readonly severity: string;
  readonly description: string;
  readonly towerId?: string | null;
}

/** `IncidentReportDto`. */
export interface IncidentReport {
  readonly id: string;
  readonly missionId: string;
  readonly reportedBy: string;
  readonly reporterName: string;
  readonly towerId?: string | null;
  readonly incidentType: string;
  readonly severity: string;
  readonly description: string;
  readonly status: string;
  readonly reportedAt: string;
}

/** Body của `POST /missions/{id}/flight-log` (`UploadFlightLogRequest`). */
export interface UploadFlightLogRequest {
  readonly gpsTrack: string;
  readonly minBatteryRecorded: number;
  readonly maxAltitudeM: number;
  readonly flightDurationSeconds: number;
  readonly connectionStatus: string;
}

/** `MissionFlightLogDto`. */
export interface MissionFlightLog {
  readonly id: string;
  readonly missionId: string;
  readonly gpsTrack: string;
  readonly minBatteryRecorded: number;
  readonly maxAltitudeM: number;
  readonly flightDurationSeconds: number;
  readonly connectionStatus: string;
  readonly recordedAt: string;
}

/** Metadata gửi kèm `POST /missions/{id}/media`. Bỏ trống `towerId` = video quét hành lang. */
export interface MissionMediaUploadMeta {
  readonly towerId?: string | null;
  readonly capturedAt?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface UpdateMissionPriorityRequest {
  readonly priority: MissionPriority;
  readonly objective?: InspectionObjective;
  readonly priorityDefects?: readonly string[];
  readonly emergencyReason?: string;
}
