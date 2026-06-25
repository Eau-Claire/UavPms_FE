import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
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

  it('loads and normalizes all dashboard widgets', () => {
    let result: unknown;
    api.getDashboard(2, 5).subscribe((value) => result = value);

    http.expectOne(`${environment.apiBaseUrl}/monitor/summary`).flush({ data: { totalMissions: 12, pendingMissions: 3, inProgressMissions: 4, completedMissions: 5, totalInspections: 30, totalDefects: 6, criticalDefects: 1 } });
    http.expectOne((request) => request.url.endsWith('/monitor/recent-defects') && request.params.get('page') === '2').flush({ data: { items: [{ id: 'd1', missionName: 'Mission A', defectType: 'Corrosion', detectedAt: '2026-06-24T00:00:00Z' }], totalCount: 6, page: 2, pageSize: 5 } });
    http.expectOne(`${environment.apiBaseUrl}/monitor/defects-statistics`).flush({ data: [{ defectType: 'Corrosion', count: 6 }] });
    http.expectOne(`${environment.apiBaseUrl}/monitor/mission-status`).flush({ data: { pending: 3, inProgress: 4, completed: 5 } });
    http.expectOne(`${environment.apiBaseUrl}/monitor/alerts`).flush({ data: [{ id: 'a1', title: 'Critical finding', message: 'Review required', createdAt: '2026-06-24T01:00:00Z', isRead: false }] });

    const dashboard = result as { summary: { totalMissions: number }; recentDefects: { totalCount: number }; defectStatistics: readonly unknown[]; missionStatus: readonly unknown[]; alerts: readonly unknown[] };
    expect(dashboard.summary.totalMissions).toBe(12);
    expect(dashboard.recentDefects.totalCount).toBe(6);
    expect(dashboard.defectStatistics).toHaveLength(1);
    expect(dashboard.missionStatus).toHaveLength(3);
    expect(dashboard.alerts).toHaveLength(1);
  });

  it('sends server-side inspection filters and pagination', () => {
    api.getInspections({ missionId: '2c52a953-3606-4f8a-bd13-76cfab48d133', isDefect: true, fromDate: '2026-06-01', toDate: '2026-06-24', page: 3, pageSize: 10 }).subscribe();
    const request = http.expectOne((item) => item.url.endsWith('/monitor/inspections'));
    expect(request.request.params.get('missionId')).toBe('2c52a953-3606-4f8a-bd13-76cfab48d133');
    expect(request.request.params.get('isDefect')).toBe('true');
    expect(request.request.params.get('page')).toBe('3');
    request.flush({ data: { items: [], totalCount: 0 } });
  });
});
