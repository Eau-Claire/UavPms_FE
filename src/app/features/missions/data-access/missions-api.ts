import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import {
  IncidentReport,
  Mission,
  MissionAssignment,
  MissionAssignmentsOverview,
  MissionBackendActivity,
  MissionBackendDetection,
  MissionBackendMaintenanceTask,
  MissionFlightLog,
  MissionMediaUploadMeta,
  MissionPage,
  MissionTarget,
  MissionTowersRequest,
  SubmitIncidentReportRequest,
  UpdateMissionPriorityRequest,
  UploadFlightLogRequest,
  normalizeMissionStatus,
  normalizeObjective,
} from '../../../models/missions.models';

export interface MissionFilters {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly sortBy?: string;
  readonly sortDescending?: boolean;
}

export function isValidGuid(val?: string | null): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

/** Giữ lại cho NotificationsStore; dữ liệu nhiệm vụ đọc trực tiếp từ API nên không cần đồng bộ cục bộ. */
export function syncMissionsWithAssessments(): void {
  // Không còn đồng bộ cục bộ.
}

/**
 * API nhiệm vụ bay (MF02/MF03). Mọi endpoint ở đây bọc `ApiResponse { success, message, data }`.
 * Nhiệm vụ chỉ được tạo qua `PreMissionApi.createMission` (`POST /pre-mission-assessments/{id}/create-mission`).
 */
