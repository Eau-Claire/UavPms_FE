import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MonitorAlert } from '../../../../models/monitor.models';
import { NotificationsApi } from '../../../notifications/data-access/notifications-api';
import { ActiveAlertsPanel } from './active-alerts-panel';

function makeAlert(id: string, isRead = false, index = 1): MonitorAlert {
  return {
    id,
    title: `Cảnh báo ${index}`,
    message: `Nhiệm vụ: ${index} | Kiểm tra: ${index * 2}`,
    createdAt: new Date(Date.now() - index * 60000).toISOString(),
    isRead,
  };
}

@Component({
  imports: [ActiveAlertsPanel],
  template: `
    <app-active-alerts-panel
      [alerts]="alerts()"
      (alertRead)="onAlertRead($event)"
      (allRead)="onAllRead()"
    />
  `,
})
class TestHostComponent {
  readonly alerts = signal<MonitorAlert[]>([]);
  readonly onAlertRead = vi.fn();
  readonly onAllRead = vi.fn();
}

describe('ActiveAlertsPanel', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let notificationsApiMock: { markRead: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    notificationsApiMock = {
      markRead: vi.fn().mockReturnValue(of({ success: true })),
    };

    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationsApi, useValue: notificationsApiMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('renders at most 5 alerts by default when more than 5 alerts are passed', async () => {
    const list: MonitorAlert[] = Array.from({ length: 8 }, (_, i) => makeAlert(`a-${i + 1}`, false, i + 1));
    host.alerts.set(list);
    fixture.detectChanges();
    await fixture.whenStable();

    const cards = fixture.nativeElement.querySelectorAll('.alert-card');
    expect(cards.length).toBe(5);

    const footer = fixture.nativeElement.querySelector('.alerts-footer');
    expect(footer).not.toBeNull();
    expect(footer.textContent).toContain('Hiển thị 5/8 mới nhất');
    expect(footer.textContent).toContain('Xem thêm');
  });

  it('toggles expand/collapse on clicking the toggle button', async () => {
    const list: MonitorAlert[] = Array.from({ length: 8 }, (_, i) => makeAlert(`a-${i + 1}`, false, i + 1));
    host.alerts.set(list);
    fixture.detectChanges();
    await fixture.whenStable();

    const toggleBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.toggle-expand-btn');
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.textContent.trim()).toBe('Xem thêm');

    // Click to expand
    toggleBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    let cards = fixture.nativeElement.querySelectorAll('.alert-card');
    expect(cards.length).toBe(8);
    expect(toggleBtn.textContent.trim()).toBe('Thu gọn');

    // Click to collapse
    toggleBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    cards = fixture.nativeElement.querySelectorAll('.alert-card');
    expect(cards.length).toBe(5);
    expect(toggleBtn.textContent.trim()).toBe('Xem thêm');
  });

  it('filters by unread tab correctly', async () => {
    const list: MonitorAlert[] = [
      makeAlert('a-1', true, 1),
      makeAlert('a-2', false, 2),
      makeAlert('a-3', true, 3),
      makeAlert('a-4', false, 4),
    ];
    host.alerts.set(list);
    fixture.detectChanges();
    await fixture.whenStable();

    const tabs: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.filter-tab'));
    const unreadTab = tabs.find((t) => t.textContent?.includes('Chưa đọc'));
    expect(unreadTab).not.toBeNull();
    expect(unreadTab!.textContent).toContain('2'); // unread pill count

    unreadTab!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const cards = fixture.nativeElement.querySelectorAll('.alert-card');
    expect(cards.length).toBe(2);
  });

  it('marks alert as read when clicked and opens modal', async () => {
    const list: MonitorAlert[] = [makeAlert('a-1', false, 1)];
    host.alerts.set(list);
    fixture.detectChanges();
    await fixture.whenStable();

    const card: HTMLElement = fixture.nativeElement.querySelector('.alert-card');
    card.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(notificationsApiMock.markRead).toHaveBeenCalledWith('a-1');
    expect(host.onAlertRead).toHaveBeenCalledWith('a-1');

    const modal = fixture.nativeElement.querySelector('.modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Cảnh báo 1');
  });

  it('shows compact footer with emergency alerts link when <= 5 items', async () => {
    const list: MonitorAlert[] = [makeAlert('a-1', false, 1), makeAlert('a-2', false, 2)];
    host.alerts.set(list);
    fixture.detectChanges();
    await fixture.whenStable();

    const footerCompact = fixture.nativeElement.querySelector('.alerts-footer-compact');
    expect(footerCompact).not.toBeNull();
    expect(footerCompact.querySelector('a')?.getAttribute('href')).toBe('/emergency-alerts');
  });
});
