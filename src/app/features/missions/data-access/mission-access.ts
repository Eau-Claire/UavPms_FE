import { UserRole } from '../../../models/auth.models';
import {
  Mission,
  MissionAssignment,
  MissionPriority,
  normalizeMissionStatus,
} from '../../../models/missions.models';
import {
  isAdminRole,
  isAnalystRole,
  isInspectorRole,
  isManagerRole,
  isTechnicianRole,
  roleFamily,
} from '../../../core/auth/roles';

/**
 * Role rules for the mission pages, kept in one place so the templates stay simple and the rules can be unit-tested.
 * They mirror the `[Authorize]` attributes on `MissionController` and the route guards in `app.routes.ts`.
 */
type RoleInput = UserRole | string | null | undefined;

export type MissionListScope = 'my' | 'all';
export type MissionTab = 'overview' | 'upload' | 'processing' | 'results' | 'towers' | 'maintenance' | 'activity';

export interface MissionLink {
  readonly commands: readonly string[];
  readonly queryParams?: Readonly<Record<string, string>>;
}

/** `GET /missions` (every mission) is SystemAdmin, Manager and Analyst only. */
export const canViewAllMissions = (role: RoleInput): boolean => isManagerRole(role) || isAnalystRole(role);

/** Remind, suspend, resume, cancel, reassign, priority, drone and scope endpoints: SystemAdmin and Manager. */
export const canManageMission = (role: RoleInput): boolean => isManagerRole(role);

/** Start/complete flight, media, flight log, incidents, communications: SystemAdmin, Manager and Inspector. */
export const canOperateFlight = (role: RoleInput): boolean => isManagerRole(role) || isInspectorRole(role);

/** `POST /missions/{id}/media` is open to SystemAdmin, Manager and Inspector. */
export const canUploadMissionMedia = canOperateFlight;

/** `POST|PUT /missions/{id}/detections/{d}/review`: SystemAdmin, Manager and Analyst. */
export const canReviewDetections = (role: RoleInput): boolean => isManagerRole(role) || isAnalystRole(role);

/** Route `/emergency-alerts` allows Admin, Manager and Analyst. */
export const canOpenEmergencyAlerts = canReviewDetections;

/** `GET /pre-mission-assessments/{id}` is not open to Analyst. */
export const canOpenPreMissionAssessment = (role: RoleInput): boolean =>
  isManagerRole(role) || isInspectorRole(role) || isTechnicianRole(role);

/** Route `/maintenance/:id` allows Admin, Manager, Technician and MaintenanceTechnician. */
export const canOpenMaintenanceTicket = (role: RoleInput): boolean => isManagerRole(role) || isTechnicianRole(role);

/** `GET /users` is SystemAdmin only; `GET /users/assignable` is SystemAdmin and Manager. */
export const userDirectorySource = (role: RoleInput): 'all' | 'assignable' | 'none' => {
  if (isAdminRole(role)) return 'all';
  if (isManagerRole(role)) return 'assignable';
  return 'none';
};

/** The signed-in user's assignment on a mission (active or postponed; not replaced/cancelled). */
export const findMyAssignment = (mission: Mission | null | undefined, userId: string | null | undefined): MissionAssignment | null => {
  if (!mission?.team?.length || !userId) return null;
  return (
    mission.team.find(
      (a) => a.userId === userId && a.status !== 'Revoked' && a.responseStatus !== 'REPLACED' && a.responseStatus !== 'CANCELLED',
    ) ?? null
  );
};

/**
 * Mission statuses in which a member can still accept or ask to postpone their assignment. The backend answers
 * `409 INVALID_MISSION_STATE` outside PendingAcceptance/Assigned/Preparing/Ready (e.g. Draft, Postponed).
 */
const RESPONSE_OPEN_STATUSES = ['PendingAcceptance', 'Assigned', 'Preparing', 'Ready'];

