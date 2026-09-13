import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { AssessmentCreateRequest, AssessmentPage, PreMissionAssessment } from '../../../models/pre-mission.models';

@Injectable({ providedIn: 'root' })
export class PreMissionApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/v2/pre-mission-assessments`;
  list(page = 1, pageSize = 10, status = '') { let params = new HttpParams().set('page', page).set('pageSize', pageSize); if (status) params = params.set('status', status); return this.http.get<unknown>(this.url, { params }).pipe(map((response) => normalizePage(unwrapApiData(response), page, pageSize))); }
  get(id: string) { return this.http.get<unknown>(`${this.url}/${id}`).pipe(map((response) => normalizeAssessment(unwrapApiData(response)))); }
  create(request: AssessmentCreateRequest) { return this.http.post<unknown>(this.url, request).pipe(map((response) => normalizeAssessment(unwrapApiData(response)))); }
  evaluate(id: string) { return this.http.post<unknown>(`${this.url}/${id}/evaluate`, {}).pipe(map((response) => normalizeAssessment(unwrapApiData(response)))); }
  reEvaluate(id: string) { return this.http.post<unknown>(`${this.url}/${id}/re-evaluate`, {}).pipe(map((response) => normalizeAssessment(unwrapApiData(response)))); }
}
const objectOf = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const arrayOf = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
const stringOf = (value: unknown, fallback = '') => value == null ? fallback : String(value);
const checkOf = (value: unknown) => { const x = objectOf(value); return { status: stringOf(x['status'], 'UNKNOWN'), reason: x['reason'] == null ? null : stringOf(x['reason']), evaluatedAt: x['evaluatedAt'] == null ? null : stringOf(x['evaluatedAt']) }; };
const normalizeAssessment = (value: unknown): PreMissionAssessment => { const x = objectOf(value); return { id: stringOf(x['id']), assessmentCode: stringOf(x['assessmentCode'] ?? x['code'], 'ASSESSMENT'), regionName: stringOf(x['regionName']), lineName: x['lineName'] == null ? null : stringOf(x['lineName']), assetCount: Number(x['assetCount'] ?? arrayOf(x['scopeAssetIds']).length), plannedStart: stringOf(x['plannedStart']), plannedEnd: stringOf(x['plannedEnd']), site: checkOf(x['site']), personnel: checkOf(x['personnel']), uav: checkOf(x['uav']), technical: checkOf(x['technical']), status: stringOf(x['status'], 'UNKNOWN'), validUntil: x['validUntil'] == null ? null : stringOf(x['validUntil']), createdBy: x['createdBy'] == null ? null : stringOf(x['createdBy']), updatedAt: x['updatedAt'] == null ? null : stringOf(x['updatedAt']), consumedMissionId: x['consumedMissionId'] == null ? null : stringOf(x['consumedMissionId']), personnelCandidates: [], uavCandidates: [], technicalMetrics: [], scopeAssetIds: arrayOf(x['scopeAssetIds']).map(String), scopeGeometry: x['scopeGeometry'] }; };
const normalizePage = (value: unknown, page: number, pageSize: number): AssessmentPage => { const x = objectOf(value); const items = arrayOf(x['items'] ?? x['records']).map(normalizeAssessment); const totalCount = Number(x['totalCount'] ?? items.length); return { items, page: Number(x['page'] ?? page), pageSize: Number(x['pageSize'] ?? pageSize), totalCount, totalPages: Number(x['totalPages'] ?? Math.max(1, Math.ceil(totalCount / pageSize))) }; };
