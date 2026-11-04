import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../../../core/auth/auth';
import { isFieldRole, roleFamily } from '../../../../core/auth/roles';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { ActiveAlertsPanel } from '../../components/active-alerts-panel/active-alerts-panel';
import { AnalystHome } from '../../components/analyst-home/analyst-home';
import { DefectStatisticsChart } from '../../components/defect-statistics-chart/defect-statistics-chart';
import { InspectorHome } from '../../components/inspector-home/inspector-home';
import { MissionStatusOverview } from '../../components/mission-status-overview/mission-status-overview';
import { RecentDefectsTable } from '../../components/recent-defects-table/recent-defects-table';
import { TechnicianHome } from '../../components/technician-home/technician-home';
import { MonitorStore } from '../../data-access/monitor-store';

/**
 * `/dashboard`. SystemAdmin / Manager (and unknown roles) get the system-wide monitoring dashboard;
 * Inspector, Analyst and Technician get their own "Việc của tôi" home instead.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    DataState,
    RecentDefectsTable,
    DefectStatisticsChart,
    MissionStatusOverview,
    ActiveAlertsPanel,
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

  constructor() {
    // The system-wide stats are only shown (and polled) on the manager dashboard.
    if (!this.fieldFamily) this.store.startDashboardPolling();
  }

  protected onAlertRead(id: string): void {
    this.store.markAlertRead(id);
  }

  protected onAllAlertsRead(): void {
    this.store.markAllAlertsRead();
  }
}
