import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { asRecord, readArray, readFirstString, readNumber, readOptionalString, readString } from '../../../shared/utils';
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
        const items = readArray(data?.['items']).map(normalizeTower);
        return { items, pagination: normalizePagination(data?.['pagination'], filters.page, filters.pageSize, items.length) };
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
        return { importedCount: readNumber(data, 'importedCount'), skippedCount: readNumber(data, 'skippedCount') };
      }),
    );
  }
}

/** Extracts the backend's ApiResponse message from an HttpErrorResponse, if any. */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const body = asRecord(asRecord(error)?.['error']);
  return readFirstString(body, ['message', 'title'], fallback);
};

export const apiErrorStatus = (error: unknown): number => readNumber(asRecord(error), 'status');

const optionalText = (source: Record<string, unknown> | null, key: string): string | undefined =>
  readOptionalString(source, key) ?? undefined;

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
    id: readString(source, 'id'),
    regionId: readString(source, 'regionId'),
    regionName: optionalText(source, 'regionName'),
    towerCode: readString(source, 'towerCode'),
    poleType: optionalText(source, 'poleType'),
    address: optionalText(source, 'address'),
    latitude: readNumber(source, 'latitude'),
    longitude: readNumber(source, 'longitude'),
  };
};

const normalizePagination = (value: unknown, page: number, pageSize: number, count: number): PaginationMeta => {
  const source = asRecord(value);
  const totalItems = readNumber(source, 'totalItems') || count;
  return {
    page: readNumber(source, 'page') || page,
    pageSize: readNumber(source, 'pageSize') || pageSize,
    totalItems,
    totalPages: readNumber(source, 'totalPages') || Math.max(1, Math.ceil(totalItems / pageSize)),
  };
};

const normalizeAnomaly = (value: unknown): TowerAnomaly => {
  const source = asRecord(value);
  return {
    id: readString(source, 'id'),
    mediaId: readString(source, 'mediaId'),
    missionId: readString(source, 'missionId'),
    categoryCode: optionalText(source, 'categoryCode'),
    categoryName: optionalText(source, 'categoryName'),
    confidenceScore: readNumber(source, 'confidenceScore'),
    validationStatus: readString(source, 'validationStatus'),
    aiSource: readString(source, 'aiSource'),
    imageUrl: optionalText(source, 'imageUrl'),
    cropUrl: optionalText(source, 'cropUrl'),
    detectedAt: readString(source, 'detectedAt'),
    validatedAt: optionalText(source, 'validatedAt'),
  };
};

const normalizeMaintenance = (value: unknown): TowerMaintenanceRecord => {
  const source = asRecord(value);
  return {
    id: readString(source, 'id'),
    ticketCode: readString(source, 'ticketCode'),
    anomalyId: readString(source, 'anomalyId'),
    status: readString(source, 'status'),
    priority: readString(source, 'priority'),
    description: readString(source, 'description'),
    managerId: readString(source, 'managerId'),
    technicianId: optionalText(source, 'technicianId'),
    createdAt: readString(source, 'createdAt'),
    dueDate: optionalText(source, 'dueDate'),
    startedAt: optionalText(source, 'startedAt'),
    resolvedAt: optionalText(source, 'resolvedAt'),
    proofs: readArray(source?.['proofs']).map((item) => {
      const proof = asRecord(item);
      return {
        id: readString(proof, 'id'),
        proofType: readString(proof, 'proofType'),
        fileUrl: readString(proof, 'fileUrl'),
        technicianNotes: readString(proof, 'technicianNotes'),
        uploadedAt: readString(proof, 'uploadedAt'),
      };
    }),
    materials: readArray(source?.['materials']).map((item) => {
      const material = asRecord(item);
      return {
        id: readString(material, 'id'),
        componentCode: readString(material, 'componentCode'),
        componentName: readString(material, 'componentName'),
        quantityUsed: readNumber(material, 'quantityUsed'),
        unit: readString(material, 'unit'),
        loggedAt: readString(material, 'loggedAt'),
      };
    }),
  };
};

const normalizeStats = (value: unknown): TowerHistoryStats => {
  const source = asRecord(value);
  return {
    totalAnomalies: readNumber(source, 'totalAnomalies'),
    pendingAnomalies: readNumber(source, 'pendingAnomalies'),
    confirmedAnomalies: readNumber(source, 'confirmedAnomalies'),
    openAnomalies: readNumber(source, 'openAnomalies'),
    totalTickets: readNumber(source, 'totalTickets'),
    openTickets: readNumber(source, 'openTickets'),
    inProgressTickets: readNumber(source, 'inProgressTickets'),
    activeTickets: readNumber(source, 'activeTickets'),
    lastInspectedAt: optionalText(source, 'lastInspectedAt'),
  };
};

const normalizeHistory = (value: unknown, filters: TowerHistoryFilters): TowerHistory => {
  const source = asRecord(value);
  const anomalies = readArray(source?.['anomalies']).map(normalizeAnomaly);
  const maintenanceHistory = readArray(source?.['maintenanceHistory']).map(normalizeMaintenance);
  return {
    tower: normalizeTower(source?.['tower']),
    anomalies,
    maintenanceHistory,
    stats: normalizeStats(source?.['stats']),
    anomaliesPagination: normalizePagination(source?.['anomaliesPagination'], filters.page, filters.pageSize, anomalies.length),
    maintenancePagination: normalizePagination(source?.['maintenancePagination'], filters.page, filters.pageSize, maintenanceHistory.length),
  };
};
