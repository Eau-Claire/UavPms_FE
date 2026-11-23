import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { AnomalyApi } from '../../../analyst-review/data-access/anomaly-api';
import { EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';
import { ALERT_PRIORITY_LABELS, ActiveEmergencyAlert } from '../../../emergency-alerts/models/emergency-alert.models';
import { MonitorApi } from '../../data-access/monitor-api';
import { pollResource } from '../../data-access/polled-resource';
import { FieldHomeHeader } from '../field-home-header/field-home-header';
import { PersonalAlertsCard } from '../personal-alerts-card/personal-alerts-card';
import { RecentDefectsTable } from '../recent-defects-table/recent-defects-table';

export const ANALYST_PENDING_PREVIEW = 5;
const EMERGENCY_PREVIEW = 6;

const PRIORITY_TONES: Record<string, string> = { Critical: 'danger', High: 'danger', Medium: 'warning', Low: 'info' };

/** "Việc của tôi" for Analyst: AI detections waiting for review, active emergency alerts, recent system defects. */
@Component({
  selector: 'app-analyst-home',
  imports: [DatePipe, DecimalPipe, RouterLink, DataState, FieldHomeHeader, PersonalAlertsCard, RecentDefectsTable],
  templateUrl: './analyst-home.html',
  styleUrl: './analyst-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalystHome {
  private readonly anomalyApi = inject(AnomalyApi);
  private readonly emergencyApi = inject(EmergencyAlertsApi);
  private readonly monitorApi = inject(MonitorApi);
  private readonly alertsCard = viewChild(PersonalAlertsCard);
  private readonly defectsPage = signal(1);

  protected readonly pending = pollResource(() => this.anomalyApi.listPending({ pageIndex: 1, pageSize: ANALYST_PENDING_PREVIEW }), {
    errorMessage: 'Không thể tải danh sách phát hiện AI chờ duyệt.',
  });
  protected readonly emergencies = pollResource(() => this.emergencyApi.fetchActiveAlerts(), {
    errorMessage: 'Không thể tải cảnh báo khẩn cấp đang hoạt động.',
  });
  protected readonly defects = pollResource(() => this.monitorApi.getRecentDefects(this.defectsPage(), 5), {
    errorMessage: 'Không thể tải sự cố gần đây.',
  });

  protected readonly loading = computed(() => this.pending.loading() || this.emergencies.loading() || this.defects.loading());
  protected readonly loadedAt = computed(() => {
    const times = [this.pending.loadedAt(), this.emergencies.loadedAt(), this.defects.loadedAt()].filter((t): t is number => t !== null);
    return times.length ? Math.max(...times) : null;
  });

  protected readonly pendingTotal = computed(() => this.pending.value()?.totalCount ?? 0);
  protected readonly pendingItems = computed(() => (this.pending.value()?.items ?? []).slice(0, ANALYST_PENDING_PREVIEW));
  protected readonly emergencyItems = computed(() =>
    [...(this.emergencies.value() ?? [])].sort((a, b) => Date.parse(b.triggeredAt) - Date.parse(a.triggeredAt)),
  );
  protected readonly emergencyPreview = computed(() => this.emergencyItems().slice(0, EMERGENCY_PREVIEW));
  protected readonly criticalEmergencies = computed(() => this.emergencyItems().filter((a) => a.priority === 'Critical').length);

  protected priorityLabel(alert: ActiveEmergencyAlert): string {
    return ALERT_PRIORITY_LABELS[alert.priority] ?? alert.priority;
  }

  protected priorityTone(alert: ActiveEmergencyAlert): string {
    return PRIORITY_TONES[alert.priority] ?? 'neutral';
  }

  protected changeDefectsPage(page: number): void {
    this.defectsPage.set(page);
    this.defects.refresh();
  }

  protected refresh(): void {
    this.pending.refresh();
    this.emergencies.refresh();
    this.defects.refresh();
    this.alertsCard()?.refresh();
  }
}
