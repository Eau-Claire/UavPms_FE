import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { AnomalyApi } from '../../../analyst-review/data-access/anomaly-api';
import { MonitorApi } from '../../data-access/monitor-api';
import { pollResource } from '../../data-access/polled-resource';
import { FieldHomeHeader } from '../field-home-header/field-home-header';
import { RecentDefectsTable } from '../recent-defects-table/recent-defects-table';

export const ANALYST_PENDING_PREVIEW = 5;

/** "Việc của tôi" for Analyst: AI detections waiting for review and recent system defects. */
@Component({
  selector: 'app-analyst-home',
  imports: [DatePipe, DecimalPipe, RouterLink, DataState, FieldHomeHeader, RecentDefectsTable],
  templateUrl: './analyst-home.html',
  styleUrl: './analyst-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalystHome {
  private readonly anomalyApi = inject(AnomalyApi);
  private readonly monitorApi = inject(MonitorApi);
  private readonly defectsPage = signal(1);

  protected readonly pending = pollResource(() => this.anomalyApi.listPending({ pageIndex: 1, pageSize: ANALYST_PENDING_PREVIEW }), {
    errorMessage: 'Không thể tải danh sách phát hiện AI chờ duyệt.',
  });
  protected readonly defects = pollResource(() => this.monitorApi.getRecentDefects(this.defectsPage(), 5), {
    errorMessage: 'Không thể tải sự cố gần đây.',
  });

  protected readonly loading = computed(() => this.pending.loading() || this.defects.loading());
  protected readonly loadedAt = computed(() => {
    const times = [this.pending.loadedAt(), this.defects.loadedAt()].filter((t): t is number => t !== null);
    return times.length ? Math.max(...times) : null;
  });

  protected readonly pendingTotal = computed(() => this.pending.value()?.totalCount ?? 0);
  protected readonly pendingItems = computed(() => (this.pending.value()?.items ?? []).slice(0, ANALYST_PENDING_PREVIEW));

  protected changeDefectsPage(page: number): void {
    this.defectsPage.set(page);
    this.defects.refresh();
  }

  protected refresh(): void {
    this.pending.refresh();
    this.defects.refresh();
  }
}
