import { DestroyRef, computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, finalize, timer } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardSnapshot, InspectionFilters, PagedResponse, InspectionRecord } from '../../../models/monitor.models';
import { MonitorApi } from './monitor-api';

@Injectable({
  providedIn: 'root',
})
export class MonitorStore {
  private readonly api = inject(MonitorApi); private readonly destroyRef = inject(DestroyRef);
  private readonly dashboardState = signal<DashboardSnapshot | null>(null);
  private readonly inspectionsState = signal<PagedResponse<InspectionRecord> | null>(null);
  private readonly loadingState = signal(false); private readonly inspectionsLoadingState = signal(false);
  private readonly errorState = signal<string | null>(null); private readonly recentPageState = signal(1);
  readonly dashboard = this.dashboardState.asReadonly(); readonly inspections = this.inspectionsState.asReadonly();
  readonly loading = this.loadingState.asReadonly(); readonly inspectionsLoading = this.inspectionsLoadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  readonly summary = computed(() => this.dashboardState()?.summary); readonly recentDefects = computed(() => this.dashboardState()?.recentDefects);
  readonly defectStatistics = computed(() => this.dashboardState()?.defectStatistics ?? []); readonly missionStatus = computed(() => this.dashboardState()?.missionStatus ?? []); readonly alerts = computed(() => this.dashboardState()?.alerts ?? []);

  startDashboardPolling(): void {
    timer(0, environment.pollIntervalMs).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadDashboard(this.recentPageState(), false));
  }
  loadDashboard(page = 1, showLoading = true): void {
    this.recentPageState.set(page); if (showLoading || !this.dashboardState()) this.loadingState.set(true); this.errorState.set(null);
    this.api.getDashboard(page).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loadingState.set(false)), catchError(() => { this.errorState.set('Live monitoring data could not be loaded. Check your connection and try again.'); return EMPTY; })).subscribe((data) => this.dashboardState.set(data));
  }
  loadInspections(filters: InspectionFilters): void {
    this.inspectionsLoadingState.set(true); this.errorState.set(null);
    this.api.getInspections(filters).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.inspectionsLoadingState.set(false)), catchError(() => { this.errorState.set('Inspection history could not be loaded.'); return EMPTY; })).subscribe((data) => this.inspectionsState.set(data));
  }
}