/** `POST /missions/{id}/postpone` (the whole mission) is Manager/SystemAdmin only; members use `/assignments/postpone`. */
export const canPostponeWholeMission = (role: RoleInput): boolean => isManagerRole(role);

/** Statuses from which `POST /missions/{id}/start` is accepted. */
const STARTABLE_STATUSES = ['Assigned', 'Preparing', 'Ready'];

/** `Mission:StartToleranceMinutes`: a mission may start at most 2 hours before its planned start. */
export const START_TOLERANCE_MINUTES = 120;

/** Active required members (isRequired defaults to true) that have not accepted yet. */
export const pendingRequiredMembers = (mission: Mission | null | undefined): readonly MissionAssignment[] =>
  (mission?.team ?? []).filter(
    (a) =>
      a.isRequired !== false &&
      a.status !== 'Revoked' &&
      a.responseStatus !== 'REPLACED' &&
      a.responseStatus !== 'CANCELLED' &&
      a.responseStatus !== 'ACCEPTED',
  );

/** Earliest moment the mission may start (`plannedStart - 2h`), or `null` when there is no planned start. */
export const earliestStartAt = (mission: Mission | null | undefined): Date | null => {
  const raw = mission?.plannedStart ?? mission?.scheduledStartAt;
  if (!raw) return null;
  const start = new Date(raw);
  return Number.isNaN(start.getTime()) ? null : new Date(start.getTime() - START_TOLERANCE_MINUTES * 60_000);
};

/**
 * Why "Bắt đầu bay" is not available yet (Vietnamese), or `null` when the client-side checks pass. Mirrors the
 * backend checks that the client can see: state, required acceptances (`REQUIRED_ACCEPTANCE_PENDING`), start window
 * (`MISSION_START_TOO_EARLY`) and a UAV on the mission (`DRONE_ASSIGNMENT_REQUIRED`). UAV availability, health and
 * handover are only known to the backend and are reported when the start request fails.
 */
export const missionStartBlocker = (mission: Mission | null | undefined, now: number): string | null => {
  if (!mission) return 'Chưa tải được nhiệm vụ.';
  if (!STARTABLE_STATUSES.includes(normalizeMissionStatus(mission.status))) {
    return 'Chỉ bắt đầu bay khi nhiệm vụ ở trạng thái Đã phân công / Chuẩn bị / Sẵn sàng.';
  }
  const pending = pendingRequiredMembers(mission);
  if (pending.length || (!mission.team?.length && mission.allConfirmed === false)) {
    return pending.length
      ? `Còn ${pending.length} thành viên bắt buộc chưa chấp nhận nhiệm vụ.`
      : 'Còn thành viên bắt buộc chưa chấp nhận nhiệm vụ.';
  }
  if (!mission.droneId && !mission.droneCode) return 'Nhiệm vụ chưa có UAV.';
  const earliest = earliestStartAt(mission);
  if (earliest && now < earliest.getTime()) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const at = `${pad(earliest.getHours())}:${pad(earliest.getMinutes())} ${pad(earliest.getDate())}/${pad(earliest.getMonth() + 1)}`;
    return `Chưa đến khung giờ bay: chỉ được bắt đầu từ ${at} (sớm nhất 2 giờ trước giờ bay dự kiến).`;
  }
  return null;
};

/** True while a member has not accepted yet and the mission has not started executing. */
export const isAwaitingMyResponse = (mission: Mission | null | undefined, assignment: MissionAssignment | null): boolean => {
  if (!mission || !assignment) return false;
  if (assignment.responseStatus === 'ACCEPTED') return false;
  return RESPONSE_OPEN_STATUSES.includes(normalizeMissionStatus(mission.status));
};

