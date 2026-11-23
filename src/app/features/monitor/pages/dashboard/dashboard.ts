import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { isFieldRole, roleFamily } from '../../../../core/auth/roles';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { AnomalyApi } from '../../../analyst-review/data-access/anomaly-api';
import { DroneManagementApi } from '../../../drones/data-access/drone-management-api';
import { MaintenanceApi } from '../../../maintenance/data-access/maintenance-api';
import { PreMissionApi } from '../../../pre-mission/data-access/pre-mission-api';
import { AnalystHome } from '../../components/analyst-home/analyst-home';
import { DefectStatisticsChart } from '../../components/defect-statistics-chart/defect-statistics-chart';
import { InspectorHome } from '../../components/inspector-home/inspector-home';
import { MissionStatusOverview } from '../../components/mission-status-overview/mission-status-overview';
import { RecentDefectsTable } from '../../components/recent-defects-table/recent-defects-table';
import { TechnicianHome } from '../../components/technician-home/technician-home';
import { MonitorStore } from '../../data-access/monitor-store';

/**
 * `/dashboard`. SystemAdmin / Manager get an operational overview with 6 live-API KPIs, mission & defect
 * charts, recent defects and notifications; Inspector, Analyst and Technician get their "Việc của tôi" home.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe,
    RouterLink,
    DataState,
    RecentDefectsTable,
    DefectStatisticsChart,
    MissionStatusOverview,
    InspectorHome,
    AnalystHome,
    TechnicianHome,
  ],
  providers: [MonitorStore],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly store = inject(MonitorStore);
  private readonly preMissionApi = inject(PreMissionApi);
  private readonly droneApi = inject(DroneManagementApi);
  private readonly anomalyApi = inject(AnomalyApi);
  private readonly maintenanceApi = inject(MaintenanceApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly role = inject(Auth).user()?.role;

  /** Field role family, or null for the manager dashboard. Fixed for the lifetime of the page. */
  protected readonly fieldFamily = isFieldRole(this.role) ? roleFamily(this.role) : null;
  protected readonly loadedAt = signal<number | null>(Date.now());

  protected readonly readyAssessmentsCount = signal<number | null>(null);
  protected readonly totalAssessmentsCount = signal<number | null>(null);
  protected readonly availableDronesCount = signal<number | null>(null);
  protected readonly totalDronesCount = signal<number | null>(null);
  protected readonly openMaintenanceCount = signal<number | null>(null);
  protected readonly totalMaintenanceCount = signal<number | null>(null);
  protected readonly pendingReviewCount = computed(() => this.anomalyApi.pendingCount());

  constructor() {
    // The system-wide stats are only shown (and polled) on the manager/admin dashboard.
    if (!this.fieldFamily) {
      this.store.startDashboardPolling();
      this.loadOperationalKpis();
    }
  }

  protected refreshManagerDashboard(): void {
    this.loadedAt.set(Date.now());
    this.store.loadDashboard();
    this.loadOperationalKpis();
  }

  private loadOperationalKpis(): void {
    forkJoin({
      assessments: this.preMissionApi.list({ page: 1, pageSize: 50 }).pipe(catchError(() => of(null))),
      drones: this.droneApi.getDrones().pipe(catchError(() => of(null))),
      maintenance: this.maintenanceApi.list({ pageIndex: 0, pageSize: 50 }).pipe(catchError(() => of(null))),
      pendingAnomalies: this.anomalyApi.listPending({ pageIndex: 1, pageSize: 15 }).pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ assessments, drones, maintenance }) => {
        if (assessments) {
          this.totalAssessmentsCount.set(assessments.totalCount || assessments.items.length);
          this.readyAssessmentsCount.set(
            assessments.items.filter((a) => (a.status || '').toUpperCase() === 'READY').length,
          );
        }
        if (drones) {
          this.totalDronesCount.set(drones.length);
          this.availableDronesCount.set(
            drones.filter((d) => (d.operationalStatus || '').toUpperCase() === 'AVAILABLE').length,
          );
        }
        if (maintenance) {
          this.totalMaintenanceCount.set(maintenance.totalCount || maintenance.items.length);
          this.openMaintenanceCount.set(
            maintenance.items.filter((t) => {
              const s = (t.status || '').toUpperCase();
              return s !== 'CLOSED' && s !== 'RESOLVED' && s !== 'CANCELLED' && s !== 'CANCELED';
            }).length,
          );
        }
      });
  }

  protected onAlertRead(id: string): void {
    this.store.markAlertRead(id);
  }

  protected onAllAlertsRead(): void {
    this.store.markAllAlertsRead();
  }
}
