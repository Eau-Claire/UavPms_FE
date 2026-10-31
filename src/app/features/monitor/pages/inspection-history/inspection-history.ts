import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { InspectionFilterChange, InspectionFilters } from '../../components/inspection-filters/inspection-filters';
import { InspectionFilters as Filters, InspectionRecord } from '../../../../models/monitor.models';
import { MonitorStore } from '../../data-access/monitor-store';

/** Case- and accent-insensitive text for matching mission names ("Kiểm tra" ~ "kiem tra"). */
const foldText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

export const matchesMissionSearch = (record: InspectionRecord, search: string): boolean => {
  const needle = foldText(search);
  if (!needle) return true;
  return foldText(record.missionName).includes(needle) || record.missionId.toLowerCase().includes(needle);
};

@Component({
  selector: 'app-inspection-history',
  imports: [DatePipe, RouterLink, NzIconModule, DataState, Pagination, InspectionFilters],
  providers: [MonitorStore],
  templateUrl: './inspection-history.html',
  styleUrl: './inspection-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectionHistory {
  protected readonly store = inject(MonitorStore);

  private readonly filters = signal<Filters>({
    missionId: '',
    isDefect: null,
    fromDate: '',
    toDate: '',
    page: 1,
    pageSize: 10,
  });
  /** Free-text mission filter applied to the loaded page only (the backend filters by mission id). */
  protected readonly missionSearch = signal('');
  protected readonly missionLabel = signal('');

  protected readonly pageItems = computed(() => this.store.inspections()?.items ?? []);
  protected readonly visibleItems = computed(() => {
    const search = this.missionSearch();
    return search ? this.pageItems().filter((item) => matchesMissionSearch(item, search)) : this.pageItems();
  });
  protected readonly defectCount = computed(() => this.visibleItems().filter((i) => i.isDefect).length);
  protected readonly normalCount = computed(() => this.visibleItems().filter((i) => !i.isDefect).length);

  constructor() {
    this.store.loadInspections(this.filters());
  }

  protected apply(change: InspectionFilterChange): void {
    this.missionSearch.set(change.missionSearch);
    this.missionLabel.set(change.missionLabel);
    this.filters.set(change.filters);
    this.store.loadInspections(change.filters);
  }

  protected changePage(page: number): void {
    const filters = { ...this.filters(), page };
    this.filters.set(filters);
    this.store.loadInspections(filters);
  }

  protected retry(): void {
    this.store.loadInspections(this.filters());
  }
}
