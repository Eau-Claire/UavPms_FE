import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { asRecord, readArray, readBoolean, readFirstNumber, readFirstString, readNumber, readOptionalNumber, readOptionalString, readString } from '../../../shared/utils';
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
      title?: string;
      routeData?: string;
      assignedToUserId?: string;
      droneCode?: string;
      status?: string;
      description?: string;
      priority?: string;
      objective?: string;
      managerInstructions?: string;
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

  /**
   * Thêm thành viên (`POST /missions/{id}/assignments`). `isRequired` mặc định `true`; thêm người bắt buộc khi nhiệm vụ
   * đang `Assigned`/`Preparing`/`Ready` đưa nhiệm vụ về `PendingAcceptance`.
   */
  assignMember(missionId: string, userId: string, assignmentRole: string, isRequired = true): Observable<MissionAssignment> {
    return this.http
      .post<unknown>(`${this.url}/${missionId}/assignments`, { userId, assignmentRole, isRequired })
      .pipe(map((res) => normalizeAssignment(unwrapApiData(res), missionId)));
  }

  /** Gỡ phân công. Không gỡ được thành viên bắt buộc cuối cùng (`REQUIRED_MEMBER_REQUIRED`). */
  removeAssignment(missionId: string, assignmentId: string): Observable<unknown> {
    return this.http.delete<unknown>(`${this.url}/${missionId}/assignments/${assignmentId}`);
  }

  assignDrone(missionId: string, droneId: string): Observable<unknown> {
    return this.http.put<unknown>(`${this.url}/${missionId}/drone`, { droneId });
  }

  /**
   * Thành viên đang đăng nhập nhận nhiệm vụ (backend xác định phân công theo người gọi). Chỉ hợp lệ khi nhiệm vụ
   * `PendingAcceptance`/`Assigned`/`Preparing`/`Ready` (ngược lại `409 INVALID_MISSION_STATE`).
   */
  acceptAssignment(id: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/accept`, {})
      .pipe(switchMap(() => this.get(id)));
  }

  /** Thành viên đang đăng nhập xin hoãn nhiệm vụ (cùng điều kiện trạng thái như `acceptAssignment`). */
  postponeAssignment(id: string, reason: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/postpone`, { reason })
      .pipe(switchMap(() => this.get(id)));
  }

  /**
   * Đổi người cho một phân công. Backend thu hồi phân công cũ và tạo phân công MỚI (id mới), nên luôn tải lại
   * nhiệm vụ (kèm danh sách thành viên) sau khi đổi. Lỗi: `404` (phân công không tồn tại),
   * `409 ASSIGNEE_ALREADY_ASSIGNED`, `400 ASSIGNMENT_ID_REQUIRED`.
   */
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

  /**
   * Người gọi xác nhận phân công CỦA CHÍNH MÌNH (tương đương `assignments/accept`). Người không phải thành viên nhận
   * `403 USER_NOT_ASSIGNED`.
   */
  confirmMission(id: string, reason?: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/confirm`, { reason: reason || null })
      .pipe(switchMap(() => this.get(id)));
  }

  /**
   * Hoãn cả nhiệm vụ: CHỈ Manager/SystemAdmin của vùng. Thành viên (Inspector...) tự hoãn phải dùng
   * `postponeAssignment` (`/assignments/postpone`).
   */
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

const optionalText = (source: Record<string, unknown> | null, key: string): string | undefined =>
  readOptionalString(source, key) ?? undefined;

const optionalNum = (source: Record<string, unknown> | null, key: string): number | undefined =>
  readOptionalNumber(source, key) ?? undefined;

const normalizeTargets = (source: unknown): readonly MissionTarget[] => {
  if (!Array.isArray(source)) return [];
  return source.map((item, index) => {
    const r = asRecord(item);
    return {
      id: readFirstString(r, ['id', 'towerId'], `target-${index}`),
      towerId: readString(r, 'towerId'),
      towerCode: readString(r, 'towerCode'),
      sequence: readOptionalNumber(r, 'sequence') ?? index + 1,
      inspectionStatus: readString(r, 'inspectionStatus', 'Pending'),
      latitude: optionalNum(r, 'latitude'),
      longitude: optionalNum(r, 'longitude'),
      regionId: optionalText(r, 'regionId'),
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
  const r = asRecord(item);
  return {
    id: readString(r, 'id'),
    missionId: optionalText(r, 'missionId') ?? missionId,
    userId: readString(r, 'userId'),
    userName: readFirstString(r, ['userFullName', 'userName']),
    userFullName: optionalText(r, 'userFullName'),
    assignmentRole: readString(r, 'assignmentRole').toUpperCase(),
    status: readString(r, 'status', 'Active'),
    responseStatus: normalizeResponseStatus(r?.['responseStatus']),
    isRequired: r?.['isRequired'] !== false,
    assignedAt: optionalText(r, 'assignedAt'),
    respondedAt: readOptionalString(r, 'respondedAt'),
    responseReason: readOptionalString(r, 'responseReason'),
    checkedInAt: readOptionalString(r, 'checkedInAt'),
  };
};

export const normalizeAssignmentsOverview = (source: unknown, missionId: string): MissionAssignmentsOverview => {
  const r = asRecord(source);
  const assignments = readArray(r?.['assignments']).map((a) => normalizeAssignment(a, missionId));
  return {
    missionId: readString(r, 'missionId', missionId),
    totalRequiredCount: readNumber(r, 'totalRequiredCount'),
    confirmedCount: readNumber(r, 'confirmedCount'),
    allConfirmed: readBoolean(r, 'allConfirmed'),
    confirmationDeadline: readOptionalString(r, 'confirmationDeadline'),
    assignments,
  };
};

export const normalizeMission = (source: unknown): Mission => {
  const r = asRecord(source);
  const id = readString(r, 'id');
  const team = readArray(r?.['team']).map((a) => normalizeAssignment(a, id));
  const required = team.filter((t) => t.isRequired !== false && t.status !== 'Revoked');
  const confirmedCount = required.filter((t) => t.responseStatus === 'ACCEPTED').length;
  const totalRequiredCount = required.length;
  const allConfirmed = totalRequiredCount > 0 && confirmedCount >= totalRequiredCount;

  const rawStatus = readString(r, 'status');
  let status = normalizeMissionStatus(rawStatus);
  if (allConfirmed && (status === 'Assigned' || status === 'PendingAcceptance' || rawStatus === 'Assigned' || rawStatus === 'CONFIRMED')) {
    status = 'Confirmed';
  }

  return {
    id,
    missionCode: readString(r, 'missionCode', id),
    title: readString(r, 'title'),
    routeData: readString(r, 'routeData'),
    assignedToUserId: readFirstString(r, ['assignedToUserId', 'inspectorId']),
    assignedToUsername: readFirstString(r, ['assignedToUsername', 'assignedToEmail', 'inspectorEmail']),
    droneCode: readString(r, 'droneCode'),
    droneId: readFirstString(r, ['droneId', 'uavId']) || null,
    status,
    description: readString(r, 'description'),
    managerId: readString(r, 'managerId'),
    managerUsername: readString(r, 'managerEmail'),
    createdAt: readString(r, 'createdAt'),
    updatedAt: readOptionalString(r, 'updatedAt'),
    scheduledStartAt: readFirstString(r, ['scheduledStartAt', 'plannedStart']) || null,
    plannedStart: readOptionalString(r, 'plannedStart'),
    plannedEnd: readOptionalString(r, 'plannedEnd'),
    actualStart: readOptionalString(r, 'actualStart'),
    actualCompleted: readOptionalString(r, 'actualCompleted'),
    regionId: optionalText(r, 'regionId'),
    regionName: optionalText(r, 'regionName'),
    missionType: optionalText(r, 'missionType'),
    triggerReason: readOptionalString(r, 'triggerReason'),
    boundaryWkt: readOptionalString(r, 'boundaryWkt'),
    confirmationDeadline: readOptionalString(r, 'confirmationDeadline'),
    managerInstructions: readOptionalString(r, 'managerInstructions'),
    priority: readString(r, 'priority', 'Normal').toUpperCase(),
    objective: normalizeObjective(r?.['objective']),
    priorityDefects: readArray(r?.['priorityDefects']).map(String),
    emergencyReason: readOptionalString(r, 'emergencyReason'),
    isImmediate: readBoolean(r, 'isImmediate'),
    team,
    confirmedCount,
    totalRequiredCount,
    allConfirmed,
    confirmationProgress: `${confirmedCount}/${totalRequiredCount}`,
    communicationLogs: [],
    sourceAssessmentId: readFirstString(r, ['sourceAssessmentId', 'preMissionAssessmentId', 'assessmentId']) || null,
    targets: normalizeTargets(r?.['targets']),
  };
};

/** `ListMissions` trả `{ items, pagination: { page, pageSize, totalItems, totalPages } }`. */
export const normalizePage = (source: unknown, filters: MissionFilters): MissionPage => {
  const r = asRecord(source);
  const pagination = asRecord(r?.['pagination']);
  const items = itemsValue(source).map(normalizeMission);
  const totalCount =
    readFirstNumber(pagination, ['totalItems', 'totalCount'], -1) >= 0
      ? readFirstNumber(pagination, ['totalItems', 'totalCount'])
      : readFirstNumber(r, ['totalCount', 'totalItems'], items.length);
  const pageSize = readNumber(pagination, 'pageSize', filters.pageSize);
  const fallbackPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const totalPages =
    readOptionalNumber(pagination, 'totalPages') ?? readOptionalNumber(r, 'totalPages') ?? fallbackPages;

  return {
    items,
    page: readNumber(pagination, 'page', filters.page),
    pageSize,
    totalCount,
    totalPages,
  };
};

export const itemsValue = (source: unknown): unknown[] =>
  Array.isArray(source) ? source : readArray(asRecord(source)?.['items']);

export function normalizeBackendDetection(raw: unknown): MissionBackendDetection {
  const r = asRecord(raw);
  const box = asRecord(r?.['boundingBox']);
  return {
    id: readString(r, 'id'),
    missionId: readString(r, 'missionId'),
    mediaId: optionalText(r, 'mediaId'),
    towerId: optionalText(r, 'towerId'),
    tower: optionalText(r, 'tower'),
    gps: optionalText(r, 'gps'),
    title: readString(r, 'title'),
    confidence: readNumber(r, 'confidence'),
    categoryCode: optionalText(r, 'categoryCode'),
    severityWeight: optionalNum(r, 'severityWeight'),
    isEmergency: readBoolean(r, 'isEmergency'),
    status: readString(r, 'status', 'Pending'),
    boundingBox: box
      ? { x: readNumber(box, 'x'), y: readNumber(box, 'y'), width: readNumber(box, 'width'), height: readNumber(box, 'height') }
      : undefined,
    timestampSeconds: readOptionalNumber(r, 'timestampSeconds'),
    timestampLabel: optionalText(r, 'timestampLabel'),
    frameIndex: readOptionalNumber(r, 'frameIndex'),
    imageUrl: optionalText(r, 'imageUrl'),
    sourceUrl: optionalText(r, 'sourceUrl'),
    description: optionalText(r, 'description'),
    detectedAt: optionalText(r, 'detectedAt'),
    reviewedByUserId: readOptionalString(r, 'reviewedByUserId'),
    reviewedAt: readOptionalString(r, 'reviewedAt'),
    reviewNotes: readOptionalString(r, 'reviewNotes'),
  };
}

export function normalizeBackendMaintenanceTask(raw: unknown): MissionBackendMaintenanceTask {
  const r = asRecord(raw);
  return {
    id: readString(r, 'id'),
    missionId: readString(r, 'missionId'),
    detectionId: optionalText(r, 'detectionId'),
    title: readString(r, 'title'),
    priority: readString(r, 'priority', 'Medium'),
    towerCode: optionalText(r, 'towerCode'),
    defectDescription: optionalText(r, 'defectDescription'),
    suggestedAction: optionalText(r, 'suggestedAction'),
    status: readString(r, 'status', 'Pending'),
    assignedTeam: optionalText(r, 'assignedTeam'),
    createdAt: optionalText(r, 'createdAt'),
  };
}

export function normalizeBackendActivity(raw: unknown): MissionBackendActivity {
  const r = asRecord(raw);
  return {
    id: readString(r, 'id'),
    missionId: readString(r, 'missionId'),
    senderUserId: optionalText(r, 'senderUserId'),
    senderName: readString(r, 'senderName', 'Hệ thống'),
    senderRole: readString(r, 'senderRole', 'SYSTEM'),
    content: readString(r, 'content'),
    timestamp: readString(r, 'timestamp'),
  };
}
