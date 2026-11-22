import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { isFieldRole, roleFamily } from '../../../../core/auth/roles';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { AnalystHome } from '../../components/analyst-home/analyst-home';
import { DefectStatisticsChart } from '../../components/defect-statistics-chart/defect-statistics-chart';
import { FieldHomeHeader } from '../../components/field-home-header/field-home-header';
import { InspectorHome } from '../../components/inspector-home/inspector-home';
import { MissionStatusOverview } from '../../components/mission-status-overview/mission-status-overview';
import { PersonalAlertsCard } from '../../components/personal-alerts-card/personal-alerts-card';
import { RecentDefectsTable } from '../../components/recent-defects-table/recent-defects-table';
import { TechnicianHome } from '../../components/technician-home/technician-home';
import { MonitorStore } from '../../data-access/monitor-store';

/**
 * `/dashboard`. SystemAdmin / Manager get a unified home structure with KPI strip, operations overview
 * and personal notifications; Inspector, Analyst and Technician get their specialized "Việc của tôi" home.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    NzIconModule,
    DataState,
    RecentDefectsTable,
    DefectStatisticsChart,
    MissionStatusOverview,
    FieldHomeHeader,
    PersonalAlertsCard,
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
  private readonly role = inject(Auth).user()?.role;

  /** Field role family, or null for the manager dashboard. Fixed for the lifetime of the page. */
  protected readonly fieldFamily = isFieldRole(this.role) ? roleFamily(this.role) : null;
  protected readonly loadedAt = signal<number | null>(Date.now());

  constructor() {
    // The system-wide stats are only shown (and polled) on the manager dashboard.
    if (!this.fieldFamily) this.store.startDashboardPolling();
  }

  protected refreshManagerDashboard(): void {
    this.loadedAt.set(Date.now());
    this.store.loadDashboard();
  }

  protected onAlertRead(id: string): void {
    this.store.markAlertRead(id);
  }

  protected onAllAlertsRead(): void {
    this.store.markAllAlertsRead();
  }
}
