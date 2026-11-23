import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import {
  BasicTechnicalCheckRequest,
  CreateUavRequest,
  DroneTechnicalInspectionSummaryDto,
  GisDroneEstimationRequest,
  GisDroneEstimationResult,
  UavRecord,
  UpdateUavRequest,
} from '../../../models/drone-management.models';

export interface DroneListFilters {
  readonly search?: string;
  readonly operationalStatus?: string;
  readonly technicalHealth?: string;
  readonly regionId?: string;
}

/**
 * Quản lý đội drone (`/drones`). Các endpoint này trả DTO trực tiếp (không bọc `ApiResponse`).
 */
@Injectable({
  providedIn: 'root',
})
export class DroneManagementApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/drones`;

  /** `GET /drones?detailed=true` trả danh sách `UavDetailsDto`. */
  getDrones(filters: DroneListFilters = {}): Observable<readonly UavRecord[]> {
    let params = new HttpParams().set('detailed', 'true');
    if (filters.search) params = params.set('search', filters.search);
    if (filters.operationalStatus) params = params.set('operationalStatus', filters.operationalStatus);
    if (filters.technicalHealth) params = params.set('technicalHealth', filters.technicalHealth);
    if (filters.regionId) params = params.set('regionId', filters.regionId);

    return this.http.get<unknown>(this.baseUrl, { params }).pipe(
      map((res) => {
        const data = unwrapApiData<unknown>(res);
        return Array.isArray(data) ? (data as UavRecord[]) : [];
      }),
    );
  }

  getDrone(droneId: string): Observable<UavRecord> {
    return this.http.get<unknown>(`${this.baseUrl}/${droneId}`).pipe(map((res) => unwrapApiData<UavRecord>(res)));
  }

  createDrone(payload: CreateUavRequest): Observable<UavRecord> {
    return this.http.post<unknown>(this.baseUrl, payload).pipe(map((res) => unwrapApiData<UavRecord>(res)));
  }

  updateDrone(droneId: string, payload: UpdateUavRequest): Observable<UavRecord> {
    return this.http.put<unknown>(`${this.baseUrl}/${droneId}`, payload).pipe(map((res) => unwrapApiData<UavRecord>(res)));
  }

  deleteDrone(droneId: string): Observable<void> {
    return this.http.delete<unknown>(`${this.baseUrl}/${droneId}`).pipe(map(() => void 0));
  }

  getTechnicalInspections(droneId: string, page = 1, pageSize = 10): Observable<readonly DroneTechnicalInspectionSummaryDto[]> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<unknown>(`${this.baseUrl}/${droneId}/technical-inspections`, { params }).pipe(
      map((res) => {
        const data = unwrapApiData<unknown>(res);
        return Array.isArray(data) ? (data as DroneTechnicalInspectionSummaryDto[]) : [];
      }),
    );
  }

  submitBasicTechnicalCheck(droneId: string, payload: BasicTechnicalCheckRequest): Observable<DroneTechnicalInspectionSummaryDto> {
    return this.http
      .post<unknown>(`${this.baseUrl}/${droneId}/basic-technical-check`, payload)
      .pipe(map((res) => unwrapApiData<DroneTechnicalInspectionSummaryDto>(res)));
  }

  estimateGisScope(payload: GisDroneEstimationRequest): Observable<GisDroneEstimationResult> {
    return this.http
      .post<unknown>(`${this.baseUrl}/estimate-gis-scope`, payload)
      .pipe(map((res) => unwrapApiData<GisDroneEstimationResult>(res)));
  }
}
