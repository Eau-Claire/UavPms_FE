import { DestroyRef, computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, finalize, timer } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardSnapshot, InspectionFilters, PagedResponse, InspectionRecord } from '../../../models/monitor.models';
import { MonitorApi, markAlertIdAsReadLocally, markAllAlertIdsAsReadLocally } from './monitor-api';

@Injectable({
  providedIn: 'root',
})
export class MonitorStore {
  private readonly api = inject(MonitorApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dashboardState = signal<DashboardSnapshot | null>(null);
  private readonly inspectionsState = signal<PagedResponse<InspectionRecord> | null>(null);
  private readonly loadingState = signal(false);
  private readonly inspectionsLoadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly recentPageState = signal(1);

  readonly dashboard = this.dashboardState.asReadonly();
  readonly inspections = this.inspectionsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly inspectionsLoading = this.inspectionsLoadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly summary = computed(() => this.dashboardState()?.summary);
  readonly recentDefects = computed(() => this.dashboardState()?.recentDefects);
  readonly defectStatistics = computed(() => this.dashboardState()?.defectStatistics ?? []);
  readonly missionStatus = computed(() => this.dashboardState()?.missionStatus ?? []);
  readonly alerts = computed(() => this.dashboardState()?.alerts ?? []);

  startDashboardPolling(): void {
    timer(0, environment.dashboardPollIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadDashboard(this.recentPageState(), false));
  }

  loadDashboard(page = 1, showLoading = true): void {
    this.recentPageState.set(page);
    if (showLoading || !this.dashboardState()) this.loadingState.set(true);
    this.errorState.set(null);
    this.api
      .getDashboard(page)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingState.set(false)),
        catchError(() => {
          this.errorState.set('Không thể tải dữ liệu giám sát. Vui lòng kiểm tra kết nối và thử lại.');
          return EMPTY;
        }),
      )
      .subscribe((data) => this.dashboardState.set(data));
  }

  loadInspections(filters: InspectionFilters): void {
    this.inspectionsLoadingState.set(true);
    this.errorState.set(null);
    this.api
      .getInspections(filters)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.inspectionsLoadingState.set(false)),
        catchError(() => {
          this.errorState.set('Không thể tải lịch sử kiểm tra.');
          return EMPTY;
        }),
      )
      .subscribe((data) => this.inspectionsState.set(data));
  }

  markAlertRead(id: string): void {
    markAlertIdAsReadLocally(id);
    this.dashboardState.update((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        alerts: curr.alerts.map((a) => (a.id === id ? { ...a, isRead: true } : a)),
      };
    });
  }

  markAllAlertsRead(): void {
    const alerts = this.alerts();
    const ids = alerts.map((a) => a.id);
    markAllAlertIdsAsReadLocally(ids);
    this.dashboardState.update((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        alerts: curr.alerts.map((a) => ({ ...a, isRead: true })),
      };
    });
  }
}
