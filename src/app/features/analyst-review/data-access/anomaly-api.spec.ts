import '@angular/compiler';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AnomalyApi, anomalyErrorMessage, apiErrorCode, AnomalyPage, groupSuperseded, normalizeAnomalyItem } from './anomaly-api';

describe('AnomalyApi', () => {
  let api: AnomalyApi;
  let http: HttpTestingController;
  const base = environment.apiBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AnomalyApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists pending anomalies with search and maps the ERD v2.2 fields', () => {
    let page: AnomalyPage | undefined;
    api.listPending({ pageIndex: 2, pageSize: 12, search: 'NPC' }).subscribe((p) => (page = p));
    const req = http.expectOne((r) => r.url === `${base}/anomalies/pending`);
    expect(req.request.params.get('search')).toBe('NPC');
    expect(req.request.params.get('pageIndex')).toBe('2');
    req.flush({
      success: true,
      data: {
        items: [
          { id: 'c1', mediaUrl: 'https://cdn/a.jpg', towerId: null, towerCode: null, categoryName: 'Vỡ sứ', confidenceScore: 0.92, validationStatus: 'Pending', aiSource: 'RF-DETR', analysisRunId: 'r1', supersededById: null, createdAt: '2026-10-30T08:00:00Z', severity: 4, isEmergency: true },
          { id: 'e1', mediaUrl: 'https://cdn/a.jpg', towerId: 't1', towerCode: 'NPC_01', categoryName: 'Vỡ sứ', confidenceScore: 88, validationStatus: 'Pending', aiSource: 'Edge', analysisRunId: 'r0', supersededById: 'c1', createdAt: '2026-10-30T07:59:00Z' },
        ],
        totalCount: 2,
        pageIndex: 2,
        pageSize: 12,
        totalPages: 1,
      },
    });

    expect(page?.items[0]).toMatchObject({ towerId: null, confidenceScore: 92, aiSource: 'RF-DETR', executionLocation: null, supersededById: null });
    expect(page?.items[1]).toMatchObject({ towerCode: 'NPC_01', executionLocation: 'Edge', supersededById: 'c1' });

    const grouping = groupSuperseded(page?.items ?? []);
    expect(grouping.visible.map((i) => i.id)).toEqual(['c1']);
    expect(grouping.hiddenCount).toBe(1);
    expect(grouping.supersededByReplacement.get('c1')?.map((i) => i.id)).toEqual(['e1']);
  });

  it('treats an anomaly without an analysis run as manual and hides GUID tower codes', () => {
    const item = normalizeAnomalyItem({ id: 'm1', aiSource: 'Manual', analysisRunId: null, towerId: 'g-1', towerCode: 'g-1' });
    expect(item.executionLocation).toBe('Manual');
    expect(item.towerCode).toBeNull();
  });

  it('assigns a tower and reads the nearest-tower suggestions', () => {
    let code = '';
    api.assignTower('a1', 't9').subscribe((r) => (code = r.towerCode));
    const put = http.expectOne(`${base}/anomalies/a1/tower`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ towerId: 't9' });
    put.flush({ success: true, data: { anomalyId: 'a1', towerId: 't9', towerCode: 'NPC_HN_01_014', validationStatus: 'Pending' } });
    expect(code).toBe('NPC_HN_01_014');

    let distance = 0;
    api.getTowerSuggestions('a1').subscribe((s) => (distance = s.towers[0].distanceMeters));
    const get = http.expectOne((r) => r.url === `${base}/anomalies/a1/tower-suggestions`);
    expect(get.request.params.get('radiusMeters')).toBe('300');
    get.flush({ success: true, data: { anomalyId: 'a1', currentTowerId: null, source: 'Anomaly', latitude: 21, longitude: 105, radiusMeters: 300, towers: [{ towerId: 't9', towerCode: 'NPC_HN_01_014', regionId: 'r', address: null, latitude: 21, longitude: 105, distanceMeters: 55.6, isCurrent: false }] } });
    expect(distance).toBe(55.6);
  });

  it('does not swallow validation errors and explains TOWER_REQUIRED in Vietnamese', () => {
    let error: unknown;
    api.validate('a1', { status: 'Confirmed' }).subscribe({ error: (err) => (error = err) });
    http.expectOne(`${base}/anomalies/a1/validate`).flush(
      { success: false, message: 'The anomaly must be linked to a tower before it can be confirmed.', errorCode: 'TOWER_REQUIRED' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(apiErrorCode(error)).toBe('TOWER_REQUIRED');
    expect(anomalyErrorMessage(error)).toContain('gán cột điện');
  });
});
