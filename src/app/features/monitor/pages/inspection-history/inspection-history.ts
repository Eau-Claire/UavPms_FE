import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { InspectionFilters } from '../../components/inspection-filters/inspection-filters';
import { InspectionFilters as Filters } from '../../../../core/api/models/monitor.models';
import { MonitorStore } from '../../data-access/monitor-store';

@Component({
  selector: 'app-inspection-history',
  imports: [DatePipe, DataState, Pagination, InspectionFilters],
  providers: [MonitorStore],
  templateUrl: './inspection-history.html',
  styleUrl: './inspection-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectionHistory {
  protected readonly store = inject(MonitorStore); private readonly filters = signal<Filters>({ missionId: '', isDefect: null, fromDate: '', toDate: '', page: 1, pageSize: 10 });
  constructor() { this.store.loadInspections(this.filters()); }
  protected apply(filters: Filters): void { this.filters.set(filters); this.store.loadInspections(filters); }
  protected changePage(page: number): void { const filters = { ...this.filters(), page }; this.filters.set(filters); this.store.loadInspections(filters); }
  protected retry(): void { this.store.loadInspections(this.filters()); }
}
