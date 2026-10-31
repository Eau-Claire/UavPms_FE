import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth/auth';
import { EmergencyAlertsApi } from '../../../features/emergency-alerts/data-access/emergency-alerts-api';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  const setup = (role: string, open = false) => {
    const user = signal<{ id: string; role: string } | null>({ id: 'u1', role });
    const activeCount = signal(0);
    const alertsApi = {
      activeCount,
      fetchActiveAlerts: vi.fn(() => {
        activeCount.set(3);
        return of([]);
      }),
    };
    TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { user } },
        { provide: EmergencyAlertsApi, useValue: alertsApi },
      ],
    });
    const fixture: ComponentFixture<Sidebar> = TestBed.createComponent(Sidebar);
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const links = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.app-nav-item')).map((a) => ({
        href: a.getAttribute('href'),
        label: a.querySelector('.app-nav-label')?.textContent?.trim(),
        badge: a.querySelector('.app-nav-badge-danger [aria-hidden="true"]')?.textContent?.trim(),
      }));
    return { fixture, links, alertsApi };
  };

  it('gives inspectors a short field menu', () => {
    const { links, alertsApi } = setup('Inspector');
    expect(links().map((l) => l.href)).toEqual(['/dashboard', '/missions', '/gis', '/towers', '/inspections', '/reports']);
    expect(links().find((l) => l.href === '/missions')?.label).toBe('Nhiệm vụ của tôi');
    expect(links().find((l) => l.href === '/inspections')?.label).toBe('Lịch sử kiểm tra');
    expect(alertsApi.fetchActiveAlerts).not.toHaveBeenCalled();
  });

  it('gives analysts the emergency alerts link with the active alert count', () => {
    const { links, alertsApi } = setup('Analyst');
    expect(links().map((l) => l.href)).toEqual([
      '/dashboard', '/emergency-alerts', '/ai-review', '/ai-analysis/upload', '/missions', '/gis', '/towers', '/inspections', '/reports',
    ]);
    expect(alertsApi.fetchActiveAlerts).toHaveBeenCalledTimes(1);
    expect(links().find((l) => l.href === '/emergency-alerts')?.badge).toBe('3');
  });

  it('gives technicians maintenance, drones, pre-mission and GIS', () => {
    for (const role of ['Technician', 'MaintenanceTechnician']) {
      TestBed.resetTestingModule();
      const { links } = setup(role);
      expect(links().map((l) => l.href)).toEqual(['/dashboard', '/maintenance', '/drones', '/pre-mission', '/missions', '/gis', '/towers', '/reports']);
      expect(links().find((l) => l.href === '/maintenance')?.label).toBe('Phiếu bảo trì của tôi');
    }
  });

  it('keeps the manager menu and drops dead secondary links', () => {
    const { links } = setup('Manager', true);
    const hrefs = links().map((l) => l.href);
    expect(hrefs).toContain('/admin/users');
    expect(hrefs).toContain('/system/audit-logs');
    expect(hrefs).not.toContain('/system');
    expect(hrefs.filter((h) => h === '/inspections')).toHaveLength(1);
  });

  it('shows no secondary links to field roles', () => {
    const { fixture } = setup('Technician', true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.app-sidebar-nav-secondary')).toBeNull();
  });
});
