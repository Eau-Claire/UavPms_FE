import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { GisApi } from './gis-api';

describe('GisApi', () => {
  let api: GisApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(GisApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('spatialQuery', () => {
    const geometry = { type: 'Polygon' as const, coordinates: [[[105, 21], [106, 21], [106, 22], [105, 21]]] as const };

    it('posts the GeoJSON polygon to /towers/spatial-query and maps SpatialTowerDto', () => {
      let result: unknown;
      api.spatialQuery({ geometry }).subscribe((value) => result = value);
      const request = http.expectOne(`${environment.apiBaseUrl}/towers/spatial-query`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ geometry });
      request.flush({ success: true, data: { total: 1, towers: [{ towerId: 't1', id: 't1', towerCode: 'T-01', regionId: 'r1', latitude: 21.1, longitude: 105.1 }] } });
      expect(result).toEqual([{ towerId: 't1', code: 'T-01', name: 'T-01', latitude: 21.1, longitude: 105.1 }]);
    });

    it('forwards the optional region filter', () => {
      api.spatialQuery({ geometry, filters: { regionId: 'r1' } }).subscribe();
      const request = http.expectOne(`${environment.apiBaseUrl}/towers/spatial-query`);
      expect(request.request.body).toEqual({ geometry, filters: { regionId: 'r1' } });
      request.flush({ data: { total: 0, towers: [] } });
    });

    it.each([400, 503])('propagates %s errors', (status) => {
      let actual = 0;
      api.spatialQuery({ geometry }).subscribe({ error: (error) => actual = error.status });
      http.expectOne(`${environment.apiBaseUrl}/towers/spatial-query`).flush({ message: 'failure' }, { status, statusText: 'Failure' });
      expect(actual).toBe(status);
    });
  });

  describe('getAllGisData', () => {
    it.each([403, 500])('propagates GIS %s failures without fallback data', (status) => {
      let actual = 0;
      let emitted = false;
      api.getAllGisData().subscribe({ next: () => emitted = true, error: (error) => actual = error.status });
      http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({}, { status, statusText: 'Failure' });
      expect(actual).toBe(status);
      expect(emitted).toBe(false);
    });

    it('maps towers, anomalies and alerts from GisInfrastructureResponse', () => {
      let result: unknown;
      api.getAllGisData().subscribe((value) => result = value);
      http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({ success: true, data: {
        towers: [{ id: 't1', code: 'NPC_HP_01_001', regionId: 'r1', poleType: 'Cột thép', address: 'Hải Phòng', latitude: 20.865143, longitude: 106.683542 }],
        anomalies: [{ id: 'a1', anomalyId: 'a1', towerId: 't1', towerCode: 'NPC_HP_01_001', category: 'Nứt sứ', severity: 4, latitude: 20.86, longitude: 106.68, status: 'Pending', confidenceScore: 0.91, imageUrl: null, detectedAt: '2026-10-01T00:00:00Z' }],
        alerts: [{ id: 'al1', anomalyId: 'a1', towerId: 't1', towerCode: 'NPC_HP_01_001', latitude: 20.86, longitude: 106.68, status: 'Active', priority: 'Critical', title: 'Cháy', triggeredAt: '2026-10-01T00:00:00Z' }],
      } });
      expect(result).toEqual({
        towers: [{ id: 't1', towerCode: 'NPC_HP_01_001', regionId: 'r1', poleType: 'Cột thép', address: 'Hải Phòng', latitude: 20.865143, longitude: 106.683542 }],
        anomalies: [{ id: 'a1', anomalyId: 'a1', towerId: 't1', towerCode: 'NPC_HP_01_001', category: 'Nứt sứ', severity: 4, latitude: 20.86, longitude: 106.68, status: 'Pending', confidenceScore: 0.91, imageUrl: undefined, detectedAt: '2026-10-01T00:00:00Z' }],
        alerts: [{ id: 'al1', anomalyId: 'a1', towerId: 't1', towerCode: 'NPC_HP_01_001', latitude: 20.86, longitude: 106.68, status: 'Active', priority: 'Critical', title: 'Cháy', triggeredAt: '2026-10-01T00:00:00Z' }],
      });
    });

    it('passes the region filter as administrativeAreaId', () => {
      api.getAllGisData({ administrativeAreaId: 'r1' }).subscribe();
      const request = http.expectOne((req) => req.url === `${environment.apiBaseUrl}/gis/infrastructure`);
      expect(request.request.params.get('administrativeAreaId')).toBe('r1');
      request.flush({ data: { towers: [] } });
    });

    it('drops towers without drawable coordinates', () => {
      let result: { towers: readonly { id: string }[] } | undefined;
      api.getAllGisData().subscribe((value) => result = value);
      http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({ data: {
        towers: [
          { id: 't0', code: 'NO-GEOM', regionId: 'r1', latitude: 0, longitude: 0 },
          { id: 't1', code: 'T-01', regionId: 'r1', latitude: 21.1, longitude: 105.8 },
          { id: 't2', code: 'BAD', regionId: 'r1', latitude: 'x', longitude: 105.8 },
        ],
        anomalies: [], alerts: [],
      } });
      expect(result?.towers.map((tower) => tower.id)).toEqual(['t1']);
    });

    it('distinguishes an empty response from a malformed response', () => {
      let empty: unknown;
      api.getAllGisData().subscribe((value) => empty = value);
      http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({ data: { towers: [], anomalies: [], alerts: [] } });
      expect(empty).toEqual({ towers: [], anomalies: [], alerts: [] });
      let failed = false;
      api.getAllGisData().subscribe({ error: () => failed = true });
      http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({ data: {} });
      expect(failed).toBe(true);
    });
  });

  it('loads every page of /regions', () => {
    let result: unknown;
    api.getRegions().subscribe((value) => result = value);
    const first = http.expectOne((req) => req.url === `${environment.apiBaseUrl}/regions` && req.params.get('page') === '1');
    expect(first.request.params.get('pageSize')).toBe('100');
    first.flush({ data: { items: [{ id: 'r1', regionName: 'Hải Phòng' }], pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 2 } } });
    http.expectOne((req) => req.url === `${environment.apiBaseUrl}/regions` && req.params.get('page') === '2')
      .flush({ data: { items: [{ id: 'r2', regionName: 'Hà Nội' }], pagination: { page: 2, pageSize: 100, totalItems: 2, totalPages: 2 } } });
    expect(result).toEqual([{ id: 'r1', name: 'Hải Phòng' }, { id: 'r2', name: 'Hà Nội' }]);
  });
});
