import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Mission, MissionPage } from '../../../../models/missions.models';
import { MissionsApi } from '../../data-access/missions-api';

@Component({
  selector: 'app-mission-list',
  imports: [DatePipe, RouterLink, NzIconModule],
  templateUrl: './mission-list.html',
  styleUrl: './mission-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionList {
  private readonly api = inject(MissionsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput = new Subject<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(8);
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly response = signal<MissionPage>({ items: [], page: 1, pageSize: 8, totalCount: 0, totalPages: 1 });
  protected readonly statsTotalCount = signal(0);
  protected readonly statsItems = signal<readonly Mission[]>([]);
  protected readonly statuses = ['Pending', 'Executing', 'Completed', 'Failed', 'Cancelled'];
  protected readonly pageButtons = computed(() => this.compactPages(this.page(), this.response().totalPages));
  protected readonly stats = computed(() => {
    const items = this.statsItems();
    return [
      { label: 'Tổng nhiệm vụ', value: this.statsTotalCount(), tone: 'total', icon: 'file-text' },
      { label: 'Đang xử lý AI', value: items.filter((item) => this.isInProgress(item.status)).length, tone: 'warning', icon: 'reload' },
      { label: 'Đã hoàn thành', value: items.filter((item) => item.status === 'Completed').length, tone: 'success', icon: 'check-circle' },
      { label: 'Cảnh báo lỗi', value: items.filter((item) => this.isFailed(item.status)).length, tone: 'danger', icon: 'exclamation-circle' },
    ];
  });

  constructor() {
    this.searchInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.search.set(value);
        this.applyFilters();
      });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.response.set({ items: [], page: this.page(), pageSize: this.pageSize(), totalCount: 0, totalPages: 1 });
    const filters = { page: this.page(), pageSize: this.pageSize(), search: this.search(), status: this.status() };
    this.loadStats(filters);
    this.api.list(filters)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.response.set(response),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  protected updateSearch(value: string): void {
    this.search.set(value);
    this.searchInput.next(value);
  }

  protected refreshList(): void {
    this.load();
  }

  protected goToPage(page: number): void {
    const nextPage = this.clampPage(page, this.response().totalPages);
    if (nextPage === this.page()) return;
    this.page.set(nextPage);
    this.load();
  }

  protected statusLabel(status: string): string {
    return ({
      Pending: 'Chờ xử lý',
      Executing: 'Đang xử lý AI',
      InProgress: 'Đang bay',
      'In Progress': 'Đang bay',
      Completed: 'Hoàn thành',
      Failed: 'Lỗi bay',
      Cancelled: 'Đã hủy',
    } as Record<string, string>)[status] ?? status;
  }

  protected statusClass(status: string): string {
    if (this.isFailed(status)) return 'danger';
    if (status.replace(/\s+/g, '') === 'Completed') return 'success';
    if (this.isInProgress(status)) return 'warning';
    return 'neutral';
  }

  protected routeLabel(mission: Mission): string {
    return mission.routeData || mission.description || 'Chưa có tuyến';
  }

  protected startIndex(): number {
    if (!this.response().totalCount) return 0;
    return (this.response().page - 1) * this.response().pageSize + 1;
  }

  protected endIndex(): number {
    return Math.min(this.response().totalCount, this.response().page * this.response().pageSize);
  }

  private loadStats(filters: { search?: string; status?: string }): void {
    const pageSize = 100;
    this.api.list({ page: 1, pageSize, search: filters.search, status: filters.status })
      .pipe(
        switchMap((firstPage) => {
          if (firstPage.totalPages <= 1) return of({ items: firstPage.items, totalCount: firstPage.totalCount });
          const pages = Array.from({ length: firstPage.totalPages - 1 }, (_, index) => index + 2);
          return forkJoin(pages.map((page) => this.api.list({ page, pageSize, search: filters.search, status: filters.status })))
            .pipe(map((rest) => ({ items: [...firstPage.items, ...rest.flatMap((page) => page.items)], totalCount: firstPage.totalCount })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ items, totalCount }) => {
          this.statsItems.set(items);
          this.statsTotalCount.set(totalCount);
        },
        error: () => {
          this.statsItems.set([]);
          this.statsTotalCount.set(0);
        },
      });
  }

  private isInProgress(status: string): boolean {
    return ['Executing', 'InProgress', 'Processing', 'AIProcessing'].includes(status.replace(/\s+/g, ''));
  }

  private isFailed(status: string): boolean {
    return ['Failed', 'Error', 'Cancelled'].includes(status.replace(/\s+/g, ''));
  }

  private compactPages(current: number, total: number): readonly number[] {
    if (total <= 0) return [1];
    if (total <= 2) return Array.from({ length: total }, (_, index) => index + 1);
    const start = Math.min(Math.max(1, current - 1), total - 2);
    return [start, start + 1, start + 2];
  }

  private clampPage(page: number, total: number): number {
    if (!Number.isFinite(page)) return this.page();
    return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, total));
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tải danh sách nhiệm vụ.';
    const body = error.error && typeof error.error === 'object' ? error.error as Record<string, unknown> : {};
    return String(body['message'] ?? error.message ?? 'Không thể tải danh sách nhiệm vụ.');
  }
}
