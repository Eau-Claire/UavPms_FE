import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { NotificationLink, notificationLink } from '../../../../core/layout/header/notification-link';
import { MonitorAlert } from '../../../../models/monitor.models';
import { NotificationsApi } from '../../../../core/services/notifications-api';
import { NotificationsStore } from '../../../../core/notifications/notifications-store';
import { markAlertIdAsReadLocally, markAllAlertIdsAsReadLocally } from '../../../../core/services/monitor-api';

export interface DailySummaryMetrics {
  missions: number;
  inspections: number;
  alerts: number;
  defects: number;
  critical: number;
}

@Component({
  selector: 'app-active-alerts-panel',
  imports: [DatePipe, RouterLink, NzIconModule],
  templateUrl: './active-alerts-panel.html',
  styleUrl: './active-alerts-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveAlertsPanel {
  private readonly notificationsApi = inject(NotificationsApi);
  private readonly notificationsStore = inject(NotificationsStore);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly alerts = input.required<readonly MonitorAlert[]>();
  readonly alertRead = output<string>();
  readonly allRead = output<void>();

  readonly selectedAlert = signal<MonitorAlert | null>(null);
  readonly filterMode = signal<'all' | 'unread'>('all');
  readonly showAll = signal<boolean>(false);
  readonly defaultLimit = 5;

  readonly unreadCount = computed(() => this.alerts().filter((a) => !a.isRead).length);

  readonly filteredAlerts = computed(() => {
    const list = this.alerts();
    const result = this.filterMode() === 'unread' ? list.filter((a) => !a.isRead) : list;
    return [...result].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    });
  });

  readonly displayedAlerts = computed(() => {
    const list = this.filteredAlerts();
    if (this.showAll()) {
      return list;
    }
    return list.slice(0, this.defaultLimit);
  });

  readonly remainingCount = computed(() => {
    const total = this.filteredAlerts().length;
    return Math.max(0, total - this.defaultLimit);
  });

  toggleShowAll(): void {
    this.showAll.update((v) => !v);
  }

  cleanTitle(title: string): string {
    if (!title) return 'Cảnh báo hệ thống';
    return title.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim() || 'Cảnh báo hệ thống';
  }

  parseSummary(message: string): DailySummaryMetrics | null {
    if (!message) return null;
    const missionsMatch = message.match(/Tổng nhiệm vụ:\s*(\d+)/i);
    const inspectionsMatch = message.match(/Tổng kiểm tra:\s*(\d+)/i);
    const alertsMatch = message.match(/Cảnh báo đang xử lý:\s*(\d+)/i);
    const defectsMatch = message.match(/Khuyết tật phát hiện:\s*(\d+)(?:\s*\(nghiêm trọng:\s*(\d+)\))?/i);
    if (!missionsMatch && !inspectionsMatch && !alertsMatch && !defectsMatch) return null;
    return {
      missions: missionsMatch ? Number(missionsMatch[1]) : 0,
      inspections: inspectionsMatch ? Number(inspectionsMatch[1]) : 0,
      alerts: alertsMatch ? Number(alertsMatch[1]) : 0,
      defects: defectsMatch ? Number(defectsMatch[1]) : 0,
      critical: defectsMatch && defectsMatch[2] ? Number(defectsMatch[2]) : 0,
    };
  }

  getAlertLink(alert: MonitorAlert): NotificationLink | null {
    const role = this.auth.user()?.role;

    if (alert.referenceType && alert.referenceId) {
      const link = notificationLink(
        {
          type: alert.type,
          referenceType: alert.referenceType,
          referenceId: alert.referenceId,
        },
        role,
      );
      if (link) return link;
    }

    const notif = this.notificationsStore.notifications().find((n) => n.id === alert.id);
    if (notif?.referenceType && notif?.referenceId) {
      const link = notificationLink(notif, role);
      if (link) return link;
    }

    const text = `${alert.title} ${alert.message}`;
    const uuidMatch = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    const id = uuidMatch ? uuidMatch[0] : '';

    const lower = text.toLowerCase();
    if (lower.includes('nhiệm vụ') || lower.includes('mission')) {
      if (id) {
        return notificationLink({ type: alert.type || 'MISSION_ASSIGNED', referenceType: 'mission', referenceId: id }, role);
      }
      return { commands: ['/missions'], label: 'Đến trang nhiệm vụ' };
    }
    if (lower.includes('bảo trì') || lower.includes('phiếu')) {
      if (id) {
        return notificationLink({ type: alert.type || 'TICKET_CREATED', referenceType: 'maintenanceticket', referenceId: id }, role);
      }
      return { commands: ['/maintenance'], label: 'Đến trang bảo trì' };
    }
    if (lower.includes('khuyết tật') || lower.includes('sự cố') || lower.includes('phát hiện ai')) {
      if (id) {
        return notificationLink({ type: alert.type || 'ANOMALY_CONFIRMED', referenceType: 'detectedanomaly', referenceId: id }, role);
      }
      return { commands: ['/ai-review'], label: 'Thẩm định phát hiện AI' };
    }
    if (lower.includes('khẩn cấp') || lower.includes('nguy hiểm')) {
      return { commands: ['/emergency-alerts'], label: 'Mở cảnh báo khẩn cấp' };
    }

    return null;
  }

  navigateToLink(alert: MonitorAlert, event?: Event): void {
    if (event) event.stopPropagation();
    if (!alert.isRead) {
      this.markAsRead(alert);
    }
    const link = this.getAlertLink(alert);
    if (link) {
      this.closeModal();
      void this.router.navigate(link.commands as string[]);
    }
  }

  openAlert(alert: MonitorAlert): void {
    if (!alert.isRead) {
      this.markAsRead(alert);
    }
    this.selectedAlert.set({ ...alert, isRead: true });
  }

  closeModal(): void {
    this.selectedAlert.set(null);
  }

  markAsRead(alert: MonitorAlert, event?: Event): void {
    if (event) event.stopPropagation();
    markAlertIdAsReadLocally(alert.id);
    this.alertRead.emit(alert.id);
    this.notificationsApi.markRead(alert.id).subscribe();
    if (this.selectedAlert()?.id === alert.id) {
      this.selectedAlert.update((curr) => (curr ? { ...curr, isRead: true } : curr));
    }
  }

  markAllAsRead(): void {
    const ids = this.alerts().map((a) => a.id);
    markAllAlertIdsAsReadLocally(ids);
    this.allRead.emit();
    const unread = this.alerts().filter((a) => !a.isRead);
    unread.forEach((a) => {
      this.notificationsApi.markRead(a.id).subscribe();
    });
    if (this.selectedAlert()) {
      this.selectedAlert.update((curr) => (curr ? { ...curr, isRead: true } : curr));
    }
  }
}
