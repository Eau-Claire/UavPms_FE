import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { InspectionFilters, InspectionRecord, MonitorSummary, PagedResponse } from '../../../models/monitor.models';

export interface AssetMission {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly line: string;
  readonly towerCount: string;
  readonly surveyDate: string;
  readonly status: string;
  readonly description: string;
}

export interface UploadAnalysisFileRequest {
  readonly file: File;
  readonly notes?: string;
}

export interface UploadedAnalysisFile {
  readonly id: string;
  readonly fileUrl: string;
  readonly mediaType: string;
  readonly analysisType: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface AssetReportDetail {
  readonly id: string;
  readonly raw: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class AssetManagementApi {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getMissions(page = 1, pageSize = 5) {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<unknown>(`${this.apiBaseUrl}/missions`, { params }).pipe(
      map((response) => normalizePage(unwrapApiData(response), page, pageSize, normalizeMission)),
    );
  }

  getSummary() {
    return this.http.get<unknown>(`${this.apiBaseUrl}/monitor/summary`).pipe(
      map((response) => normalizeSummary(unwrapApiData(response))),
    );
  }

  getInspections(filters: InspectionFilters) {
    let params = new HttpParams().set('page', filters.page).set('pageSize', filters.pageSize);
    if (filters.missionId) params = params.set('missionId', filters.missionId);
    if (filters.isDefect !== null) params = params.set('isDefect', filters.isDefect);
    if (filters.fromDate) params = params.set('fromDate', new Date(filters.fromDate).toISOString());
    if (filters.toDate) params = params.set('toDate', new Date(filters.toDate).toISOString());
    return this.http.get<unknown>(`${this.apiBaseUrl}/monitor/inspections`, { params }).pipe(
      map((response) => normalizePage(unwrapApiData(response), filters.page, filters.pageSize, normalizeInspection)),
    );
  }

  getInspectionReport(id: string) {
    return this.http.get<unknown>(`${this.apiBaseUrl}/inspections/report/${id}`).pipe(
      map((response) => ({ id, raw: unwrapApiData(response) }) satisfies AssetReportDetail),
    );
  }

  uploadAnalysisFile(request: UploadAnalysisFileRequest) {
    const form = new FormData();
    form.append('files', request.file, request.file.name);
    form.append('analysisType', 'DefectDetection');
    if (request.notes) form.append('notes', request.notes);
    return this.http.post<unknown>(`${this.apiBaseUrl}/ai-analysis/upload`, form, {
      observe: 'events',
      reportProgress: true,
    });
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

const arrayValue = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  const source = record(value);
  const list = pick(source, 'items', 'records', 'results', 'data');
  return Array.isArray(list) ? list : [];
};

const normalizePage = <T>(
  value: unknown,
  page: number,
  pageSize: number,
  mapper: (value: unknown, index: number) => T,
): PagedResponse<T> => {
  const source = record(value);
  const items = arrayValue(value).map(mapper);
  const pagination = record(source['pagination']);
  const totalCount = numberValue(pick(source, 'totalCount', 'totalItems', 'count')) || numberValue(pagination['totalItems']) || items.length;
  return {
    items,
    page: numberValue(pick(source, 'page') ?? pagination['page']) || page,
    pageSize: numberValue(pick(source, 'pageSize') ?? pagination['pageSize']) || pageSize,
    totalCount,
    totalPages: numberValue(pick(source, 'totalPages') ?? pagination['totalPages']) || Math.max(1, Math.ceil(totalCount / pageSize)),
  };
};

const normalizeMission = (value: unknown, index: number): AssetMission => {
  const source = record(value);
  const createdAt = stringValue(source['createdAt']);
  return {
    id: stringValue(source['id'], `mission-${index}`),
    code: stringValue(pick(source, 'missionCode', 'code'), `MISSION-${index + 1}`),
    title: stringValue(source['title']),
    line: stringValue(pick(source, 'routeData', 'title', 'description'), 'Chưa có tuyến'),
    towerCount: 'N/A',
    surveyDate: createdAt ? new Date(createdAt).toLocaleDateString('vi-VN') : 'N/A',
    status: stringValue(source['status']),
    description: stringValue(source['description']),
  };
};

const normalizeSummary = (value: unknown): MonitorSummary => {
  const source = record(value);
  return {
    totalMissions: numberValue(source['totalMissions']),
    pendingMissions: numberValue(source['pendingMissions']),
    inProgressMissions: numberValue(source['inProgressMissions']),
    completedMissions: numberValue(source['completedMissions']),
    totalInspections: numberValue(source['totalInspections']),
    totalDefects: numberValue(source['totalDefects']),
    criticalDefects: numberValue(source['criticalDefects']),
  };
};

const normalizeInspection = (value: unknown, index: number): InspectionRecord => {
  const source = record(value);
  return {
    id: stringValue(pick(source, 'inspectionId', 'id'), `inspection-${index}`),
    missionId: stringValue(source['missionId']),
    missionName: stringValue(pick(source, 'missionTitle', 'missionName'), 'Unknown mission'),
    imageUrl: stringValue(source['imageUrl']) || undefined,
    isDefect: Boolean(source['isDefect']),
    defectType: stringValue(source['defectType']) || undefined,
    detectedAt: stringValue(pick(source, 'detectedAt', 'createdAt'), new Date(0).toISOString()),
  };
};
