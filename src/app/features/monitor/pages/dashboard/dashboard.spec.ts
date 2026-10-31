import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../core/auth/auth';
import { AnomalyApi } from '../../../analyst-review/data-access/anomaly-api';
import { DroneManagementApi } from '../../../drones/data-access/drone-management-api';
import { EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';
import { MaintenanceApi } from '../../../maintenance/data-access/maintenance-api';
import { MissionsApi } from '../../../missions/data-access/missions-api';
import { MonitorApi } from '../../data-access/monitor-api';
import { MonitorStore } from '../../data-access/monitor-store';
import { Dashboard } from './dashboard';

async function setup(role: string) {
  const store = {
    startDashboardPolling: vi.fn(),
    loadDashboard: vi.fn(),
    loading: signal(true),
    dashboard: signal(null),
    error: signal<string | null>(null),
    summary: signal(undefined),
  };
  TestBed.configureTestingModule({
    imports: [Dashboard],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Auth, useValue: { user: signal({ id: 'u1', email: 'u@evn.vn', fullName: 'Người dùng', role, mustChangePassword: false }) } },
      { provide: MonitorApi, useValue: { getAlerts: () => of([]), getRecentDefects: () => of({ items: [], page: 1, pageSize: 5, totalCount: 0, totalPages: 1 }) } },
      { provide: MissionsApi, useValue: { my: () => of([]) } },
      { provide: AnomalyApi, useValue: { listPending: () => of({ items: [], totalCount: 0, pageIndex: 1, pageSize: 5, totalPages: 1 }) } },
      { provide: EmergencyAlertsApi, useValue: { fetchActiveAlerts: () => of([]) } },
      { provide: MaintenanceApi, useValue: { mine: () => of([]) } },
      { provide: DroneManagementApi, useValue: { getDrones: () => of([]) } },
    ],
  });
  TestBed.overrideComponent(Dashboard, { set: { providers: [{ provide: MonitorStore, useValue: store }] } });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, store };
}

describe('Dashboard role routing', () => {
  it('keeps the system dashboard (and its polling) for managers', async () => {
    const { el, store } = await setup('Manager');
    expect(store.startDashboardPolling).toHaveBeenCalledTimes(1);
    expect(el.querySelector('h1')?.textContent).toContain('Tổng quan hệ thống');
    expect(el.querySelector('app-inspector-home')).toBeNull();
  });

  it.each([
    ['Inspector', 'app-inspector-home'],
    ['Pilot', 'app-inspector-home'],
    ['Analyst', 'app-analyst-home'],
    ['Technician', 'app-technician-home'],
    ['MaintenanceTechnician', 'app-technician-home'],
  ])('shows the personal home for %s without polling system-wide stats', async (role, selector) => {
    const { el, store } = await setup(role);
    expect(el.querySelector(selector)).not.toBeNull();
    expect(store.startDashboardPolling).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain('Tổng quan hệ thống');
  });
});
