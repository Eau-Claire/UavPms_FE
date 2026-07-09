import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { DashboardSnapshot, DefectStatistic, InspectionFilters, InspectionRecord, MissionStatus, MonitorAlert, MonitorSummary, PagedResponse, RecentDefect } from '../../../models/monitor.models';

@Injectable({
  providedIn: 'root',
})
export class MonitorApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/monitor`;

  getDashboard(page = 1, pageSize = 5) {
    return forkJoin({
      summary: this.get<unknown>('summary'),
      recentDefects: this.get<unknown>('recent-defects', { page, pageSize }),
      defectStatistics: this.get<unknown>('defects-statistics'),
      missionStatus: this.get<unknown>('mission-status'),
      alerts: this.get<unknown>('alerts'),
    }).pipe(map((value): DashboardSnapshot => ({
      summary: normalizeSummary(value.summary),
      recentDefects: normalizePage(value.recentDefects, page, pageSize, normalizeDefect),
      defectStatistics: normalizeArray(value.defectStatistics).map(normalizeStatistic),
      missionStatus: normalizeMissionStatuses(value.missionStatus),
      alerts: normalizeArray(value.alerts).map(normalizeAlert).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    })));
  }

  getInspections(filters: InspectionFilters) {
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

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const numberValue = (value: unknown): number => Number(value ?? 0) || 0;
const stringValue = (value: unknown, fallback = ''): string => value == null ? fallback : String(value);
const pick = (source: Record<string, unknown>, ...keys: string[]): unknown => keys.map((key) => source[key]).find((value) => value !== undefined);
const normalizeArray = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  const source = record(value);
  const list = pick(source, 'items', 'results', 'data', 'records');
  return Array.isArray(list) ? list : [];
};

const normalizeSummary = (value: unknown): MonitorSummary => {
  const source = record(value);
  return {
    totalMissions: numberValue(pick(source, 'totalMissions', 'missionTotal')),
    pendingMissions: numberValue(pick(source, 'pendingMissions', 'pending')),
    inProgressMissions: numberValue(pick(source, 'inProgressMissions', 'inProgress')),
    completedMissions: numberValue(pick(source, 'completedMissions', 'completed')),
    totalInspections: numberValue(pick(source, 'totalInspections', 'inspectionTotal')),
    totalDefects: numberValue(pick(source, 'totalDefects', 'defectTotal')),
    criticalDefects: numberValue(pick(source, 'criticalDefects', 'critical')),
  };
};

const normalizePage = <T>(value: unknown, page: number, pageSize: number, mapper: (value: unknown, index: number) => T): PagedResponse<T> => {
  const source = record(value); const items = normalizeArray(value).map(mapper);
  const totalCount = numberValue(pick(source, 'totalCount', 'total', 'count')) || items.length;
  return { items, page: numberValue(source['page']) || page, pageSize: numberValue(source['pageSize']) || pageSize, totalCount, totalPages: numberValue(source['totalPages']) || Math.max(1, Math.ceil(totalCount / pageSize)) };
};

const normalizeDefect = (value: unknown, index: number): RecentDefect => { const s = record(value); return { id: stringValue(pick(s, 'id', 'inspectionId'), `defect-${index}`), missionId: stringValue(s['missionId']) || undefined, missionName: stringValue(pick(s, 'missionName', 'mission', 'missionCode'), 'Unknown mission'), defectType: stringValue(pick(s, 'defectType', 'type', 'classification'), 'Unclassified'), detectedAt: stringValue(pick(s, 'detectedAt', 'detectionTime', 'createdAt'), new Date(0).toISOString()), imageUrl: stringValue(pick(s, 'imageUrl', 'image', 'thumbnailUrl')) || undefined, severity: stringValue(s['severity']) || undefined }; };
const normalizeInspection = (value: unknown, index: number): InspectionRecord => { const d = normalizeDefect(value, index); const s = record(value); return { id: d.id, missionId: d.missionId ?? '', missionName: d.missionName, imageUrl: d.imageUrl, isDefect: Boolean(pick(s, 'isDefect', 'hasDefect', 'defectDetected')), defectType: d.defectType === 'Unclassified' ? undefined : d.defectType, detectedAt: d.detectedAt }; };
const normalizeStatistic = (value: unknown): DefectStatistic => { const s = record(value); return { defectType: stringValue(pick(s, 'defectType', 'type', 'name', 'label'), 'Other'), count: numberValue(pick(s, 'count', 'value', 'total')) }; };
const normalizeAlert = (value: unknown, index: number): MonitorAlert => { const s = record(value); return { id: stringValue(s['id'], `alert-${index}`), title: stringValue(pick(s, 'title', 'alertTitle'), 'System alert'), message: stringValue(pick(s, 'message', 'body', 'description')), createdAt: stringValue(pick(s, 'createdAt', 'createdTime', 'timestamp'), new Date(0).toISOString()), isRead: Boolean(pick(s, 'isRead', 'read')), severity: stringValue(pick(s, 'severity', 'type')) || undefined }; };
const normalizeMissionStatuses = (value: unknown): readonly MissionStatus[] => {
  const source = record(value); const list = normalizeArray(value);
  if (list.length) return list.map((item) => { const s = record(item); return { status: stringValue(pick(s, 'status', 'name', 'label')), count: numberValue(pick(s, 'count', 'value', 'total')) }; });
  return [{ status: 'Pending', count: numberValue(pick(source, 'pending', 'pendingMissions')) }, { status: 'InProgress', count: numberValue(pick(source, 'inProgress', 'inProgressMissions')) }, { status: 'Completed', count: numberValue(pick(source, 'completed', 'completedMissions')) }];
};

