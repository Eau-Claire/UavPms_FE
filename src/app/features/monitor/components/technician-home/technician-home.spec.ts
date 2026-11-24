import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../core/auth/auth';
import { MaintenanceTicket } from '../../../../models/maintenance.models';
import { UavRecord } from '../../../../models/drone-management.models';
import { DroneManagementApi } from '../../../drones/data-access/drone-management-api';
import { MaintenanceApi } from '../../../maintenance/data-access/maintenance-api';
import { MonitorApi } from '../../data-access/monitor-api';
import { TechnicianHome } from './technician-home';

const ticket = (id: string, status: string, dueDate?: string): MaintenanceTicket => ({
  id,
  ticketCode: `PBT-${id}`,
  anomalyId: 'an-1',
  managerId: 'mgr',
  status,
  priority: 'High',
  description: `Thay cách điện ${id}`,
  dueDate,
  createdAt: '2026-10-01T00:00:00Z',
  tower: { id: 't1', towerCode: 'T-101' },
  proofs: [],
  materials: [],
});

const drone = (code: string, technicalHealth: string, inspected = true): UavRecord => ({
  id: code,
  code,
  name: `Drone ${code}`,
  model: 'M300',
  category: 'Quadcopter',
  serialNumber: code,
  operationalStatus: 'Available',
  technicalHealth,
  flightEnduranceMinutes: 30,
  operationalRangeKm: 10,
  batteryLevel: 90,
  createdAt: '2026-01-01T00:00:00Z',
  lastTechnicalInspection: inspected ? { id: 'i', status: 'Passed', health: technicalHealth, completedAt: '2026-10-20T00:00:00Z', metricCount: 5 } : null,
});

async function setup() {
  const maintenanceApi = {
    mine: vi.fn().mockReturnValue(
      of([
        ticket('open-late', 'Open', '2020-01-01T00:00:00Z'),
        ticket('open-ok', 'Open', '2099-01-01T00:00:00Z'),
        ticket('doing', 'InProgress'),
        ticket('verify', 'PendingVerification', '2020-01-01T00:00:00Z'),
        ticket('closed', 'Closed'),
      ]),
    ),
  };
  const droneApi = { getDrones: vi.fn().mockReturnValue(of([drone('UAV-OK', 'Healthy'), drone('UAV-BAD', 'Critical'), drone('UAV-NEW', 'Unknown', false)])) };
  const monitorApi = { getAlerts: vi.fn().mockReturnValue(of([])) };
  await TestBed.configureTestingModule({
    imports: [TechnicianHome],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MaintenanceApi, useValue: maintenanceApi },
      { provide: DroneManagementApi, useValue: droneApi },
      { provide: MonitorApi, useValue: monitorApi },
      { provide: Auth, useValue: { user: signal({ id: 'u-tech', email: 'tech@evn.vn', fullName: 'Lê Văn Sửa', role: 'MaintenanceTechnician', mustChangePassword: false }) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TechnicianHome);
  fixture.detectChanges();
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, maintenanceApi, droneApi };
}

const section = (el: HTMLElement, key: string) => el.querySelector(`[aria-labelledby="ticket-group-${key}"]`) as HTMLElement;

describe('TechnicianHome', () => {
  it('groups my tickets by status and highlights overdue ones', async () => {
    const { el, maintenanceApi } = await setup();
    expect(maintenanceApi.mine).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Kỹ thuật viên');

    const open = section(el, 'Open');
    expect(open.textContent).toContain('Chờ xử lý');
    const openItems = Array.from(open.querySelectorAll('li.item'));
    expect(openItems.map((li) => li.querySelector('.code')?.textContent)).toEqual(['PBT-open-late', 'PBT-open-ok']);
    expect(openItems[0].classList.contains('is-overdue')).toBe(true);
    expect(openItems[0].textContent).toContain('Quá hạn');
    expect(openItems[1].classList.contains('is-overdue')).toBe(false);
    expect(openItems[0].querySelector('a.action-link')?.getAttribute('href')).toBe('/maintenance/open-late');

    expect(section(el, 'InProgress').textContent).toContain('Đang sửa chữa');
    const verify = section(el, 'PendingVerification');
    expect(verify.textContent).toContain('Chờ nghiệm thu');
    expect(verify.querySelector('li.item')?.classList.contains('is-overdue')).toBe(false);
    expect(el.textContent).not.toContain('PBT-closed');
  });

  it('lists drones needing a technical check, linking to the drone page', async () => {
    const { el } = await setup();
    const drones = el.querySelector('[aria-labelledby="drone-attention-title"]') as HTMLElement;
    const codes = Array.from(drones.querySelectorAll('li.item .code')).map((c) => c.textContent);
    expect(codes).toEqual(['UAV-BAD', 'UAV-NEW']);
    expect(drones.textContent).toContain('Lỗi - không bay');
    expect(drones.textContent).toContain('Chưa kiểm tra kỹ thuật');
    expect(drones.querySelector('li.item a')?.getAttribute('href')).toBe('/drones');
  });
});