/**
 * What the acceptance page should show for the signed-in user:
 * - `none`: no assignment on this mission (read-only summary),
 * - `awaiting`: can accept or ask to postpone,
 * - `postponed`: asked to postpone, waiting for the manager,
 * - `accepted`: accepted, waiting for the rest of the team or ready to fly,
 * - `suspended` / `closed`: the mission is suspended, or already executing/finished/cancelled.
 */
export type AcceptanceState = 'none' | 'awaiting' | 'postponed' | 'accepted' | 'suspended' | 'closed';

export const acceptanceState = (mission: Mission | null | undefined, assignment: MissionAssignment | null): AcceptanceState => {
  if (!mission || !assignment) return 'none';
  const status = normalizeMissionStatus(mission.status);
  if (status === 'Suspended') return 'suspended';
  if (['InProgress', 'Completed', 'Cancelled'].includes(status)) return 'closed';
  if (assignment.responseStatus === 'ACCEPTED') return 'accepted';
  if (assignment.responseStatus === 'POSTPONED') return 'postponed';
  return isAwaitingMyResponse(mission, assignment) ? 'awaiting' : 'closed';
};

/**
 * Where a row in the mission list opens:
 * - managers: the mission dashboard,
 * - Analyst on the "all missions" tab: the dashboard on the results tab,
 * - field roles with an assignment still waiting for their answer: the acceptance page,
 * - otherwise: the mission dashboard.
 */
export const missionRowLink = (
  mission: Mission,
  role: RoleInput,
  userId: string | null | undefined,
  scope: MissionListScope,
): MissionLink => {
  const detail = ['/missions', mission.id];
  if (isManagerRole(role)) return { commands: detail };
  if (isAnalystRole(role) && scope === 'all') return { commands: detail, queryParams: { tab: 'results' } };
  const mine = findMyAssignment(mission, userId);
  // A member whose postponement is still pending also lands on the acceptance page to follow its outcome.
  const postponePending = mine?.responseStatus === 'POSTPONED' && normalizeMissionStatus(mission.status) === 'Postponed';
  if (isAwaitingMyResponse(mission, mine) || postponePending) {
    return { commands: ['/missions', mission.id, 'inspector'] };
  }
  return { commands: detail };
};

/** Tab opened on the mission dashboard when the URL has no `?tab=`. */
export const defaultMissionTab = (role: RoleInput, status: string | null | undefined): MissionTab => {
  if (isAnalystRole(role)) return 'results';
  if (isTechnicianRole(role)) return 'maintenance';
  if (isInspectorRole(role) && normalizeMissionStatus(status) === 'InProgress') return 'upload';
  return 'overview';
};

/** Role sent with `POST /missions/{id}/activities` (the backend re-checks it). */
export const activitySenderRole = (role: RoleInput, assignment: MissionAssignment | null): string => {
  if (isManagerRole(role)) return 'MANAGER';
  if (assignment?.assignmentRole) return assignment.assignmentRole.toUpperCase();
  switch (roleFamily(role)) {
    case 'inspector':
      return 'INSPECTOR';
    case 'analyst':
      return 'ANALYST';
    case 'technician':
      return 'TECHNICIAN';
    default:
      return 'MEMBER';
  }
};

export type ActivitySenderKind = 'MANAGER' | 'INSPECTOR' | 'ANALYST' | 'TECHNICIAN' | 'SYSTEM';

/** Maps a backend `senderRole` onto the badge shown in the activity feed. */
export const activitySenderKind = (senderRole: string | null | undefined): ActivitySenderKind => {
  const key = (senderRole ?? '').toString().trim().toUpperCase().replace(/[\s_-]/g, '');
  switch (key) {
    case 'MANAGER':
    case 'SYSTEMADMIN':
    case 'ADMIN':
      return 'MANAGER';
    case 'INSPECTOR':
    case 'PILOT':
    case 'COPILOT':
    case 'OBSERVER':
      return 'INSPECTOR';
    case 'ANALYST':
      return 'ANALYST';
    case 'TECHNICIAN':
    case 'MAINTENANCETECHNICIAN':
      return 'TECHNICIAN';
    default:
      return 'SYSTEM';
  }
};