@Injectable({ providedIn: 'root' })
export class MissionsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/missions`;

  list(filters: MissionFilters): Observable<MissionPage> {
    let params = new HttpParams().set('page', filters.page).set('pageSize', filters.pageSize);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.status) params = params.set('status', filters.status);
    if (filters.priority) params = params.set('priority', filters.priority);
    if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    if (typeof filters.sortDescending === 'boolean') params = params.set('sortDescending', filters.sortDescending);
    return this.http
      .get<unknown>(this.url, { params })
      .pipe(map((response) => normalizePage(unwrapApiData(response), filters)));
  }

  my(): Observable<readonly Mission[]> {
    return this.http
      .get<unknown>(`${this.url}/my`)
      .pipe(map((res) => itemsValue(unwrapApiData(res)).map(normalizeMission)));
  }

  get(id: string): Observable<Mission> {
    return this.http
      .get<unknown>(`${this.url}/${id}`)
      .pipe(map((response) => normalizeMission(unwrapApiData(response))));
  }

  updatePriority(missionId: string, request: UpdateMissionPriorityRequest): Observable<Mission> {
    return this.http
      .patch<unknown>(`${this.url}/${missionId}/priority`, request)
      .pipe(map((res) => normalizeMission(unwrapApiData(res))));
  }

  /** Giải quyết phạm vi cột từ WKT (`POST /missions/{id}/scope/resolve`). */
  resolveScope(missionId: string, boundaryWkt: string): Observable<readonly MissionTarget[]> {
    return this.http
      .post<unknown>(`${this.url}/${missionId}/scope/resolve`, { boundaryWkt })
      .pipe(map((res) => normalizeTargets(unwrapApiData(res))));
  }

  /** Chốt danh sách cột của nhiệm vụ (`PUT /missions/{id}/towers`). */
  confirmTowers(missionId: string, request: MissionTowersRequest): Observable<unknown> {
    return this.http.put<unknown>(`${this.url}/${missionId}/towers`, request);
  }

  /** Cập nhật thông tin nhiệm vụ (`PUT /missions/{id}`). */
  update(
    id: string,
    request: {
      title: string;
      routeData: string;
      assignedToUserId: string;
      droneCode: string;
      status: string;
      description?: string;
    },
  ): Observable<unknown> {
    return this.http.put<unknown>(`${this.url}/${id}`, request);
  }

  /** Xóa nhiệm vụ (`DELETE /missions/{id}`). */
  delete(id: string): Observable<unknown> {
    return this.http.delete<unknown>(`${this.url}/${id}`);
  }

  /** Kiểm tra xung đột lịch nhân sự & UAV (`POST /missions/check-resource-conflicts`). */
  checkResourceConflicts(request: {
    startAt: string;
    endAt: string;
    userIds?: readonly string[];
    droneIds?: readonly string[];
    excludeMissionId?: string | null;
  }): Observable<unknown> {
    return this.http
      .post<unknown>(`${this.url}/check-resource-conflicts`, request)
      .pipe(map((res) => unwrapApiData(res)));
  }

  // --- Phân công thành viên ---

  getAssignmentsOverview(missionId: string): Observable<MissionAssignmentsOverview> {
    return this.http
      .get<unknown>(`${this.url}/${missionId}/assignments`)
      .pipe(map((res) => normalizeAssignmentsOverview(unwrapApiData(res), missionId)));
  }

  assignMember(missionId: string, userId: string, assignmentRole: string): Observable<MissionAssignment> {
    return this.http
      .post<unknown>(`${this.url}/${missionId}/assignments`, { userId, assignmentRole })
      .pipe(map((res) => normalizeAssignment(unwrapApiData(res), missionId)));
  }

  removeAssignment(missionId: string, assignmentId: string): Observable<unknown> {
    return this.http.delete<unknown>(`${this.url}/${missionId}/assignments/${assignmentId}`);
  }

  assignDrone(missionId: string, droneId: string): Observable<unknown> {
    return this.http.put<unknown>(`${this.url}/${missionId}/drone`, { droneId });
  }

  /** Thành viên đang đăng nhập nhận nhiệm vụ (backend xác định phân công theo người gọi). */
  acceptAssignment(id: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/accept`, {})
      .pipe(switchMap(() => this.get(id)));
  }

  /** Thành viên đang đăng nhập xin hoãn nhiệm vụ. */
  postponeAssignment(id: string, reason: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/postpone`, { reason })
      .pipe(switchMap(() => this.get(id)));
  }

  reassignAssignment(id: string, assignmentId: string, newUserId: string, reason?: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/${assignmentId}/reassign`, {
        assignmentId,
        newUserId,
        reason: reason || null,
      })
      .pipe(switchMap(() => this.get(id)));
  }

  // --- Điều phối vòng đời ---

  confirmMission(id: string, reason?: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/confirm`, { reason: reason || null })
      .pipe(switchMap(() => this.get(id)));
  }

  postponeMission(id: string, reason: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/postpone`, { reason })
      .pipe(switchMap(() => this.get(id)));
  }

  suspendMission(id: string, reason: string): Observable<Mission> {
    return this.http.post<unknown>(`${this.url}/${id}/suspend`, { reason }).pipe(switchMap(() => this.get(id)));
  }

  resumeMission(id: string, reason?: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/resume`, { reason: reason || null })
      .pipe(switchMap(() => this.get(id)));
  }

  cancelMissionWithReason(id: string, reason: string): Observable<Mission> {
    return this.http.post<unknown>(`${this.url}/${id}/cancel`, { reason }).pipe(switchMap(() => this.get(id)));
  }

  sendReminder(id: string, reason?: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/remind`, { reason: reason || null })
      .pipe(switchMap(() => this.get(id)));
  }

  sendCommunication(id: string, message: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/communications`, { message });
  }

  getCommunications(id: string): Observable<readonly unknown[]> {
    return this.http
      .get<unknown>(`${this.url}/${id}/communications`)
      .pipe(map((res) => itemsValue(unwrapApiData(res))));
  }

  checkIn(id: string, position?: { latitude: number; longitude: number }): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/check-in`, position ?? {});
  }

  start(id: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/start`, {});
  }

  complete(id: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/complete`, {});
  }

  // --- Thực thi hiện trường (MF03) ---

  confirmDroneHandover(
    id: string,
    payload: { droneId: string; receivedBy: string; condition: string; accepted?: boolean },
  ): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/drone-handover`, {
      droneId: payload.droneId,
      receivedBy: payload.receivedBy,
      condition: payload.condition,
      accepted: payload.accepted ?? true,
    });
  }

  returnDroneHandover(id: string, payload: { droneId: string; condition: string }): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/drone-handover/return`, payload);
  }

  uploadFlightLog(id: string, request: UploadFlightLogRequest): Observable<MissionFlightLog> {
    return this.http
      .post<unknown>(`${this.url}/${id}/flight-log`, request)
      .pipe(map((res) => unwrapApiData<MissionFlightLog>(res)));
  }

  getFlightLogs(id: string): Observable<readonly MissionFlightLog[]> {
    return this.http
      .get<unknown>(`${this.url}/${id}/flight-logs`)
      .pipe(map((res) => itemsValue(unwrapApiData(res)) as readonly MissionFlightLog[]));
  }

  submitIncidentReport(id: string, request: SubmitIncidentReportRequest): Observable<IncidentReport> {
    return this.http
      .post<unknown>(`${this.url}/${id}/incidents`, request)
      .pipe(map((res) => unwrapApiData<IncidentReport>(res)));
  }

  getIncidentReports(id: string): Observable<readonly IncidentReport[]> {
    return this.http
      .get<unknown>(`${this.url}/${id}/incidents`)
      .pipe(map((res) => itemsValue(unwrapApiData(res)) as readonly IncidentReport[]));
  }

  /**
   * Tải một tệp ảnh/video lên nhiệm vụ (`POST /missions/{id}/media`).
   * `towerId` tùy chọn: bỏ trống khi là video quét hành lang đi qua nhiều cột.
   */
  uploadMedia(id: string, file: File, meta?: MissionMediaUploadMeta): Observable<HttpEvent<unknown>> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (meta?.towerId) form.append('towerId', meta.towerId);
    form.append('capturedAt', meta?.capturedAt || new Date().toISOString());
    if (meta?.latitude != null) form.append('latitude', String(meta.latitude));
    if (meta?.longitude != null) form.append('longitude', String(meta.longitude));
    return this.http.post<unknown>(`${this.url}/${id}/media`, form, { observe: 'events', reportProgress: true });
  }

  // --- Kết quả AI, bảo trì, hoạt động ---

  getMissionDetections(missionId: string): Observable<readonly MissionBackendDetection[]> {
    return this.http
      .get<unknown>(`${this.url}/${missionId}/detections`)
      .pipe(map((res) => itemsValue(unwrapApiData(res)).map(normalizeBackendDetection)));
  }

  reviewDetection(
    missionId: string,
    detectionId: string,
    payload: { status: 'Approved' | 'Rejected'; reviewNotes?: string },
  ): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${missionId}/detections/${detectionId}/review`, payload);
  }

  getMissionMaintenanceTasks(missionId: string): Observable<readonly MissionBackendMaintenanceTask[]> {
    return this.http
      .get<unknown>(`${this.url}/${missionId}/maintenance-tasks`)
      .pipe(map((res) => itemsValue(unwrapApiData(res)).map(normalizeBackendMaintenanceTask)));
  }

  getMissionActivities(missionId: string): Observable<readonly MissionBackendActivity[]> {
    return this.http
      .get<unknown>(`${this.url}/${missionId}/activities`)
      .pipe(map((res) => itemsValue(unwrapApiData(res)).map(normalizeBackendActivity)));
  }

  addMissionActivity(missionId: string, content: string, senderRole?: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${missionId}/activities`, { content, senderRole: senderRole || null });
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const optionalString = (value: unknown): string | undefined =>
  value === undefined || value === null || value === '' ? undefined : String(value);

