import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
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

@Injectable({
  providedIn: 'root',
})
export class DroneManagementApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getDrones(status?: string, regionId?: string): Observable<readonly UavRecord[]> {
    let params = new HttpParams().set('detailed', 'true');
    if (status) {
      params = params.set('status', status).set('operationalStatus', status);
    }
    if (regionId) {
      params = params.set('regionId', regionId);
    }

    return this.http.get<unknown>(`${this.baseUrl}/drones`, { params }).pipe(
      map((res) => {
        const data = unwrapApiData(res);
        return Array.isArray(data) ? (data as UavRecord[]) : [];
      }),
      catchError(() => of([])),
    );
  }

  getDrone(droneId: string): Observable<UavRecord | null> {
    return this.http.get<unknown>(`${this.baseUrl}/drones/${droneId}`).pipe(
      map((res) => unwrapApiData(res) as UavRecord),
      catchError(() => of(null)),
    );
  }

  createDrone(payload: CreateUavRequest): Observable<UavRecord> {
    return this.http
      .post<unknown>(`${this.baseUrl}/drones`, payload)
      .pipe(map((res) => unwrapApiData(res) as UavRecord));
  }

  updateDrone(droneId: string, payload: UpdateUavRequest): Observable<UavRecord> {
    return this.http
      .put<unknown>(`${this.baseUrl}/drones/${droneId}`, payload)
      .pipe(map((res) => unwrapApiData(res) as UavRecord));
  }

  deleteDrone(droneId: string): Observable<void> {
    return this.http
      .delete<unknown>(`${this.baseUrl}/drones/${droneId}`)
      .pipe(map(() => void 0));
  }

  getTechnicalInspections(droneId: string): Observable<readonly DroneTechnicalInspectionSummaryDto[]> {
    return this.http
      .get<unknown>(`${this.baseUrl}/drones/${droneId}/technical-inspections`)
      .pipe(
        map((res) => {
          const data = unwrapApiData(res);
          return Array.isArray(data) ? (data as DroneTechnicalInspectionSummaryDto[]) : [];
        }),
        catchError(() => of([])),
      );
  }

  submitBasicTechnicalCheck(
    droneId: string,
    payload: BasicTechnicalCheckRequest,
  ): Observable<any> {
    return this.http
      .post<unknown>(`${this.baseUrl}/drones/${droneId}/basic-technical-check`, payload)
      .pipe(map((res) => unwrapApiData(res)));
  }

  getEligibleDrones(assessmentId?: string): Observable<readonly UavRecord[]> {
    let params = new HttpParams();
    if (assessmentId) params = params.set('assessmentId', assessmentId);

    return this.http.get<unknown>(`${this.baseUrl}/drones/eligible`, { params }).pipe(
      map((res) => {
        const data = unwrapApiData(res);
        return Array.isArray(data) ? (data as UavRecord[]) : [];
      }),
      catchError(() => of([])),
    );
  }

  estimateGisScope(payload: GisDroneEstimationRequest): Observable<GisDroneEstimationResult> {
    return this.http
      .post<unknown>(`${this.baseUrl}/drones/estimate-gis-scope`, payload)
      .pipe(map((res) => unwrapApiData(res) as GisDroneEstimationResult));
  }
}