const SENDER_LABELS: Record<ActivitySenderKind, string> = {
  MANAGER: 'Quản lý',
  INSPECTOR: 'Phi công',
  ANALYST: 'Phân tích viên',
  TECHNICIAN: 'Kỹ thuật viên',
  SYSTEM: 'Hệ thống',
};

export const activitySenderLabel = (kind: ActivitySenderKind): string => SENDER_LABELS[kind];

const ASSIGNMENT_ROLE_LABELS: Record<string, string> = {
  INSPECTOR: 'Phi công / Inspector',
  PILOT: 'Phi công',
  CO_PILOT: 'Phi công phụ',
  COPILOT: 'Phi công phụ',
  OBSERVER: 'Quan sát viên',
  ANALYST: 'Chuyên viên phân tích',
  TECHNICIAN: 'Kỹ thuật viên',
  MAINTENANCETECHNICIAN: 'Kỹ thuật viên bảo trì',
};

/** Vietnamese label for a mission assignment role (`assignmentRole`). */
export const assignmentRoleLabel = (role: string | null | undefined): string => {
  const key = (role ?? '').toString().trim().toUpperCase();
  return ASSIGNMENT_ROLE_LABELS[key] ?? ASSIGNMENT_ROLE_LABELS[key.replace(/[\s-]/g, '')] ?? (key ? key : 'Thành viên');
};

/** Vietnamese label for a mission priority (`NORMAL` / `HIGH` / `EMERGENCY`). */
export const missionPriorityLabel = (priority: MissionPriority | null | undefined): string => {
  switch ((priority ?? '').toString().toUpperCase()) {
    case 'EMERGENCY':
      return 'Khẩn cấp';
    case 'HIGH':
      return 'Ưu tiên cao';
    default:
      return 'Bình thường';
  }
};

const TOWER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ kiểm tra',
  INPROGRESS: 'Đang kiểm tra',
  INSPECTED: 'Đã kiểm tra',
  COMPLETED: 'Đã kiểm tra',
  SKIPPED: 'Bỏ qua',
};

/** Vietnamese label for `MissionTargetInspectionStatus` (Pending, InProgress, Inspected, Skipped). */
export const towerInspectionStatusLabel = (status: string | null | undefined): string => {
  const key = (status ?? '').toString().replace(/[\s_-]/g, '').toUpperCase();
  return TOWER_STATUS_LABELS[key] ?? (status || 'Chờ kiểm tra');
};

export const isTowerInspected = (status: string | null | undefined): boolean =>
  ['INSPECTED', 'COMPLETED'].includes((status ?? '').toString().replace(/[\s_-]/g, '').toUpperCase());

const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Chờ xử lý',
  PENDING: 'Chờ xử lý',
  APPROVED: 'Chờ xử lý',
  INPROGRESS: 'Đang sửa chữa',
  PENDINGVERIFICATION: 'Chờ nghiệm thu',
  RESOLVED: 'Đã đóng',
  CLOSED: 'Đã đóng',
  COMPLETED: 'Đã đóng',
};

/** Vietnamese label for a maintenance ticket status (ticket enum or the mission DTO's simplified value). */
export const maintenanceStatusLabel = (status: string | null | undefined): string => {
  const key = (status ?? '').toString().replace(/[\s_-]/g, '').toUpperCase();
  return MAINTENANCE_STATUS_LABELS[key] ?? (status || 'Chờ xử lý');
};

/** CSS tone for a maintenance status pill. */
export const maintenanceStatusTone = (status: string | null | undefined): 'pending' | 'inprogress' | 'completed' => {
  const label = maintenanceStatusLabel(status);
  if (label === 'Đã đóng') return 'completed';
  if (label === 'Chờ xử lý') return 'pending';
  return 'inprogress';
};