const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeTargets = (source: unknown): readonly MissionTarget[] => {
  if (!Array.isArray(source)) return [];
  return source.map((item, index) => {
    const r = record(item);
    return {
      towerId: stringValue(r['towerId']),
      towerCode: stringValue(r['towerCode']),
      sequence: optionalNumber(r['sequence']) ?? index + 1,
      inspectionStatus: stringValue(r['inspectionStatus'], 'Pending'),
      latitude: optionalNumber(r['latitude']),
      longitude: optionalNumber(r['longitude']),
      regionId: optionalString(r['regionId']),
    };
  });
};

function normalizeResponseStatus(val: unknown): 'PENDING' | 'ACCEPTED' | 'POSTPONED' | 'REPLACED' | 'CANCELLED' {
  const s = String(val || '').toUpperCase();
  if (s === 'ACCEPTED') return 'ACCEPTED';
  if (s === 'POSTPONED') return 'POSTPONED';
  if (s === 'REPLACED') return 'REPLACED';
  if (s === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
}

const normalizeAssignment = (item: unknown, missionId?: string): MissionAssignment => {
  const r = record(item);
  return {
    id: stringValue(r['id']),
    missionId: optionalString(r['missionId']) ?? missionId,
    userId: stringValue(r['userId']),
    userName: stringValue(pick(r, 'userFullName', 'userName')),
    userFullName: optionalString(r['userFullName']),
    assignmentRole: stringValue(r['assignmentRole']).toUpperCase(),
    status: stringValue(r['status'], 'Active'),
    responseStatus: normalizeResponseStatus(r['responseStatus']),
    isRequired: r['isRequired'] !== false,
    assignedAt: optionalString(r['assignedAt']),
    respondedAt: optionalString(r['respondedAt']) ?? null,
    responseReason: optionalString(r['responseReason']) ?? null,
    checkedInAt: optionalString(r['checkedInAt']) ?? null,
  };
};

export const normalizeAssignmentsOverview = (source: unknown, missionId: string): MissionAssignmentsOverview => {
  const r = record(source);
  const assignments = Array.isArray(r['assignments']) ? r['assignments'].map((a) => normalizeAssignment(a, missionId)) : [];
  return {
    missionId: stringValue(r['missionId'], missionId),
    totalRequiredCount: Number(r['totalRequiredCount'] ?? 0),
    confirmedCount: Number(r['confirmedCount'] ?? 0),
    allConfirmed: r['allConfirmed'] === true,
    confirmationDeadline: optionalString(r['confirmationDeadline']) ?? null,
    assignments,
  };
};

export const normalizeMission = (source: unknown): Mission => {
  const r = record(source);
  const id = stringValue(r['id']);
  const team = Array.isArray(r['team']) ? r['team'].map((a) => normalizeAssignment(a, id)) : [];
  const required = team.filter((t) => t.isRequired !== false && t.status !== 'Revoked');
  const confirmedCount = required.filter((t) => t.responseStatus === 'ACCEPTED').length;
  const totalRequiredCount = required.length;
  const allConfirmed = totalRequiredCount > 0 && confirmedCount >= totalRequiredCount;

  return {
    id,
    missionCode: stringValue(r['missionCode'], id),
    title: stringValue(r['title']),
    routeData: stringValue(r['routeData']),
    assignedToUserId: stringValue(pick(r, 'assignedToUserId', 'inspectorId')),
    assignedToUsername: stringValue(pick(r, 'assignedToUsername', 'assignedToEmail', 'inspectorEmail')),
    droneCode: stringValue(r['droneCode']),
    droneId: optionalString(pick(r, 'droneId', 'uavId')) ?? null,
    status: normalizeMissionStatus(stringValue(r['status'])),
    description: stringValue(r['description']),
    managerId: stringValue(r['managerId']),
    managerUsername: stringValue(r['managerEmail']),
    createdAt: stringValue(r['createdAt']),
    updatedAt: optionalString(r['updatedAt']) ?? null,
    scheduledStartAt: optionalString(pick(r, 'scheduledStartAt', 'plannedStart')) ?? null,
    plannedStart: optionalString(r['plannedStart']) ?? null,
    plannedEnd: optionalString(r['plannedEnd']) ?? null,
    actualStart: optionalString(r['actualStart']) ?? null,
    actualCompleted: optionalString(r['actualCompleted']) ?? null,
    regionId: optionalString(r['regionId']),
    regionName: optionalString(r['regionName']),
    missionType: optionalString(r['missionType']),
    triggerReason: optionalString(r['triggerReason']) ?? null,
    boundaryWkt: optionalString(r['boundaryWkt']) ?? null,
    confirmationDeadline: optionalString(r['confirmationDeadline']) ?? null,
    managerInstructions: optionalString(r['managerInstructions']) ?? null,
    priority: stringValue(r['priority'], 'Normal').toUpperCase(),
    objective: normalizeObjective(r['objective']),
    priorityDefects: Array.isArray(r['priorityDefects']) ? r['priorityDefects'].map(String) : [],
    emergencyReason: optionalString(r['emergencyReason']) ?? null,
    isImmediate: r['isImmediate'] === true,
    team,
    confirmedCount,
    totalRequiredCount,
    allConfirmed,
    confirmationProgress: `${confirmedCount}/${totalRequiredCount}`,
    communicationLogs: [],
    sourceAssessmentId: optionalString(pick(r, 'sourceAssessmentId', 'preMissionAssessmentId', 'assessmentId')) ?? null,
    targets: normalizeTargets(r['targets']),
  };
};

/** `ListMissions` trả `{ items, pagination: { page, pageSize, totalItems, totalPages } }`. */
export const normalizePage = (source: unknown, filters: MissionFilters): MissionPage => {
  const r = record(source);
  const pagination = record(r['pagination']);
  const items = itemsValue(source).map(normalizeMission);
  const totalCount = Number(pick(pagination, 'totalItems', 'totalCount') ?? pick(r, 'totalCount', 'totalItems') ?? items.length);
  const pageSize = Number(pick(pagination, 'pageSize') ?? filters.pageSize);
  const totalPages = Number(
    pick(pagination, 'totalPages') ?? pick(r, 'totalPages') ?? Math.max(1, Math.ceil(totalCount / pageSize)),
  );

  return {
    items,
    page: Number(pick(pagination, 'page') ?? filters.page),
    pageSize,
    totalCount,
    totalPages,
  };
};

export const itemsValue = (source: unknown): readonly unknown[] => {
  if (Array.isArray(source)) return source;
  const candidate = record(source)['items'];
  return Array.isArray(candidate) ? candidate : [];
};

export function normalizeBackendDetection(raw: unknown): MissionBackendDetection {
  const r = record(raw);
  const box = record(r['boundingBox']);
  return {
    id: stringValue(r['id']),
    missionId: stringValue(r['missionId']),
    mediaId: optionalString(r['mediaId']),
    towerId: optionalString(r['towerId']),
    tower: optionalString(r['tower']),
    gps: optionalString(r['gps']),
    title: stringValue(r['title']),
    confidence: Number(r['confidence'] ?? 0),
    categoryCode: optionalString(r['categoryCode']),
    severityWeight: optionalNumber(r['severityWeight']),
    isEmergency: r['isEmergency'] === true,
    status: stringValue(r['status'], 'Pending'),
    boundingBox: r['boundingBox']
      ? { x: Number(box['x'] ?? 0), y: Number(box['y'] ?? 0), width: Number(box['width'] ?? 0), height: Number(box['height'] ?? 0) }
      : undefined,
    timestampSeconds: optionalNumber(r['timestampSeconds']) ?? null,
    timestampLabel: optionalString(r['timestampLabel']),
    frameIndex: optionalNumber(r['frameIndex']) ?? null,
    imageUrl: optionalString(r['imageUrl']),
    sourceUrl: optionalString(r['sourceUrl']),
    description: optionalString(r['description']),
    detectedAt: optionalString(r['detectedAt']),
    reviewedByUserId: optionalString(r['reviewedByUserId']) ?? null,
    reviewedAt: optionalString(r['reviewedAt']) ?? null,
    reviewNotes: optionalString(r['reviewNotes']) ?? null,
  };
}

export function normalizeBackendMaintenanceTask(raw: unknown): MissionBackendMaintenanceTask {
  const r = record(raw);
  return {
    id: stringValue(r['id']),
    missionId: stringValue(r['missionId']),
    detectionId: optionalString(r['detectionId']),
    title: stringValue(r['title']),
    priority: stringValue(r['priority'], 'Medium'),
    towerCode: optionalString(r['towerCode']),
    defectDescription: optionalString(r['defectDescription']),
    suggestedAction: optionalString(r['suggestedAction']),
    status: stringValue(r['status'], 'Pending'),
    assignedTeam: optionalString(r['assignedTeam']),
    createdAt: optionalString(r['createdAt']),
  };
}

export function normalizeBackendActivity(raw: unknown): MissionBackendActivity {
  const r = record(raw);
  return {
    id: stringValue(r['id']),
    missionId: stringValue(r['missionId']),
    senderUserId: optionalString(r['senderUserId']),
    senderName: stringValue(r['senderName'], 'Hệ thống'),
    senderRole: stringValue(r['senderRole'], 'SYSTEM'),
    content: stringValue(r['content']),
    timestamp: stringValue(r['timestamp']),
  };
}
