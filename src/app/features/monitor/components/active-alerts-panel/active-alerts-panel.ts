import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonitorAlert } from '../../../../models/monitor.models';
import { NotificationsApi } from '../../../notifications/data-access/notifications-api';
import { markAlertIdAsReadLocally, markAllAlertIdsAsReadLocally } from '../../data-access/monitor-api';

export interface DailySummaryMetrics {
  missions: number;
  inspections: number;
  alerts: number;
  defects: number;
  critical: number;
}

@Component({
  selector: 'app-active-alerts-panel',
  imports: [DatePipe, RouterLink],
  templateUrl: './active-alerts-panel.html',
  styleUrl: './active-alerts-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveAlertsPanel {
  private readonly notificationsApi = inject(NotificationsApi);

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
    if (this.filterMode() === 'unread') {
      return list.filter((a) => !a.isRead);
    }
    return list;
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

  openAlert(alert: MonitorAlert): void {
    this.selectedAlert.set(alert);
    if (!alert.isRead) {
      this.markAsRead(alert);
    }
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
