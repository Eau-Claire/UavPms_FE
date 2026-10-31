import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { apiErrorMessage, TowersApi } from './towers-api';

describe('TowersApi', () => {
  const url = `${environment.apiBaseUrl}/towers`;
  let api: TowersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(TowersApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists towers with page, region and search parameters', () => {
    let result: unknown;
    api.list({ page: 2, pageSize: 20, regionId: 'r1', search: '  T-0 ' }).subscribe((value) => (result = value));
    const request = http.expectOne((req) => req.url === url);
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('20');
    expect(request.request.params.get('regionId')).toBe('r1');
    expect(request.request.params.get('search')).toBe('T-0');
    request.flush({ success: true, data: {
      items: [{ id: 't1', regionId: 'r1', regionName: 'Hải Phòng', towerCode: 'T-01', poleType: null, address: 'Số 1', latitude: 20.8, longitude: 106.6 }],
      pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
    } });
    expect(result).toEqual({
      items: [{ id: 't1', regionId: 'r1', regionName: 'Hải Phòng', towerCode: 'T-01', poleType: undefined, address: 'Số 1', latitude: 20.8, longitude: 106.6 }],
      pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
    });
  });

  it('omits empty filters', () => {
    api.list({ page: 1, pageSize: 10 }).subscribe();
    const request = http.expectOne((req) => req.url === url);
    expect(request.request.params.has('regionId')).toBe(false);
    expect(request.request.params.has('search')).toBe(false);
    request.flush({ data: { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } } });
  });

  it('creates and updates with the TowerController body', () => {
    const body = { regionId: 'r1', towerCode: ' T-01 ', poleType: '', address: 'Hà Nội', latitude: 21, longitude: 105.8 };
    api.create(body).subscribe();
    const create = http.expectOne(url);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ regionId: 'r1', towerCode: 'T-01', poleType: undefined, address: 'Hà Nội', latitude: 21, longitude: 105.8 });
    create.flush({ data: { id: 't1', regionId: 'r1', towerCode: 'T-01', latitude: 21, longitude: 105.8 } });

    api.update('t1', body).subscribe();
    const update = http.expectOne(`${url}/t1`);
    expect(update.request.method).toBe('PUT');
    update.flush({ data: { id: 't1', regionId: 'r1', towerCode: 'T-01', latitude: 21, longitude: 105.8 } });
  });

  it('deletes a tower', () => {
    let done = false;
    api.delete('t1').subscribe(() => (done = true));
    const request = http.expectOne(`${url}/t1`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ success: true, message: 'ok' });
    expect(done).toBe(true);
  });

  it('uploads the Excel file as multipart field "file"', () => {
    let result: unknown;
    const file = new File(['x'], 'towers.xlsx');
    api.import(file).subscribe((value) => (result = value));
    const request = http.expectOne(`${url}/import`);
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBeInstanceOf(File);
    request.flush({ data: { success: true, importedCount: 5, skippedCount: 2 } });
    expect(result).toEqual({ importedCount: 5, skippedCount: 2 });
  });

  it('loads tower history with validationStatus and a UTC date range', () => {
    let result: { stats: { openAnomalies: number }; anomaliesPagination: { totalPages: number } } | undefined;
    api.history('t1', { page: 1, pageSize: 20, validationStatus: 'Pending', from: '2026-10-01', to: '2026-10-31' }).subscribe((value) => (result = value));
    const request = http.expectOne((req) => req.url === `${url}/t1/history`);
    expect(request.request.params.get('validationStatus')).toBe('Pending');
    expect(request.request.params.get('from')).toMatch(/Z$/);
    expect(request.request.params.get('to')).toMatch(/Z$/);
    expect(new Date(request.request.params.get('from')!).getTime()).toBeLessThan(new Date(request.request.params.get('to')!).getTime());
    request.flush({ data: {
      tower: { id: 't1', regionId: 'r1', towerCode: 'T-01', latitude: 21, longitude: 105 },
      anomalies: [{ id: 'a1', mediaId: 'm1', missionId: 'ms1', categoryName: 'Nứt sứ', confidenceScore: 0.9, validationStatus: 'Pending', aiSource: 'yolo', detectedAt: '2026-10-02T00:00:00Z' }],
      maintenanceHistory: [],
      stats: { totalAnomalies: 3, pendingAnomalies: 1, confirmedAnomalies: 1, openAnomalies: 2, totalTickets: 0, openTickets: 0, inProgressTickets: 0, activeTickets: 0, lastInspectedAt: null },
      anomaliesPagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      maintenancePagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    } });
    expect(result?.stats.openAnomalies).toBe(2);
    expect(result?.anomaliesPagination.totalPages).toBe(1);
  });

  it('extracts the backend ApiResponse message from errors', () => {
    expect(apiErrorMessage({ status: 400, error: { success: false, message: 'Mã cột đã tồn tại' } }, 'fallback')).toBe('Mã cột đã tồn tại');
    expect(apiErrorMessage({ status: 500, error: null }, 'fallback')).toBe('fallback');
  });
});
