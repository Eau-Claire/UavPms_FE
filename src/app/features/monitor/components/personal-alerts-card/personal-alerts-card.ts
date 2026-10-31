import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MonitorAlert } from '../../../../models/monitor.models';
import { ActiveAlertsPanel } from '../active-alerts-panel/active-alerts-panel';
import { MonitorApi } from '../../data-access/monitor-api';
import { pollResource } from '../../data-access/polled-resource';

/** The signed-in user's own notifications (`GET /monitor/alerts`), refreshed every minute. */
@Component({
  selector: 'app-personal-alerts-card',
  imports: [ActiveAlertsPanel],
  template: `
    <article class="alerts-card" aria-labelledby="personal-alerts-title">
      <header>
        <h2 id="personal-alerts-title">Thông báo của tôi</h2>
        @if (unreadCount() > 0) {
          <span class="count" aria-label="{{ unreadCount() }} thông báo chưa đọc">{{ unreadCount() }} mới</span>
        }
      </header>
      @if (resource.error() && !resource.value()) {
        <p class="error" role="alert">{{ resource.error() }}</p>
      }
      <app-active-alerts-panel [alerts]="alerts()" (alertRead)="markRead($event)" (allRead)="markAllRead()" />
    </article>
  `,
  styles: `
    :host { display: block; min-height: 0; }
    .alerts-card { display: flex; flex-direction: column; height: 100%; min-height: 0; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03); overflow: hidden; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
    h2 { margin: 0; color: #0f2952; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
    .count { padding: 1px 8px; border-radius: 999px; background: #b91c1c; color: #fff; font-size: 11px; font-weight: 700; }
    .error { margin: 8px 12px 0; padding: 6px 10px; border: 1px solid #fecaca; border-radius: 4px; background: #fef2f2; color: #b91c1c; font-size: 12px; }
    app-active-alerts-panel { flex: 1 1 auto; min-height: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonalAlertsCard {
  private readonly api = inject(MonitorApi);
  private readonly readIds = signal<ReadonlySet<string>>(new Set());

  protected readonly resource = pollResource(() => this.api.getAlerts(), { errorMessage: 'Không thể tải thông báo của bạn.' });

  protected readonly alerts = computed<readonly MonitorAlert[]>(() => {
    const read = this.readIds();
    return (this.resource.value() ?? []).map((alert) => (read.has(alert.id) && !alert.isRead ? { ...alert, isRead: true } : alert));
  });
  protected readonly unreadCount = computed(() => this.alerts().filter((alert) => !alert.isRead).length);

  refresh(): void {
    this.resource.refresh();
  }

  protected markRead(id: string): void {
    this.readIds.update((ids) => new Set([...ids, id]));
  }

  protected markAllRead(): void {
    this.readIds.update((ids) => new Set([...ids, ...this.alerts().map((alert) => alert.id)]));
  }
}
