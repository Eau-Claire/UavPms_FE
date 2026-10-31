import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import {
  ActiveEmergencyAlert,
  ALERT_STATUSES,
  AlertBoundingBox,
  AlertEscalation,
  AlertHistoryQuery,
  AlertPriority,
  AlertStatus,
  EmergencyAlertDetail,
  EmergencyAlertHistoryItem,
  EmergencyAlertHistoryPage,
  EscalateAlertPayload,
  EscalationTarget,
  ReviewAlertPayload,
  TriggerAlertPayload,
} from '../models/emergency-alert.models';

/** Vietnamese messages for the alert endpoints' error codes (api_spec Module 8). */
const ALERT_ERROR_MESSAGES: Record<string, string> = {
  ALERT_ALREADY_ACTIVE: 'Bất thường này đã có một cảnh báo khẩn cấp đang hoạt động.',
  INVALID_ESCALATION_TARGET: 'Không thể chuyển cấp cảnh báo cho chính bạn. Vui lòng chọn người nhận khác.',
};

export const alertErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  const body = error.error && typeof error.error === 'object' ? (error.error as Record<string, unknown>) : {};
  const code = typeof body['errorCode'] === 'string' ? body['errorCode'] : '';
  if (code && ALERT_ERROR_MESSAGES[code]) return ALERT_ERROR_MESSAGES[code];
  if (error.status === 0) return 'Không thể kết nối đến máy chủ.';
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (error.status === 404) return 'Không tìm thấy cảnh báo khẩn cấp.';
  if (error.status === 409) return ALERT_ERROR_MESSAGES['ALERT_ALREADY_ACTIVE'];
  const message = body['message'];
  return typeof message === 'string' && message ? message : fallback;
};

const ESCALATION_ROLES = new Set(['manager', 'systemadmin', 'admin']);

@Injectable({
  providedIn: 'root',
})
export class EmergencyAlertsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/alerts`;

  private readonly activeAlertsState = signal<readonly ActiveEmergencyAlert[]>([]);

  /** Last fetched `GET /alerts/active`; shared with the sidebar badge. */
  readonly activeAlerts = this.activeAlertsState.asReadonly();
  readonly activeCount = computed(() => this.activeAlertsState().length);

  /** `GET /alerts/active` returns a raw array. */
  fetchActiveAlerts(): Observable<readonly ActiveEmergencyAlert[]> {
    return this.http.get<unknown>(`${this.baseUrl}/active`).pipe(
      map((response) => arrayOf(response).map(normalizeActiveAlert)),
      tap((alerts) => this.activeAlertsState.set(alerts)),
    );
  }

  /** `GET /alerts?status&page&pageSize` returns a raw `{ totalCount, page, pageSize, items }`. */
  fetchAlertHistory(query: AlertHistoryQuery = {}): Observable<EmergencyAlertHistoryPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<unknown>(this.baseUrl, { params })
      .pipe(map((response) => normalizeHistoryPage(response, page, pageSize)));
  }

  /** `GET /alerts/{id}` (raw detail with escalation history). */
  getAlert(id: string): Observable<EmergencyAlertDetail> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}`)
      .pipe(map((response) => normalizeDetail(response)));
  }

  /** `PUT /alerts/{id}/review` → 204. Removes the alert from the active list on success. */
  reviewAlert(id: string, payload: ReviewAlertPayload): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${encodeURIComponent(id)}/review`, payload).pipe(
      map(() => undefined),
      tap(() => this.removeActive(id)),
    );
  }

  /** `POST /alerts/{id}/escalate` → 201 with the escalation (raw). */
  escalateAlert(id: string, payload: EscalateAlertPayload): Observable<AlertEscalation> {
    return this.http.post<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}/escalate`, payload).pipe(
      map((response) => normalizeEscalation(response)),
      tap(() => this.removeActive(id)),
    );
  }

  /** `POST /alerts/trigger` → 201 with the alert detail; 409 `ALERT_ALREADY_ACTIVE` when one is active. */
  triggerAlert(payload: TriggerAlertPayload): Observable<EmergencyAlertDetail> {
    return this.http.post<unknown>(`${this.baseUrl}/trigger`, payload).pipe(
      map((response) => normalizeDetail(response)),
      tap((alert) => {
        if (alert.status === 'Active' && !this.activeAlertsState().some((a) => a.id === alert.id)) {
          this.activeAlertsState.update((list) => [alert, ...list]);
        }
      }),
    );
  }

  /**
   * Users an alert can be escalated to (Manager / SystemAdmin). Uses `GET /users`, which the
   * backend currently restricts to SystemAdmin; other roles get 403 and must enter the user ID.
   */
  getEscalationTargets(): Observable<readonly EscalationTarget[]> {
    const params = new HttpParams().set('page', 1).set('pageSize', 100);
    return this.http.get<unknown>(`${environment.apiBaseUrl}/users`, { params }).pipe(
      map((response) =>
        arrayOf(unwrapApiData(response))
          .map(normalizeUser)
          .filter((user) => user.id && ESCALATION_ROLES.has(user.role.toLowerCase())),
      ),
    );
  }

  private removeActive(id: string): void {
    this.activeAlertsState.update((list) => list.filter((alert) => alert.id !== id));
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const arrayOf = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  const items = record(value)['items'];
  return Array.isArray(items) ? items : [];
};

const stringOf = (value: unknown, fallback = ''): string =>
  value === undefined || value === null ? fallback : String(value);

const optionalString = (value: unknown): string | null => {
  const text = stringOf(value).trim();
  return text ? text : null;
};

const optionalNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toStatus = (value: unknown): AlertStatus => {
  const text = stringOf(value).toLowerCase();
  return ALERT_STATUSES.find((status) => status.toLowerCase() === text) ?? 'Active';
};

const toPriority = (value: unknown): AlertPriority => {
  const text = stringOf(value).toLowerCase();
  if (text === 'high') return 'High';
  if (text === 'medium') return 'Medium';
  if (text === 'low') return 'Low';
  return 'Critical';
};

/** Evidence bounding boxes arrive as a JSON string: `{x,y,width,height}` or `[x,y,w,h]`, normalized or pixels. */
export const parseAlertBoundingBox = (value: unknown): AlertBoundingBox | null => {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  let x: number;
  let y: number;
  let width: number;
  let height: number;
  if (Array.isArray(parsed) && parsed.length >= 4) {
    [x, y, width, height] = parsed.map((n) => Number(n) || 0);
  } else if (parsed && typeof parsed === 'object') {
    const box = parsed as Record<string, unknown>;
    x = Number(box['x'] ?? box['left']) || 0;
    y = Number(box['y'] ?? box['top']) || 0;
    width = Number(box['width'] ?? box['w']) || 0;
    height = Number(box['height'] ?? box['h']) || 0;
  } else {
    return null;
  }
  if (width <= 0 || height <= 0) return null;
  if (x <= 1 && y <= 1 && width <= 1 && height <= 1) {
    return { x: x * 100, y: y * 100, width: width * 100, height: height * 100, isNormalized: true };
  }
  return { x, y, width, height, isNormalized: false };
};

const toPercent = (value: unknown): number | null => {
  const score = optionalNumber(value);
  if (score === null) return null;
  return Math.round(score <= 1 ? score * 100 : score);
};

export const normalizeActiveAlert = (value: unknown): ActiveEmergencyAlert => {
  const source = record(value);
  const location = record(source['location']);
  const evidence = record(source['evidence']);
  const towerCode = stringOf(source['towerCode']) || stringOf(location['towerCode']);
  return {
    id: stringOf(source['id']),
    anomalyId: stringOf(source['anomalyId']),
    towerId: optionalString(source['towerId']),
    towerCode,
    alertType: stringOf(source['alertType']),
    categoryName: stringOf(source['categoryName']),
    priority: toPriority(source['priority']),
    status: toStatus(source['status']),
    deliveryLatencySeconds: optionalNumber(source['deliveryLatencySeconds']) ?? 0,
    triggeredAt: stringOf(source['triggeredAt']),
    location: {
      latitude: optionalNumber(location['latitude']),
      longitude: optionalNumber(location['longitude']),
      towerCode: stringOf(location['towerCode']) || towerCode,
    },
    evidence: {
      mediaUrl: optionalString(evidence['mediaUrl']),
      boundingBox: parseAlertBoundingBox(evidence['boundingBox']),
      confidenceScore: toPercent(evidence['confidenceScore']),
    },
  };
};

const normalizeHistoryItem = (value: unknown): EmergencyAlertHistoryItem => {
  const source = record(value);
  return {
    id: stringOf(source['id']),
    towerCode: stringOf(source['towerCode']),
    alertType: stringOf(source['alertType']),
    priority: toPriority(source['priority']),
    status: toStatus(source['status']),
    triggeredAt: stringOf(source['triggeredAt']),
    resolvedAt: optionalString(source['resolvedAt']),
    reviewedBy: optionalString(source['reviewedBy']),
    notes: optionalString(source['notes']),
  };
};

const normalizeHistoryPage = (value: unknown, page: number, pageSize: number): EmergencyAlertHistoryPage => {
  const source = record(value);
  const items = arrayOf(value).map(normalizeHistoryItem);
  return {
    totalCount: optionalNumber(source['totalCount']) ?? items.length,
    page: optionalNumber(source['page']) ?? page,
    pageSize: optionalNumber(source['pageSize']) ?? pageSize,
    items,
  };
};

const normalizeEscalation = (value: unknown): AlertEscalation => {
  const source = record(value);
  return {
    id: stringOf(source['id']),
    escalatedBy: stringOf(source['escalatedBy']),
    escalatedByName: stringOf(source['escalatedByName']),
    escalatedTo: stringOf(source['escalatedTo']),
    escalatedToName: stringOf(source['escalatedToName']),
    reason: stringOf(source['reason']),
    escalatedAt: stringOf(source['escalatedAt']),
  };
};

const normalizeDetail = (value: unknown): EmergencyAlertDetail => {
  const source = record(value);
  const escalations = Array.isArray(source['escalations']) ? (source['escalations'] as unknown[]) : [];
  const missionId = optionalString(source['missionId']);
  return {
    ...normalizeActiveAlert(value),
    missionId: missionId === '00000000-0000-0000-0000-000000000000' ? null : missionId,
    receivedAt: optionalString(source['receivedAt']),
    resolvedAt: optionalString(source['resolvedAt']),
    reviewedByUserId: optionalString(source['reviewedByUserId']),
    reviewedByName: optionalString(source['reviewedByName']),
    notes: optionalString(source['notes']),
    escalations: escalations.map(normalizeEscalation),
  };
};

const normalizeUser = (value: unknown): EscalationTarget => {
  const source = record(value);
  const roles = Array.isArray(source['roles']) ? (source['roles'] as unknown[]).map(String) : [];
  const role = roles.find((r) => ESCALATION_ROLES.has(r.toLowerCase())) ?? roles[0] ?? stringOf(source['role']);
  return {
    id: stringOf(source['id']),
    fullName: stringOf(source['fullName']) || stringOf(source['email']),
    email: stringOf(source['email']),
    role,
  };
};
