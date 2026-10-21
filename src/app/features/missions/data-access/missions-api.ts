import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { Auth } from '../../../core/auth/auth';
import {
  Mission,
  MissionAssignment,
  MissionAssignmentsOverview,
  MissionBackendActivity,
  MissionBackendDetection,
  MissionBackendMaintenanceTask,
  MissionCommunicationLog,
  MissionCreateRequest,
  MissionMutationRequest,
  MissionPage,
  MissionTarget,
  MissionPriority,
  InspectionObjective,
  CheckResourceConflictsRequest,
  CheckResourceConflictsResponse,
  UpdateMissionPriorityRequest,
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

export function generateGuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function syncMissionsWithAssessments(): void {
  // Direct API integration - no local storage sync needed
}

@Injectable({ providedIn: 'root' })
export class MissionsApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly url = `${environment.apiBaseUrl}/missions`;

  list(filters: MissionFilters): Observable<MissionPage> {
    let params = new HttpParams().set('page', filters.page).set('pageSize', filters.pageSize);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.status) params = params.set('status', filters.status);
    if (filters.priority) params = params.set('priority', filters.priority);
    if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    if (typeof filters.sortDescending === 'boolean') params = params.set('sortDescending', filters.sortDescending);
    return this.http.get<unknown>(this.url, { params }).pipe(
      map((response) => normalizePage(unwrapApiData(response), filters))
    );
  }

  checkResourceConflicts(request: CheckResourceConflictsRequest): Observable<CheckResourceConflictsResponse> {
    return this.http.post<unknown>(`${this.url}/check-resource-conflicts`, request).pipe(
      map((res) => unwrapApiData(res) as CheckResourceConflictsResponse)
    );
  }

  updatePriority(missionId: string, request: UpdateMissionPriorityRequest): Observable<Mission> {
    return this.http.patch<unknown>(`${this.url}/${missionId}/priority`, request).pipe(
      map((res) => normalizeMission(unwrapApiData(res)))
    );
  }

  my(): Observable<readonly Mission[]> {
    return this.http.get<unknown>(`${this.url}/my`).pipe(
      map((res) => {
        const myItems = itemsValue(unwrapApiData(res));
        return myItems.map(normalizeMission);
      })
    );
  }

  get(id: string): Observable<Mission> {
    return this.http
      .get<unknown>(`${this.url}/${id}`)
      .pipe(map((response) => normalizeMission(unwrapApiData(response))));
  }

  create(request: MissionCreateRequest): Observable<Mission> {
    const assessmentId = request.sourceAssessmentId || request.assessmentId;
    const assignments =
      request.assignments ||
      request.personnel ||
      (request.inspectorId ? [{ userId: request.inspectorId, role: 'INSPECTOR', isRequired: true }] : []);

    const createBody: Record<string, unknown> = {
      title: request.name || request.title || 'Nhiệm vụ kiểm tra hành lang đường dây',
      name: request.name || request.title || 'Nhiệm vụ kiểm tra hành lang đường dây',
      description: request.description || '',
      regionId: request.regionId || 'reg-cpc',
      missionType: request.missionType || (request.scheduleId ? 'SCHEDULED' : 'AD_HOC'),
      scheduleId: request.scheduleId || null,
      triggerReason: request.triggerReason || null,
      plannedStart: request.scheduledAt || request.plannedStart,
      plannedEnd: request.plannedEnd,
      confirmationDeadline: request.confirmationDeadline,
      managerInstructions: request.managerInstructions,
    };

    if (request.priority) createBody['priority'] = request.priority;
    if (request.objective) createBody['objective'] = request.objective;
    if (request.priorityDefects) createBody['priorityDefects'] = request.priorityDefects;
    if (request.emergencyReason) createBody['emergencyReason'] = request.emergencyReason;
    if (typeof request.isImmediate === 'boolean') createBody['isImmediate'] = request.isImmediate;

    if (assignments && assignments.length > 0) {
      createBody['assignments'] = assignments.map((a) => ({
        userId: a.userId,
        role: a.role,
        isRequired: a.isRequired ?? true,
      }));
    }
    if (request.inspectorId) {
      createBody['inspectorId'] = request.inspectorId;
      createBody['assignedToUserId'] = request.inspectorId;
    }
    if (request.droneId) {
      createBody['droneId'] = request.droneId;
    }
    if (request.idempotencyKey) createBody['idempotencyKey'] = request.idempotencyKey;
    if (assessmentId) {
      createBody['assessmentId'] = assessmentId;
      createBody['sourceAssessmentId'] = assessmentId;
    }

    const mainEndpoint = this.url;

    return this.http.post<unknown>(mainEndpoint, createBody).pipe(
      map((response) => {
        const data = unwrapApiData(response);
        if (typeof data === 'string') return data;
        const rec = record(data);
        const candId = pick(rec, 'id', 'missionId');
        return typeof candId === 'string' ? candId : stringValue(rec['id']);
      }),
      switchMap((missionId) =>
        missionId && request.targetAssetIds && request.targetAssetIds.length > 0
          ? this.http
              .put(`${this.url}/${missionId}/assets`, { boundaryWkt: request.boundaryWkt, assetIds: request.targetAssetIds })
              .pipe(map(() => missionId))
          : of(missionId)
      ),
      switchMap((missionId) => {
        if (!missionId) return throwError(() => new Error('Backend did not return the created mission ID.'));
        if (assignments.length === 0) return of(missionId);
        const assignCalls$ = assignments.map((a) =>
          this.http
            .post(`${this.url}/${missionId}/assignments`, {
              userId: a.userId,
              assignmentRole: a.role === 'INSPECTOR' ? 'Inspector' : a.role,
            })
            .pipe(catchError(() => of(null)))
        );
        return forkJoin(assignCalls$).pipe(map(() => missionId));
      }),
      switchMap((missionId) => {
        const droneId = request.droneId || (request.droneIds && request.droneIds[0]);
        return droneId
          ? this.http.post(`${this.url}/${missionId}/drone`, { droneId }).pipe(map(() => missionId))
          : of(missionId);
      }),
      switchMap((missionId) => this.get(missionId))
    );
  }

  confirmMission(id: string, notes?: string): Observable<Mission> {
    return this.acceptAssignment(id, undefined, notes, 'INSPECTOR', 'Thanh tra viên / Phi công UAV');
  }

  acceptAssignment(
    id: string,
    assignmentId?: string,
    notes?: string,
    role = 'INSPECTOR',
    _roleLabel = 'Inspector'
  ): Observable<Mission> {
    const payload = { assignmentId, notes, role };
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/accept`, payload)
      .pipe(
        catchError(() => this.http.post<unknown>(`${this.url}/${id}/assignments/respond`, { assignmentId, responseStatus: 'Accepted', notes })),
        catchError(() => this.http.post<unknown>(`${this.url}/${id}/confirm`, { notes })),
        switchMap(() => this.get(id))
      );
  }

  postponeAssignment(
    id: string,
    arg2?: string,
    arg3?: string,
    arg4 = 'INSPECTOR',
    _userName?: string
  ): Observable<Mission> {
    const isArg2Id = arg2 && (isValidGuid(arg2) || arg2.startsWith('asg-'));
    const assignmentId = isArg2Id ? arg2 : arg3;
    const reason = isArg2Id ? (arg3 || '') : (arg2 || '');
    const role = arg4 || 'INSPECTOR';
    const payload = { assignmentId, reason, role };
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/postpone`, payload)
      .pipe(
        catchError(() => this.http.post<unknown>(`${this.url}/${id}/assignments/respond`, { assignmentId, responseStatus: 'Postponed', notes: reason })),
        catchError(() => this.http.post<unknown>(`${this.url}/${id}/postpone`, { reason })),
        switchMap(() => this.get(id))
      );
  }

  reassignAssignment(
    id: string,
    assignmentId: string,
    newUserId: string,
    arg4 = '',
    arg5?: string,
    _newUserName?: string
  ): Observable<Mission> {
    const role = arg5 ? arg4 : '';
    const reason = arg5 ? arg5 : arg4;
    const payload = { assignmentId, newUserId, role, reason };
    return this.http
      .post<unknown>(`${this.url}/${id}/assignments/${assignmentId}/reassign`, payload)
      .pipe(
        catchError(() => this.http.post<unknown>(`${this.url}/${id}/assignments/reassign`, payload)),
        switchMap(() => this.get(id))
      );
  }

  suspendMission(id: string, reason: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/suspend`, { reason })
      .pipe(switchMap(() => this.get(id)));
  }

  resumeMission(id: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/resume`, { reason: 'Khôi phục nhiệm vụ' })
      .pipe(switchMap(() => this.get(id)));
  }

  cancelMissionWithReason(id: string, reason: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/cancel`, { reason })
      .pipe(switchMap(() => this.get(id)));
  }

  sendReminder(id: string): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/remind`, { reason: 'Nhắc nhở hạn chót xác nhận' })
      .pipe(
        catchError(() => this.http.post<unknown>(`${this.url}/${id}/communications`, { content: 'Nhắc nhở hạn chót xác nhận nhiệm vụ', senderRole: 'MANAGER' })),
        switchMap(() => this.get(id))
      );
  }

  sendCommunication(
    id: string,
    message: string,
    senderRole: 'MANAGER' | 'INSPECTOR' | 'ANALYST' | 'TECHNICIAN' = 'MANAGER',
    senderName = 'Quản lý vận hành EVN'
  ): Observable<Mission> {
    return this.http
      .post<unknown>(`${this.url}/${id}/communications`, { content: message, senderRole, senderName })
      .pipe(switchMap(() => this.get(id)));
  }

  checkIn(id: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/check-in`, {});
  }

  start(id: string): Observable<unknown> {
    return this.http
      .post<unknown>(`${this.url}/${id}/start`, {})
      .pipe(
        catchError(() => this.http.put<unknown>(`${this.url}/${id}/status`, { status: 'InProgress' }))
      );
  }

  complete(id: string): Observable<unknown> {
    return this.http
      .post<unknown>(`${this.url}/${id}/complete`, {})
      .pipe(
        catchError(() => this.http.put<unknown>(`${this.url}/${id}/status`, { status: 'Completed' }))
      );
  }

  cancel(id: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/cancel`, {});
  }

  confirmDroneHandover(
    id: string,
    payload: { droneId: string; receivedBy: string; condition: string; accepted?: boolean }
  ): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/drone-handover`, {
      droneId: payload.droneId,
      receivedBy: payload.receivedBy,
      condition: payload.condition,
      accepted: payload.accepted ?? true,
    });
  }

  returnDroneHandover(
    id: string,
    payload: { droneId: string; condition: string }
  ): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/drone-handover/return`, payload);
  }

  uploadFlightLog(
    id: string,
    file: File,
    payload?: { droneId?: string; flightDurationSeconds?: number; notes?: string }
  ): Observable<unknown> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (payload?.droneId) form.append('droneId', payload.droneId);
    if (payload?.flightDurationSeconds != null) form.append('flightDurationSeconds', String(payload.flightDurationSeconds));
    if (payload?.notes) form.append('notes', payload.notes);
    return this.http.post<unknown>(`${this.url}/${id}/flight-logs`, form);
  }

  getFlightLogs(id: string): Observable<unknown[]> {
    return this.http.get<unknown>(`${this.url}/${id}/flight-logs`).pipe(
      map((res) => {
        const data = unwrapApiData<unknown>(res);
        return Array.isArray(data) ? data : [];
      })
    );
  }

  submitIncidentReport(
    id: string,
    payload: { severity: string; description: string; droneId?: string; actionsTaken?: string }
  ): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/incidents`, payload);
  }

  getIncidentReports(id: string): Observable<unknown[]> {
    return this.http.get<unknown>(`${this.url}/${id}/incidents`).pipe(
      map((res) => {
        const data = unwrapApiData<unknown>(res);
        return Array.isArray(data) ? data : [];
      })
    );
  }

  uploadMedia(
    id: string,
    file: File,
    meta?: { assetId?: string; capturedAt?: string; latitude?: number; longitude?: number }
  ): Observable<unknown> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (meta?.assetId) form.append('assetId', meta.assetId);
    form.append('capturedAt', meta?.capturedAt || new Date().toISOString());
    if (meta?.latitude != null) form.append('latitude', String(meta.latitude));
    if (meta?.longitude != null) form.append('longitude', String(meta.longitude));
    return this.http.post<unknown>(`${this.url}/${id}/media`, form);
  }

  update(id: string, request: MissionMutationRequest): Observable<Mission> {
    return this.http
      .put<unknown>(`${this.url}/${id}`, request)
      .pipe(map((response) => normalizeMission(unwrapApiData(response))));
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete<unknown>(`${this.url}/${id}`);
  }

  getAssignmentsOverview(missionId: string): Observable<MissionAssignmentsOverview | null> {
    const v1Url = `${this.url}/${missionId}/assignments`;

    return this.http
      .get<unknown>(v1Url)
      .pipe(
        map((res) => {
          const raw = unwrapApiData(res);
          if (!raw || typeof raw !== 'object') return null;
          const data = raw as Record<string, unknown>;
          const rawAssignments = Array.isArray(data['assignments'])
            ? (data['assignments'] as any[])
            : Array.isArray(raw)
            ? (raw as any[])
            : [];

          const team: MissionAssignment[] = rawAssignments.map((item) => {
            const r = record(item);
            return {
              id: stringValue(pick(r, 'id', 'assignmentId')),
              missionId,
              userId: stringValue(pick(r, 'userId', 'assigneeId', 'assignedToUserId')),
              userName: stringValue(pick(r, 'userName', 'fullName', 'name', 'assigneeName')),
              assignmentRole: stringValue(pick(r, 'role', 'assignmentRole', 'roleName'), 'INSPECTOR').toUpperCase(),
              status: stringValue(r['status'], 'Active'),
              responseStatus: normalizeResponseStatus(pick(r, 'responseStatus', 'status')),
              isRequired: r['isRequired'] !== false,
              assignedAt: stringValue(pick(r, 'assignedAt', 'createdAt')),
              respondedAt: pick(r, 'respondedAt', 'confirmedAt') ? String(pick(r, 'respondedAt', 'confirmedAt')) : null,
              responseReason: pick(r, 'responseReason', 'notes', 'reason') ? String(pick(r, 'responseReason', 'notes', 'reason')) : null,
            };
          });

          const required = team.filter((t) => t.isRequired !== false && t.status !== 'Revoked');
          const confirmed = required.filter((t) => t.responseStatus === 'ACCEPTED');

          return {
            missionId,
            totalRequiredCount: required.length,
            confirmedCount: confirmed.length,
            allConfirmed: required.length > 0 && confirmed.length >= required.length,
            assignments: team,
          };
        }),
        catchError(() => of(null))
      );
  }

  getMissionDetections(missionId: string): Observable<readonly MissionBackendDetection[]> {
    return this.http
      .get<unknown>(`${this.url}/${missionId}/detections`)
      .pipe(
        map((res) => {
          const list = itemsValue(unwrapApiData(res));
          return list.map(normalizeBackendDetection);
        })
      );
  }

  reviewDetection(
    missionId: string,
    detectionId: string,
    payload: { status: 'CONFIRMED' | 'REJECTED' | 'PENDING' | 'Approved' | 'Rejected' | string; reviewNotes?: string }
  ): Observable<unknown> {
    return this.http
      .post<unknown>(`${this.url}/${missionId}/detections/${detectionId}/review`, payload)
      .pipe(
        catchError(() => this.http.put<unknown>(`${this.url}/${missionId}/detections/${detectionId}/review`, payload))
      );
  }

  getMissionMaintenanceTasks(missionId: string): Observable<readonly MissionBackendMaintenanceTask[]> {
    return this.http
      .get<unknown>(`${this.url}/${missionId}/maintenance-tasks`)
      .pipe(
        map((res) => {
          const list = itemsValue(unwrapApiData(res));
          return list.map(normalizeBackendMaintenanceTask);
        })
      );
  }

  getMissionActivities(missionId: string): Observable<readonly MissionBackendActivity[]> {
    return this.http
      .get<unknown>(`${this.url}/${missionId}/activities`)
      .pipe(
        map((res) => {
          const list = itemsValue(unwrapApiData(res));
          return list.map(normalizeBackendActivity);
        })
      );
  }

  addMissionActivity(
    missionId: string,
    payloadOrContent: string | { action: string; note?: string; metadata?: Record<string, unknown> },
    role?: string
  ): Observable<unknown> {
    const payload = typeof payloadOrContent === 'string'
      ? { action: 'Comment', note: payloadOrContent, metadata: role ? { role } : undefined }
      : payloadOrContent;
    return this.http.post<unknown>(`${this.url}/${missionId}/activities`, payload);
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const normalizeTargets = (source: unknown): readonly MissionTarget[] => {
  if (!Array.isArray(source)) return [];
  return source.map((item, index) => {
    const r = record(item);
    return {
      assetId: stringValue(pick(r, 'assetId', 'id'), `target-${index + 1}`),
      assetName: stringValue(pick(r, 'assetName', 'name'), `Vị trí cột ${index + 1}`),
      towerCode: stringValue(pick(r, 'towerCode', 'code'), `VT-${index + 1}`),
      assetType: 'TOWER',
      sequence: Number(pick(r, 'sequence', 'order') ?? index + 1),
      inspectionStatus: stringValue(pick(r, 'inspectionStatus', 'status'), 'Pending'),
      latitude: Number(pick(r, 'latitude', 'lat') ?? 0),
      longitude: Number(pick(r, 'longitude', 'lng') ?? 0),
      assetCode: stringValue(pick(r, 'assetCode', 'code'), `VT-${index + 1}`),
    };
  });
};

function normalizeResponseStatus(val: unknown): 'PENDING' | 'ACCEPTED' | 'POSTPONED' | 'REJECTED' | 'REPLACED' {
  const s = String(val || '').toUpperCase();
  if (s.includes('ACCEPT') || s === 'CONFIRMED' || s === 'AGREED') return 'ACCEPTED';
  if (s.includes('POSTPONE') || s.includes('DELAY')) return 'POSTPONED';
  if (s.includes('REJECT') || s.includes('DECLINE')) return 'REJECTED';
  if (s.includes('REPLACE')) return 'REPLACED';
  return 'PENDING';
}

function normalizeAssignmentsFromSource(source: Record<string, unknown>): readonly MissionAssignment[] {
  const list = Array.isArray(source['assignments'])
    ? (source['assignments'] as any[])
    : Array.isArray(source['team'])
    ? (source['team'] as any[])
    : Array.isArray(source['personnel'])
    ? (source['personnel'] as any[])
    : [];

  return list.map((item, idx) => {
    const r = record(item);
    return {
      id: stringValue(pick(r, 'id', 'assignmentId'), `asg-${idx + 1}`),
      missionId: stringValue(pick(r, 'missionId', 'id')),
      userId: stringValue(pick(r, 'userId', 'assigneeId', 'assignedToUserId')),
      userName: stringValue(pick(r, 'userName', 'fullName', 'name', 'assigneeName')),
      assignmentRole: stringValue(pick(r, 'role', 'assignmentRole', 'roleName'), 'INSPECTOR').toUpperCase(),
      status: stringValue(r['status'], 'Active'),
      responseStatus: normalizeResponseStatus(pick(r, 'responseStatus', 'status')),
      isRequired: r['isRequired'] !== false,
      assignedAt: stringValue(pick(r, 'assignedAt', 'createdAt')),
      respondedAt: pick(r, 'respondedAt', 'confirmedAt') ? String(pick(r, 'respondedAt', 'confirmedAt')) : null,
      responseReason: pick(r, 'responseReason', 'notes', 'reason') ? String(pick(r, 'responseReason', 'notes', 'reason')) : null,
    };
  });
}

function normalizeCommunicationLogs(source: Record<string, unknown>): readonly MissionCommunicationLog[] {
  const raw = Array.isArray(source['communicationLogs'])
    ? (source['communicationLogs'] as any[])
    : Array.isArray(source['communications'])
    ? (source['communications'] as any[])
    : [];

  return raw.map((item, idx) => {
    const r = record(item);
    return {
      id: stringValue(pick(r, 'id', 'logId'), `log-${idx + 1}`),
      senderId: stringValue(pick(r, 'senderId', 'userId'), 'system'),
      senderName: stringValue(pick(r, 'senderName', 'userName'), 'Hệ thống'),
      senderRole: (stringValue(pick(r, 'senderRole', 'role'), 'MANAGER')).toUpperCase() as any,
      type: (stringValue(pick(r, 'type', 'messageType'), 'DISPATCH')).toUpperCase() as any,
      content: stringValue(pick(r, 'content', 'message')),
      timestamp: stringValue(pick(r, 'timestamp', 'createdAt'), new Date().toISOString()),
    };
  });
}

export const normalizeMission = (source: unknown): Mission => {
  const r = record(source);
  const targets = normalizeTargets(pick(r, 'missionTargets', 'targets', 'assets'));
  const team = normalizeAssignmentsFromSource(r);
  const communicationLogs = normalizeCommunicationLogs(r);

  const confirmedCount = team.filter((t) => t.responseStatus === 'ACCEPTED' && t.isRequired !== false).length;
  const totalRequiredCount = team.filter((t) => t.isRequired !== false).length;
  const allConfirmed = totalRequiredCount > 0 && confirmedCount >= totalRequiredCount;

  return {
    id: stringValue(pick(r, 'id', 'missionId')),
    missionCode: stringValue(pick(r, 'missionCode', 'code'), stringValue(r['id'])),
    title: stringValue(pick(r, 'title', 'name', 'missionName')),
    routeData: stringValue(pick(r, 'routeData', 'route', 'corridorName')),
    assignedToUserId: stringValue(pick(r, 'assignedToUserId', 'inspectorId', 'userId')),
    assignedToUsername: stringValue(pick(r, 'assignedToUsername', 'inspectorName', 'userName')),
    droneCode: stringValue(pick(r, 'droneCode', 'uavCode', 'droneId')),
    status: stringValue(pick(r, 'status', 'lifecycleStatus'), 'Pending'),
    description: stringValue(r['description']),
    managerId: stringValue(pick(r, 'managerId', 'createdById')),
    managerUsername: stringValue(pick(r, 'managerUsername', 'createdByName')),
    createdAt: stringValue(r['createdAt']),
    updatedAt: stringValue(r['updatedAt']),
    scheduledStartAt: stringValue(pick(r, 'scheduledStartAt', 'scheduledAt', 'plannedStart')),
    plannedStart: stringValue(pick(r, 'plannedStart', 'scheduledStartAt', 'scheduledAt')),
    plannedEnd: stringValue(r['plannedEnd']),
    actualStart: pick(r, 'actualStart', 'startedAt') ? String(pick(r, 'actualStart', 'startedAt')) : null,
    actualCompleted: pick(r, 'actualCompleted', 'completedAt') ? String(pick(r, 'actualCompleted', 'completedAt')) : null,
    regionId: pick(r, 'regionId') ? String(pick(r, 'regionId')) : undefined,
    regionName: pick(r, 'regionName') ? String(pick(r, 'regionName')) : undefined,
    missionType: stringValue(pick(r, 'missionType', 'type'), 'SCHEDULED') as any,
    confirmationDeadline: pick(r, 'confirmationDeadline') ? String(pick(r, 'confirmationDeadline')) : undefined,
    managerInstructions: pick(r, 'managerInstructions') ? String(pick(r, 'managerInstructions')) : undefined,
    postponeReason: pick(r, 'postponeReason') ? String(pick(r, 'postponeReason')) : undefined,
    suspendedReason: pick(r, 'suspendedReason') ? String(pick(r, 'suspendedReason')) : undefined,
    cancellationReason: pick(r, 'cancellationReason', 'cancelReason') ? String(pick(r, 'cancellationReason', 'cancelReason')) : undefined,
    sourceAssessmentId: pick(r, 'sourceAssessmentId', 'assessmentId') ? String(pick(r, 'sourceAssessmentId', 'assessmentId')) : undefined,
    priority: (stringValue(pick(r, 'priority', 'level'), 'NORMAL')).toUpperCase() as any,
    objective: pick(r, 'objective') ? String(pick(r, 'objective')) : undefined,
    priorityDefects: Array.isArray(r['priorityDefects'])
      ? (r['priorityDefects'] as string[])
      : typeof r['priorityDefectsJson'] === 'string'
      ? JSON.parse(r['priorityDefectsJson'] || '[]')
      : [],
    emergencyReason: pick(r, 'emergencyReason') ? String(pick(r, 'emergencyReason')) : undefined,
    isImmediate: Boolean(pick(r, 'isImmediate')),
    team,
    confirmedCount,
    totalRequiredCount,
    allConfirmed,
    confirmationProgress: `${confirmedCount}/${totalRequiredCount}`,
    communicationLogs,
    targets,
  };
};

export const normalizePage = (source: unknown, filters: MissionFilters): MissionPage => {
  const r = record(source);
  const rawItems = itemsValue(source);
  const items = rawItems.map(normalizeMission);
  const totalCount = Number(pick(r, 'totalCount', 'total') ?? items.length);
  const totalPages = Number(pick(r, 'totalPages') ?? Math.max(1, Math.ceil(totalCount / filters.pageSize)));

  return {
    items,
    page: filters.page,
    pageSize: filters.pageSize,
    totalCount,
    totalPages,
  };
};

export const itemsValue = (source: unknown): readonly unknown[] => {
  if (Array.isArray(source)) return source;
  const r = record(source);
  const candidate = pick(r, 'items', 'missions', 'results', 'data');
  return Array.isArray(candidate) ? candidate : [];
};

export function normalizeBackendDetection(raw: unknown): MissionBackendDetection {
  const r = record(raw);
  return {
    id: stringValue(pick(r, 'id', 'detectionId')),
    missionId: stringValue(r['missionId']),
    mediaId: pick(r, 'mediaId') ? String(r['mediaId']) : undefined,
    assetId: pick(r, 'assetId') ? String(r['assetId']) : undefined,
    title: stringValue(pick(r, 'title', 'faultType', 'anomalyType', 'name'), 'Phát hiện bất thường'),
    confidence: Number(pick(r, 'confidence', 'aiConfidence') ?? 0.8),
    status: stringValue(pick(r, 'status', 'reviewStatus'), 'Pending'),
    reviewNotes: pick(r, 'reviewNotes', 'notes') ? String(pick(r, 'reviewNotes', 'notes')) : undefined,
    reviewedByUserId: pick(r, 'reviewedByUserId', 'reviewedBy') ? String(pick(r, 'reviewedByUserId', 'reviewedBy')) : undefined,
    reviewedAt: pick(r, 'reviewedAt') ? String(r['reviewedAt']) : undefined,
    imageUrl: pick(r, 'imageUrl', 'fileUrl') ? String(pick(r, 'imageUrl', 'fileUrl')) : undefined,
    detectedAt: stringValue(pick(r, 'detectedAt', 'createdAt'), new Date().toISOString()),
  };
}

export function normalizeBackendMaintenanceTask(raw: unknown): MissionBackendMaintenanceTask {
  const r = record(raw);
  return {
    id: stringValue(pick(r, 'id', 'taskId')),
    missionId: stringValue(r['missionId']),
    detectionId: pick(r, 'detectionId', 'defectReferenceId') ? String(pick(r, 'detectionId', 'defectReferenceId')) : undefined,
    title: stringValue(pick(r, 'title', 'taskTitle', 'name'), 'Bảo trì sửa chữa lưới điện'),
    priority: stringValue(pick(r, 'priority', 'level'), 'Medium'),
    status: stringValue(pick(r, 'status', 'taskStatus'), 'Pending'),
    defectDescription: pick(r, 'defectDescription', 'description') ? String(pick(r, 'defectDescription', 'description')) : undefined,
    createdAt: stringValue(pick(r, 'createdAt', 'scheduledDate'), new Date().toISOString()),
  };
}

export function normalizeBackendActivity(raw: unknown): MissionBackendActivity {
  const r = record(raw);
  return {
    id: stringValue(pick(r, 'id', 'activityId')),
    missionId: stringValue(r['missionId']),
    senderUserId: pick(r, 'senderUserId', 'userId') ? String(pick(r, 'senderUserId', 'userId')) : undefined,
    senderName: stringValue(pick(r, 'senderName', 'performedBy', 'userName', 'actorName'), 'Hệ thống'),
    senderRole: stringValue(pick(r, 'senderRole', 'performedByRole', 'role'), 'MANAGER'),
    content: stringValue(pick(r, 'content', 'action', 'note', 'message'), 'Hoạt động nhiệm vụ'),
    timestamp: stringValue(pick(r, 'timestamp', 'createdAt'), new Date().toISOString()),
  };
}
