import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../core/auth/auth';
import { MissionsApi, normalizeMission } from '../../../missions/data-access/missions-api';
import { MonitorApi } from '../../data-access/monitor-api';
import { InspectorHome } from './inspector-home';

const ME = 'aaaaaaaa-0000-0000-0000-000000000001';
const team = (responseStatus: string) => [{ id: 'as-1', userId: ME, userName: 'Tôi', assignmentRole: 'Pilot', status: 'Active', responseStatus }];

const missions = [
  normalizeMission({ id: 'm-pending', missionCode: 'NV-001', title: 'Tuyến 110kV A', status: 'PendingAcceptance', regionName: 'Đà Nẵng', confirmationDeadline: '2026-11-01T08:00:00Z', team: team('Pending') }),
  normalizeMission({ id: 'm-ready', missionCode: 'NV-002', title: 'Tuyến 220kV B', status: 'Ready', regionName: 'Huế', plannedStart: '2026-11-02T01:00:00Z', plannedEnd: '2026-11-02T04:00:00Z', team: team('Accepted') }),
  normalizeMission({ id: 'm-flying', missionCode: 'NV-003', title: 'Tuyến 500kV C', status: 'InProgress', team: team('Accepted') }),
  normalizeMission({ id: 'm-done', missionCode: 'NV-004', title: 'Tuyến 35kV D', status: 'Completed', actualCompleted: '2026-10-30T08:00:00Z', team: team('Accepted') }),
];

async function setup(myMissions = of(missions)) {
  const missionsApi = { my: vi.fn().mockReturnValue(myMissions) };
  const monitorApi = { getAlerts: vi.fn().mockReturnValue(of([{ id: 'n1', title: 'Nhiệm vụ mới', message: 'Bạn được giao NV-001', createdAt: '2026-10-31T01:00:00Z', isRead: false }])) };
  await TestBed.configureTestingModule({
    imports: [InspectorHome],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MissionsApi, useValue: missionsApi },
      { provide: MonitorApi, useValue: monitorApi },
      { provide: Auth, useValue: { user: signal({ id: ME, email: 'pilot@evn.vn', fullName: 'Nguyễn Văn Bay', role: 'Inspector', mustChangePassword: false }) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(InspectorHome);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, missionsApi, monitorApi };
}

const section = (el: HTMLElement, key: string) => el.querySelector(`[aria-labelledby="inspector-group-${key}"]`) as HTMLElement;

describe('InspectorHome', () => {
  it('greets the user with the role label and loads only personal data', async () => {
    const { el, missionsApi, monitorApi } = await setup();
    expect(el.querySelector('h1')?.textContent).toContain('Nguyễn Văn Bay');
    expect(el.textContent).toContain('Phi công / Inspector');
    expect(missionsApi.my).toHaveBeenCalledTimes(1);
    expect(monitorApi.getAlerts).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Bạn được giao NV-001');
  });

  it('groups missions and links each to the right page', async () => {
    const { el } = await setup();

    const awaiting = section(el, 'awaiting');
    expect(awaiting.textContent).toContain('Chờ tôi xác nhận');
    expect(awaiting.textContent).toContain('NV-001');
    expect(awaiting.textContent).toContain('Đà Nẵng');
    expect(awaiting.querySelector('a.action-link')?.getAttribute('href')).toBe('/missions/m-pending/inspector');

    const upcoming = section(el, 'upcoming');
    expect(upcoming.textContent).toContain('NV-002');
    expect(upcoming.textContent).toContain('Sẵn sàng bay');
    expect(upcoming.querySelector('a.action-link')?.getAttribute('href')).toBe('/missions/m-ready');

    expect(section(el, 'flying').querySelector('a.action-link')?.getAttribute('href')).toBe('/missions/m-flying');
    expect(section(el, 'completed').textContent).toContain('NV-004');
    expect(section(el, 'paused')).toBeNull();
  });

  it('shows an error state with retry when the missions cannot be loaded', async () => {
    const { el } = await setup(throwError(() => new Error('down')));
    expect(el.textContent).toContain('Không thể tải danh sách nhiệm vụ của bạn.');
    expect(el.querySelector('app-data-state')).not.toBeNull();
  });
});
