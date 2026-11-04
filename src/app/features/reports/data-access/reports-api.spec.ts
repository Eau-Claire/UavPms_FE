import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ReportFile, ReportListResult } from '../../../models/reports.models';
import { fileNameFromDisposition, ReportsApi } from './reports-api';

describe('ReportsApi', () => {
  let api: ReportsApi;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/reports`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ReportsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('filters by regionId and maps region, creator and snapshot state', () => {
    let result: ReportListResult | undefined;
    api.listReports({ regionId: 'r1', status: 'approved', page: 1, pageSize: 10 }).subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('regionId')).toBe('r1');
    expect(req.request.params.get('status')).toBe('approved');
    req.flush({
      success: true,
      data: {
        items: [{ id: 'rp1', code: 'BC-1', title: 'T', type: 'defect', status: 'approved', createdAt: '2026-10-30T00:00:00Z', region: { id: 'r1', name: 'Hải Phòng' }, creator: { id: 'u1', fullName: 'A' }, defectCount: 4, hasSnapshot: true }],
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      },
    });

    expect(result?.items[0]).toMatchObject({ region: { id: 'r1', name: 'Hải Phòng' }, creator: { fullName: 'A' }, defectCount: 4, hasSnapshot: true, statusName: 'Đã duyệt' });
    expect(result?.pagination.totalItems).toBe(1);
  });

  it('creates a report scoped by region and dates', () => {
    api.createReport({ title: ' Báo cáo ', type: 'periodic', regionId: 'r1', dateFrom: '2026-10-01T00:00:00.000Z' }).subscribe();
    const req = http.expectOne(base);
    expect(req.request.body).toEqual({ title: 'Báo cáo', type: 'periodic', regionId: 'r1', dateFrom: '2026-10-01T00:00:00.000Z' });
    req.flush({ success: true, data: { id: 'rp2', code: 'BC-2', title: 'Báo cáo', type: 'periodic', status: 'draft', missions: [] } }, { status: 201, statusText: 'Created' });
  });

  it('downloads directly with format and reads the file name', () => {
    let file: ReportFile | undefined;
    api.downloadReportFile('rp1', 'excel').subscribe((f) => (file = f));
    const req = http.expectOne((r) => r.url === `${base}/rp1/download`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('format')).toBe('excel');
    req.flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="BC-1.xlsx"' } });
    expect(file?.fileName).toBe('BC-1.xlsx');
  });

  it('parses RFC 5987 file names', () => {
    expect(fileNameFromDisposition("attachment; filename=a.pdf; filename*=UTF-8''B%C3%A1o%20c%C3%A1o.pdf")).toBe('Báo cáo.pdf');
    expect(fileNameFromDisposition(null)).toBeNull();
  });

  it('loads regions from the paged regions endpoint', () => {
    let names: string[] = [];
    api.getRegions().subscribe((regions) => (names = regions.map((r) => r.name)));
    http.expectOne((r) => r.url === `${environment.apiBaseUrl}/regions`).flush({ success: true, data: { items: [{ id: 'r1', regionName: 'Hải Phòng', geomWkt: null }], pagination: {} } });
    expect(names).toEqual(['Hải Phòng']);
  });
});
