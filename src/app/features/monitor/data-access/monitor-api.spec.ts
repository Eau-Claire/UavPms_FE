import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { DashboardSnapshot } from '../../../models/monitor.models';
import { MonitorApi } from './monitor-api';

describe('MonitorApi', () => {
  let api: MonitorApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(MonitorApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and normalizes all dashboard widgets from the backend DTOs', () => {
    let result: DashboardSnapshot | undefined;
    api.getDashboard(2, 5).subscribe((value) => (result = value));

    http.expectOne(`${environment.apiBaseUrl}/monitor/summary`).flush({ success: true, data: { totalMissions: 12, pendingMissions: 3, inProgressMissions: 4, completedMissions: 5, totalInspections: 30, totalDefects: 6, criticalDefects: 1 } });
    http.expectOne((request) => request.url.endsWith('/monitor/recent-defects') && request.params.get('page') === '2').flush({
      success: true,
      data: {
        items: [{ inspectionId: 'd1', missionId: 'm1', missionTitle: 'Mission A', imageUrl: 'https://cdn/x.jpg', defectType: 'Corrosion', detectedAt: '2026-06-24T00:00:00Z' }],
        pagination: { page: 2, pageSize: 5, totalItems: 6, totalPages: 2 },
      },
    });
    http.expectOne(`${environment.apiBaseUrl}/monitor/defects-statistics`).flush({ success: true, data: { totalDefects: 6, byType: [{ type: 'Corrosion', count: 6 }] } });
    http.expectOne(`${environment.apiBaseUrl}/monitor/mission-status`).flush({ success: true, data: { pending: 3, inProgress: 4, completed: 5 } });
    http.expectOne(`${environment.apiBaseUrl}/monitor/alerts`).flush({ success: true, data: { items: [{ notificationId: 'a1', title: 'Critical finding', message: 'Review required', createdAt: '2026-06-24T01:00:00Z', isRead: false }] } });

    expect(result?.summary.totalMissions).toBe(12);
    expect(result?.recentDefects.totalCount).toBe(6);
    expect(result?.recentDefects.totalPages).toBe(2);
    expect(result?.recentDefects.items[0]).toMatchObject({ id: 'd1', missionId: 'm1', missionName: 'Mission A', defectType: 'Corrosion' });
    expect(result?.defectStatistics).toEqual([{ defectType: 'Corrosion', count: 6 }]);
    expect(result?.missionStatus.map((s) => s.count)).toEqual([3, 4, 5]);
    expect(result?.alerts[0]).toMatchObject({ id: 'a1', title: 'Critical finding', isRead: false });
  });

  it('sends server-side inspection filters and reads nested pagination', () => {
    let total = 0;
    api.getInspections({ missionId: '2c52a953-3606-4f8a-bd13-76cfab48d133', isDefect: true, fromDate: '2026-06-01', toDate: '2026-06-24', page: 3, pageSize: 10 }).subscribe((page) => (total = page.totalCount));
    const request = http.expectOne((item) => item.url.endsWith('/monitor/inspections'));
    expect(request.request.params.get('missionId')).toBe('2c52a953-3606-4f8a-bd13-76cfab48d133');
    expect(request.request.params.get('isDefect')).toBe('true');
    expect(request.request.params.get('page')).toBe('3');
    request.flush({ success: true, data: { items: [], pagination: { page: 3, pageSize: 10, totalItems: 25, totalPages: 3 } } });
    expect(total).toBe(25);
  });
});
