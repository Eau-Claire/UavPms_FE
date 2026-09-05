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
});
