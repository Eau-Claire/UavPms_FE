import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AppNotification } from '../../../models/notification.models';
import { Auth } from '../../auth/auth';
import { FacilityStore } from '../../facility/facility-store';
import { NotificationsStore } from '../../../features/notifications/data-access/notifications-store';
import { Header } from './header';

describe('Header', () => {
  const setup = (role: string, selected: AppNotification | null = null) => {
    const user = signal({ id: 'u1', email: 'nv.a@evn.vn', fullName: 'Nguyễn Văn A', role, mustChangePassword: false });
    const list = signal<readonly AppNotification[]>(selected ? [selected] : []);
    const notifications = {
      loading: signal(false),
      deletingId: signal(''),
      error: signal(''),
      filters: signal({ read: 'all', type: '', sort: 'newest' }),
      selected: signal<AppNotification | null>(selected),
      unreadCount: signal(0),
      types: signal<string[]>([]),
      filteredNotifications: list,
      unreadNotifications: signal<AppNotification[]>([]),
      connect: vi.fn(),
      disconnect: vi.fn(),
      load: vi.fn(),
      select: vi.fn(),
      clearSelection: vi.fn(),
      markRead: vi.fn(),
      delete: vi.fn(),
      setReadFilter: vi.fn(),
      setTypeFilter: vi.fn(),
      setSortFilter: vi.fn(),
    };
    const facility = { id: 'all', name: 'TẤT CẢ KHU VỰC' };
    TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { user, logout: vi.fn() } },
        { provide: NotificationsStore, useValue: notifications },
        {
          provide: FacilityStore,
          useValue: { facilities: signal([facility]), selectedFacility: signal(facility), currentFacilityName: signal(facility.name), selectFacility: vi.fn() },
        },
      ],
    });
    const fixture: ComponentFixture<Header> = TestBed.createComponent(Header);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const openPanel = (fixture: ComponentFixture<Header>) => {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.app-notification-button')?.click();
    fixture.detectChanges();
  };

  const notification = (referenceType: string, type: string, referenceId = 'ref-1'): AppNotification => ({
    id: 'n1', title: 'Thông báo', body: '', createdAt: '2026-10-31T08:00:00Z', isRead: false, type, referenceType, referenceId,
  });

  it('shows the role in Vietnamese and hides the region picker for field roles', () => {
    const { fixture, el } = setup('MaintenanceTechnician');
    el.querySelector<HTMLButtonElement>('.app-header-user-btn')?.click();
    fixture.detectChanges();
    expect(el.querySelector('.app-profile-menu-header small')?.textContent?.trim()).toBe('Kỹ thuật viên');
    expect(el.querySelector('.app-facility-wrap')).toBeNull();
  });

  it('keeps the region picker for managers', () => {
    const { el } = setup('Manager');
    expect(el.querySelector('.app-facility-wrap')).not.toBeNull();
  });

  it('links an assignment notification to the acceptance page for an inspector', () => {
    const { fixture, el } = setup('Inspector', notification('MISSION', 'MISSION_DISPATCH', 'm1'));
    openPanel(fixture);
    const link = el.querySelector<HTMLAnchorElement>('.notification-go-mission-btn');
    expect(link?.getAttribute('href')).toBe('/missions/m1/inspector');
    expect(link?.textContent).toContain('Tiếp nhận nhiệm vụ');
    expect(el.querySelector('.notification-detail dd')?.textContent?.trim()).toBe('Nhiệm vụ');
  });

  it('links a maintenance ticket notification for a technician', () => {
    const { fixture, el } = setup('Technician', notification('MaintenanceTicket', 'MAINTENANCE_ASSIGNED', 't1'));
    openPanel(fixture);
    expect(el.querySelector('.notification-go-mission-btn')?.getAttribute('href')).toBe('/maintenance/t1');
  });

  it('shows no link when the role may not open the referenced page', () => {
    const { fixture, el } = setup('Inspector', notification('DetectedAnomaly', 'CriticalAlert', 'a1'));
    openPanel(fixture);
    expect(el.querySelector('.notification-detail')).not.toBeNull();
    expect(el.querySelector('.notification-go-mission-btn')).toBeNull();
  });
});
