import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import {
  PaginationMeta,
  TowerAnomaly,
  TowerFilters,
  TowerHistory,
  TowerHistoryFilters,
  TowerHistoryStats,
  TowerImportResult,
  TowerMaintenanceRecord,
  TowerPage,
  TowerSummary,
  TowerUpsertRequest,
} from '../../../models/assets.models';

/** Tower CRUD, history and Excel import (OperationsService TowerController). */
@Injectable({ providedIn: 'root' })
export class TowersApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/towers`;

  list(filters: TowerFilters): Observable<TowerPage> {
    let params = new HttpParams().set('page', filters.page).set('pageSize', filters.pageSize);
    if (filters.regionId) params = params.set('regionId', filters.regionId);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    return this.http.get<unknown>(this.url, { params }).pipe(
      map((response) => {
        const data = asRecord(unwrapApiData(response));
        const items = arrayOf(data['items']).map(normalizeTower);
        return { items, pagination: normalizePagination(data['pagination'], filters.page, filters.pageSize, items.length) };
      }),
    );
  }

  get(id: string): Observable<TowerSummary> {
    return this.http.get<unknown>(`${this.url}/${id}`).pipe(map((response) => normalizeTower(unwrapApiData(response))));
  }

  history(id: string, filters: TowerHistoryFilters): Observable<TowerHistory> {
    let params = new HttpParams().set('page', filters.page).set('pageSize', filters.pageSize);
    if (filters.validationStatus) params = params.set('validationStatus', filters.validationStatus);
    if (filters.from) params = params.set('from', toIsoStart(filters.from));
    if (filters.to) params = params.set('to', toIsoEnd(filters.to));
    return this.http.get<unknown>(`${this.url}/${id}/history`, { params }).pipe(
      map((response) => normalizeHistory(unwrapApiData(response), filters)),
    );
  }

  create(request: TowerUpsertRequest): Observable<TowerSummary> {
    return this.http.post<unknown>(this.url, cleanRequest(request)).pipe(map((response) => normalizeTower(unwrapApiData(response))));
  }

  update(id: string, request: TowerUpsertRequest): Observable<TowerSummary> {
    return this.http.put<unknown>(`${this.url}/${id}`, cleanRequest(request)).pipe(map((response) => normalizeTower(unwrapApiData(response))));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<unknown>(`${this.url}/${id}`).pipe(map(() => undefined));
  }

  /** Excel columns: region code (or RegionId), tower code, latitude, longitude, pole type, address. Row 1 is the header. */
  import(file: File): Observable<TowerImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<unknown>(`${this.url}/import`, form).pipe(
      map((response) => {
        const data = asRecord(unwrapApiData(response));
        return { importedCount: numberOf(data['importedCount']), skippedCount: numberOf(data['skippedCount']) };
      }),
    );
  }
}

/** Extracts the backend's ApiResponse message from an HttpErrorResponse, if any. */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const body = asRecord(asRecord(error)['error']);
  const message = body['message'] ?? body['title'];
  return typeof message === 'string' && message.trim() ? message : fallback;
};

export const apiErrorStatus = (error: unknown): number => numberOf(asRecord(error)['status']);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const stringOf = (value: unknown): string => (value === undefined || value === null ? '' : String(value));

const optionalString = (value: unknown): string | undefined => stringOf(value) || undefined;

const numberOf = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Date inputs give a local calendar day (yyyy-MM-dd). The backend compares against timestamptz columns,
 * so send UTC instants ("…Z"), which ASP.NET Core binds as DateTimeKind.Utc.
 */
const toUtcIso = (value: string, endOfDay: boolean): string => {
  const date = value.length === 10 ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};
const toIsoStart = (value: string): string => toUtcIso(value, false);
const toIsoEnd = (value: string): string => toUtcIso(value, true);

const cleanRequest = (request: TowerUpsertRequest): TowerUpsertRequest => ({
  regionId: request.regionId,
  towerCode: request.towerCode.trim(),
  poleType: request.poleType?.trim() || undefined,
  address: request.address?.trim() || undefined,
  latitude: Number(request.latitude),
  longitude: Number(request.longitude),
});

export const normalizeTower = (value: unknown): TowerSummary => {
  const source = asRecord(value);
  return {
    id: stringOf(source['id']),
    regionId: stringOf(source['regionId']),
    regionName: optionalString(source['regionName']),
    towerCode: stringOf(source['towerCode']),
    poleType: optionalString(source['poleType']),
    address: optionalString(source['address']),
    latitude: numberOf(source['latitude']),
    longitude: numberOf(source['longitude']),
  };
};

const normalizePagination = (value: unknown, page: number, pageSize: number, count: number): PaginationMeta => {
  const source = asRecord(value);
  const totalItems = numberOf(source['totalItems']) || count;
  return {
    page: numberOf(source['page']) || page,
    pageSize: numberOf(source['pageSize']) || pageSize,
    totalItems,
    totalPages: numberOf(source['totalPages']) || Math.max(1, Math.ceil(totalItems / pageSize)),
  };
};

const normalizeAnomaly = (value: unknown): TowerAnomaly => {
  const source = asRecord(value);
  return {
    id: stringOf(source['id']),
    mediaId: stringOf(source['mediaId']),
    missionId: stringOf(source['missionId']),
    categoryCode: optionalString(source['categoryCode']),
    categoryName: optionalString(source['categoryName']),
    confidenceScore: numberOf(source['confidenceScore']),
    validationStatus: stringOf(source['validationStatus']),
    aiSource: stringOf(source['aiSource']),
    imageUrl: optionalString(source['imageUrl']),
    cropUrl: optionalString(source['cropUrl']),
    detectedAt: stringOf(source['detectedAt']),
    validatedAt: optionalString(source['validatedAt']),
  };
};

const normalizeMaintenance = (value: unknown): TowerMaintenanceRecord => {
  const source = asRecord(value);
  return {
    id: stringOf(source['id']),
    ticketCode: stringOf(source['ticketCode']),
    anomalyId: stringOf(source['anomalyId']),
    status: stringOf(source['status']),
    priority: stringOf(source['priority']),
    description: stringOf(source['description']),
    managerId: stringOf(source['managerId']),
    technicianId: optionalString(source['technicianId']),
    createdAt: stringOf(source['createdAt']),
    dueDate: optionalString(source['dueDate']),
    startedAt: optionalString(source['startedAt']),
    resolvedAt: optionalString(source['resolvedAt']),
    proofs: arrayOf(source['proofs']).map((item) => {
      const proof = asRecord(item);
      return {
        id: stringOf(proof['id']),
        proofType: stringOf(proof['proofType']),
        fileUrl: stringOf(proof['fileUrl']),
        technicianNotes: stringOf(proof['technicianNotes']),
        uploadedAt: stringOf(proof['uploadedAt']),
      };
    }),
    materials: arrayOf(source['materials']).map((item) => {
      const material = asRecord(item);
      return {
        id: stringOf(material['id']),
        componentCode: stringOf(material['componentCode']),
        componentName: stringOf(material['componentName']),
        quantityUsed: numberOf(material['quantityUsed']),
        unit: stringOf(material['unit']),
        loggedAt: stringOf(material['loggedAt']),
      };
    }),
  };
};

const normalizeStats = (value: unknown): TowerHistoryStats => {
  const source = asRecord(value);
  return {
    totalAnomalies: numberOf(source['totalAnomalies']),
    pendingAnomalies: numberOf(source['pendingAnomalies']),
    confirmedAnomalies: numberOf(source['confirmedAnomalies']),
    openAnomalies: numberOf(source['openAnomalies']),
    totalTickets: numberOf(source['totalTickets']),
    openTickets: numberOf(source['openTickets']),
    inProgressTickets: numberOf(source['inProgressTickets']),
    activeTickets: numberOf(source['activeTickets']),
    lastInspectedAt: optionalString(source['lastInspectedAt']),
  };
};

const normalizeHistory = (value: unknown, filters: TowerHistoryFilters): TowerHistory => {
  const source = asRecord(value);
  const anomalies = arrayOf(source['anomalies']).map(normalizeAnomaly);
  const maintenanceHistory = arrayOf(source['maintenanceHistory']).map(normalizeMaintenance);
  return {
    tower: normalizeTower(source['tower']),
    anomalies,
    maintenanceHistory,
    stats: normalizeStats(source['stats']),
    anomaliesPagination: normalizePagination(source['anomaliesPagination'], filters.page, filters.pageSize, anomalies.length),
    maintenancePagination: normalizePagination(source['maintenancePagination'], filters.page, filters.pageSize, maintenanceHistory.length),
  };
};
