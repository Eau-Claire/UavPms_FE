import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { GisApi } from './gis-api';

describe('GisApi spatial query', () => {
  let api: GisApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(GisApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('posts a GeoJSON Polygon and normalizes returned assets', () => {
    const geometry = { type: 'Polygon' as const, coordinates: [[[105, 21], [106, 21], [106, 22], [105, 21]]] as const };
    let result: unknown;
    api.spatialQuery({ geometry }).subscribe((value) => result = value);
    const request = http.expectOne(`${environment.apiBaseUrl}/assets/spatial-query`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ geometry });
    request.flush({ data: { assets: [{ id: 'a1', assetCode: 'T-01', assetName: 'Tower 1', lat: 21.1, lng: 105.1, status: 'Operational' }] } });
    expect(result).toEqual([{ assetId: 'a1', code: 'T-01', name: 'Tower 1', latitude: 21.1, longitude: 105.1, status: 'Operational' }]);
  });

  it('propagates 400 client validation errors', () => {
    let status = 0;
    api.spatialQuery({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } }).subscribe({ error: (error) => status = error.status });
    http.expectOne(`${environment.apiBaseUrl}/assets/spatial-query`).flush({ message: 'invalid' }, { status: 400, statusText: 'Bad Request' });
    expect(status).toBe(400);
  });

  it('does not misrepresent towers as assets when the spatial query fails', () => {
    let status = 0;
    api.spatialQuery({ geometry: { type: 'Polygon', coordinates: [[[105.7, 20.9], [105.9, 20.9], [105.9, 21.1], [105.7, 20.9]]] } })
      .subscribe({ error: (error) => status = error.status });

    http.expectOne(`${environment.apiBaseUrl}/assets/spatial-query`)
      .flush({ message: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' });

    expect(status).toBe(503);
  });

  it.each([403, 500])('propagates GIS %s failures without mock fallback', (status) => {
    let actual = 0;
    let emitted = false;
    api.getAllGisData().subscribe({ next: () => emitted = true, error: (error) => actual = error.status });
    http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({}, { status, statusText: 'Failure' });
    expect(actual).toBe(status);
    expect(emitted).toBe(false);
  });

  it('preserves authorized asset IDs and coordinates and parses line geometry', () => {
    let result: unknown;
    api.getAllGisData().subscribe(value => result = value);
    http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({ data: {
      assets: [{ id: 'asset-1', code: 'NPC_HP_01_001', powerLineId: 'line-1', latitude: 20.865143, longitude: 106.683542, assetType: 'Pole' }],
      powerLines: [{ id: 'line-1', code: 'EVNNPC:line', name: 'Demo line', voltageLevel: '22kV', geometry: 'LINESTRING(106.683542 20.865143,106.684125 20.865421)' }],
      anomalies: [], alerts: [],
    } });
    expect(result).toMatchObject({ towers: [{ id: 'asset-1', latitude: 20.865143, longitude: 106.683542 }], lines: [{ coordinates: [[20.865143, 106.683542], [20.865421, 106.684125]] }], anomalies: [], alerts: [] });
  });

  it('distinguishes an empty response from a malformed response', () => {
    let empty: unknown;
    api.getAllGisData().subscribe(value => empty = value);
    http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({ data: { assets: [], powerLines: [] } });
    expect(empty).toEqual({ towers: [], lines: [], anomalies: [], alerts: [] });
    let failed = false;
    api.getAllGisData().subscribe({ error: () => failed = true });
    http.expectOne(`${environment.apiBaseUrl}/gis/infrastructure`).flush({ data: {} });
    expect(failed).toBe(true);
  });
});
