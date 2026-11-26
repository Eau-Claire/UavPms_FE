import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { DashboardSnapshot, DefectStatistic, InspectionFilters, InspectionRecord, MissionStatus, MonitorAlert, MonitorSummary, PagedResponse, RecentDefect } from '../../../models/monitor.models';
import { asRecord, readArray, readBoolean, readFirstString, readNumber, readOptionalString, readString } from '../../../shared/utils';

export const LOCAL_STORAGE_READ_ALERTS_KEY = 'uav_pms_read_alerts_v1';

export const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getReadAlertIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_READ_ALERTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // ignore storage read errors
  }
  return new Set<string>();
}

export function markAlertIdAsReadLocally(id: string): void {
  try {
    const set = getReadAlertIds();
    set.add(id);
    localStorage.setItem(LOCAL_STORAGE_READ_ALERTS_KEY, JSON.stringify([...set]));
  } catch {
    // ignore storage write errors
  }
}

export function markAllAlertIdsAsReadLocally(ids: readonly string[]): void {
  try {
    const set = getReadAlertIds();
    for (const id of ids) set.add(id);
    localStorage.setItem(LOCAL_STORAGE_READ_ALERTS_KEY, JSON.stringify([...set]));
  } catch {
    // ignore storage write errors
  }
}

