import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { ActiveAlertsPanel } from '../../components/active-alerts-panel/active-alerts-panel';
import { DefectStatisticsChart } from '../../components/defect-statistics-chart/defect-statistics-chart';
import { MissionStatusOverview } from '../../components/mission-status-overview/mission-status-overview';
import { RecentDefectsTable } from '../../components/recent-defects-table/recent-defects-table';
import { SummaryCard } from '../../components/summary-card/summary-card';
import { MonitorStore } from '../../data-access/monitor-store';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DataState, SummaryCard, RecentDefectsTable, DefectStatisticsChart, MissionStatusOverview, ActiveAlertsPanel],
  providers: [MonitorStore],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly store = inject(MonitorStore);
  constructor() { this.store.startDashboardPolling(); }
}