/** `/monitor/*` endpoints (OperationsService MonitorController); every response is wrapped in ApiResponse. */
@Injectable({
  providedIn: 'root',
})
export class MonitorApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/monitor`;

  getDashboard(page = 1, pageSize = 5) {
    return forkJoin({
      summary: this.get<unknown>('summary').pipe(catchError(() => of({}))),
      recentDefects: this.get<unknown>('recent-defects', { page, pageSize }).pipe(catchError(() => of({}))),
      defectStatistics: this.get<unknown>('defects-statistics').pipe(catchError(() => of({}))),
      missionStatus: this.get<unknown>('mission-status').pipe(catchError(() => of({}))),
      alerts: this.get<unknown>('alerts').pipe(catchError(() => of({}))),
    }).pipe(map((value): DashboardSnapshot => {
      const readSet = getReadAlertIds();
      return {
        summary: normalizeSummary(value.summary),
        recentDefects: normalizePage(value.recentDefects, page, pageSize, normalizeDefect),
        defectStatistics: normalizeStatistics(value.defectStatistics),
        missionStatus: normalizeMissionStatuses(value.missionStatus),
        alerts: itemsOf(value.alerts)
          .map((item, index) => normalizeAlert(item, index, readSet))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      };
    }));
  }

  /** `GET /monitor/alerts`: the signed-in user's own unread notifications, newest first. */
  getAlerts() {
    return this.get<unknown>('alerts').pipe(map((value) => {
      const readSet = getReadAlertIds();
      return itemsOf(value)
        .map((item, index) => normalizeAlert(item, index, readSet))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }));
  }

  /** `GET /monitor/recent-defects?page&pageSize` (system-wide). */
  getRecentDefects(page = 1, pageSize = 5) {
    return this.get<unknown>('recent-defects', { page, pageSize }).pipe(map((value) => normalizePage(value, page, pageSize, normalizeDefect)));
  }

  getInspections(filters: InspectionFilters) {
    // The backend binds `missionId` as a Guid; anything else would be a 400.
    if (filters.missionId && !GUID_PATTERN.test(filters.missionId)) filters = { ...filters, missionId: '' };
    const query: Record<string, string | number | boolean> = { page: filters.page, pageSize: filters.pageSize };
    if (filters.missionId) query['missionId'] = filters.missionId;
    if (filters.isDefect !== null) query['isDefect'] = filters.isDefect;
    if (filters.fromDate) query['fromDate'] = new Date(filters.fromDate).toISOString();
    if (filters.toDate) query['toDate'] = new Date(filters.toDate).toISOString();
    return this.get<unknown>('inspections', query).pipe(map((value) => normalizePage(value, filters.page, filters.pageSize, normalizeInspection)));
  }

  private get<T>(path: string, query: Record<string, string | number | boolean> = {}) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) params = params.set(key, String(value));
    return this.http.get<T>(`${this.baseUrl}/${path}`, { params }).pipe(map((response) => unwrapApiData(response)));
  }
}

const itemsOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : readArray(asRecord(value)?.['items']);

/** `GET /monitor/summary` → DashboardSummaryDto. */
const normalizeSummary = (value: unknown): MonitorSummary => {
  const s = asRecord(value);
  return {
    totalMissions: readNumber(s, 'totalMissions'),
    pendingMissions: readNumber(s, 'pendingMissions'),
    inProgressMissions: readNumber(s, 'inProgressMissions'),
    completedMissions: readNumber(s, 'completedMissions'),
    totalInspections: readNumber(s, 'totalInspections'),
    totalDefects: readNumber(s, 'totalDefects'),
    criticalDefects: readNumber(s, 'criticalDefects'),
  };
};

/** Paged monitor responses are `{ items, pagination: { page, pageSize, totalItems, totalPages } }`. */
const normalizePage = <T>(value: unknown, page: number, pageSize: number, mapper: (value: unknown, index: number) => T): PagedResponse<T> => {
  const items = itemsOf(value).map(mapper);
  const pagination = asRecord(asRecord(value)?.['pagination']);
  const totalCount = readNumber(pagination, 'totalItems') || items.length;
  return {
    items,
    page: readNumber(pagination, 'page') || page,
    pageSize: readNumber(pagination, 'pageSize') || pageSize,
    totalCount,
    totalPages: readNumber(pagination, 'totalPages') || Math.max(1, Math.ceil(totalCount / pageSize)),
  };
};

/** `RecentDefectDto { inspectionId, missionId, missionTitle, imageUrl, defectType, detectedAt }`. */
const normalizeDefect = (value: unknown, index: number): RecentDefect => {
  const s = asRecord(value);
  return {
    id: readFirstString(s, ['inspectionId', 'id'], `defect-${index}`),
    missionId: readOptionalString(s, 'missionId') ?? undefined,
    missionName: readFirstString(s, ['missionTitle', 'missionName'], 'Nhiệm vụ không xác định'),
    defectType: readString(s, 'defectType', 'Chưa phân loại'),
    detectedAt: readString(s, 'detectedAt', new Date(0).toISOString()),
    imageUrl: readFirstString(s, ['imageUrl', 'mediaUrl', 'thumbnailUrl', 'cropUrl', 'fileUrl']) || undefined,
  };
};

/** `InspectionHistoryDto` = RecentDefectDto + `isDefect`. */
const normalizeInspection = (value: unknown, index: number): InspectionRecord => {
  const d = normalizeDefect(value, index);
  const s = asRecord(value);
  const defectType = readOptionalString(s, 'defectType');
  const thumbnailUrl = readFirstString(s, ['thumbnailUrl', 'cropUrl']) || undefined;
  return {
    id: d.id,
    missionId: d.missionId ?? '',
    missionName: d.missionName,
    imageUrl: d.imageUrl,
    thumbnailUrl: thumbnailUrl && thumbnailUrl !== d.imageUrl ? thumbnailUrl : undefined,
    isDefect: readBoolean(s, 'isDefect'),
    defectType: defectType ?? undefined,
    detectedAt: d.detectedAt,
  };
};

/** `DefectStatisticsDto { totalDefects, byType: [{ type, count }] }`. */
const normalizeStatistics = (value: unknown): readonly DefectStatistic[] => {
  const byType = asRecord(value)?.['byType'];
  const list = Array.isArray(byType) ? byType : itemsOf(value);
  return list.map((item) => {
    const s = asRecord(item);
    return { defectType: readFirstString(s, ['type', 'defectType'], 'Khác'), count: readNumber(s, 'count') };
  });
};

/** `ActiveAlertDto { notificationId, title, message, createdAt, isRead }` inside `{ items }`. */
const normalizeAlert = (value: unknown, index: number, readSet: Set<string> = new Set()): MonitorAlert => {
  const s = asRecord(value);
  const id = readFirstString(s, ['notificationId', 'id'], `alert-${index}`);
  const isRead = readBoolean(s, 'isRead') || readSet.has(id);
  return {
    id,
    title: readString(s, 'title', 'Cảnh báo hệ thống'),
    message: readString(s, 'message'),
    createdAt: readString(s, 'createdAt', new Date(0).toISOString()),
    isRead,
  };
};

/** `MissionStatusOverviewDto { pending, inProgress, completed }`. */
const normalizeMissionStatuses = (value: unknown): readonly MissionStatus[] => {
  const s = asRecord(value);
  return [
    { status: 'Pending', count: readNumber(s, 'pending') },
    { status: 'InProgress', count: readNumber(s, 'inProgress') },
    { status: 'Completed', count: readNumber(s, 'completed') },
  ];
};
