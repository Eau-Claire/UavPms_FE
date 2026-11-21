import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { debounceTime, distinctUntilChanged, finalize, Subject } from 'rxjs';
import {
  AnomalyApi,
  anomalyErrorMessage,
  AnomalyItem,
  AnomalyPage,
  AnomalyStatusCounts,
  EXECUTION_LOCATION_LABELS,
  groupSuperseded,
} from '../../../../core/services/anomaly-api';

export type AnomalyFilterStatus = 'all' | 'pending' | 'confirmed' | 'rejected' | 'resolved';

@Component({
  selector: 'app-detection-list',
  imports: [DatePipe, RouterLink, NzIconModule],
  templateUrl: './detection-list.html',
  styleUrl: './detection-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectionList {
  private readonly api = inject(AnomalyApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchSubject = new Subject<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly pageSizes = [10, 20, 50] as const;
  protected readonly search = signal('');
  protected readonly selectedStatus = signal<AnomalyFilterStatus>('all');
  protected readonly statusCounts = signal<AnomalyStatusCounts>({
    all: 0,
    pending: 0,
    confirmed: 0,
    rejected: 0,
    resolved: 0,
  });
  protected readonly viewMode = signal<'table' | 'grid'>('table');
  protected readonly showSuperseded = signal(false);
  protected readonly executionLabels = EXECUTION_LOCATION_LABELS;

  protected readonly response = signal<AnomalyPage>({
    items: [],
    totalCount: 0,
    pageIndex: 1,
    pageSize: 10,
    totalPages: 1,
  });

  private readonly grouping = computed(() => groupSuperseded(this.response().items));

  protected readonly hiddenSupersededCount = computed(() => this.grouping().hiddenCount);

  protected readonly displayedItems = computed<readonly AnomalyItem[]>(() =>
    this.showSuperseded() ? this.response().items : this.grouping().visible,
  );

  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.response().totalPages }, (_, index) => index + 1),
  );

  protected readonly startIndex = computed(() => {
    const total = this.response().totalCount;
    if (!total) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  protected readonly endIndex = computed(() => {
    const total = this.response().totalCount;
    if (!total) return 0;
    return Math.min(this.page() * this.pageSize(), total);
  });

  protected readonly pageButtons = computed(() => {
    const total = this.response().totalPages;
    const curr = this.page();
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, curr - Math.floor(maxButtons / 2));
    const end = Math.min(total, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.search().trim() || this.showSuperseded() || this.selectedStatus() !== 'all'),
  );

  protected readonly criticalCount = computed(() =>
    this.grouping().visible.filter((item) => item.isEmergency || (item.severity ?? 0) >= 4).length,
  );

  protected readonly highConfidenceCount = computed(() =>
    this.grouping().visible.filter((item) => item.confidenceScore >= 90).length,
  );

  protected readonly missingTowerCount = computed(() =>
    this.grouping().visible.filter((item) => !item.towerId).length,
  );

  constructor() {
    const qpStatus = this.route.snapshot.queryParamMap.get('status')?.toLowerCase();
    if (
      qpStatus === 'pending' ||
      qpStatus === 'confirmed' ||
      qpStatus === 'rejected' ||
      qpStatus === 'resolved' ||
      qpStatus === 'all'
    ) {
      this.selectedStatus.set(qpStatus as AnomalyFilterStatus);
    }
    const qpSearch = this.route.snapshot.queryParamMap.get('search');
    if (qpSearch) {
      this.search.set(qpSearch);
    }

    this.searchSubject
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query);
        this.page.set(1);
        this.load();
      });

    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .list({
        pageIndex: this.page(),
        pageSize: this.pageSize(),
        search: this.search(),
        status: this.selectedStatus(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (res) => {
          this.response.set(res);
          if (res.statusCounts) {
            this.statusCounts.set(res.statusCounts);
          }
        },
        error: (err: unknown) => this.error.set(anomalyErrorMessage(err, 'Không thể tải danh sách sự cố.')),
      });
  }

  protected selectStatus(status: AnomalyFilterStatus): void {
    if (this.selectedStatus() === status) return;
    this.selectedStatus.set(status);
    this.page.set(1);
    this.load();
  }

  protected onSearchInput(event: Event): void {
    this.searchSubject.next((event.target as HTMLInputElement).value);
  }

  protected onShowSupersededChange(event: Event): void {
    this.showSuperseded.set((event.target as HTMLInputElement).checked);
  }

  protected supersededCountFor(item: AnomalyItem): number {
    return this.grouping().supersededByReplacement.get(item.id)?.length ?? 0;
  }

  protected openDetail(item: AnomalyItem): void {
    void this.router.navigate(['/ai-review', item.id], {
      state: {
        anomaly: item,
        superseded: this.grouping().supersededByReplacement.get(item.id) ?? [],
        from: 'queue',
      },
      queryParams: { from: 'queue' },
    });
  }

  protected setPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.response().totalPages || nextPage === this.page()) return;
    this.page.set(nextPage);
    this.load();
  }

  protected changePageSize(size: string | number): void {
    this.pageSize.set(Number(size) || 10);
    this.setPage(1);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.showSuperseded.set(false);
    this.selectedStatus.set('all');
    this.setPage(1);
    this.load();
  }

  protected confidenceTone(score: number): string {
    if (score >= 90) return 'success';
    if (score >= 75) return 'info';
    return 'warning';
  }

  protected statusTone(item: AnomalyItem): string {
    if (item.supersededById) return 'neutral';
    if (item.validationStatus === 'Confirmed') return 'success';
    if (item.validationStatus === 'Resolved') return 'info';
    if (item.validationStatus === 'Rejected') return 'danger';
    return 'warning';
  }

  protected confidenceClass(score: number): string {
    if (score >= 90) return 'conf-high';
    if (score >= 75) return 'conf-med';
    return 'conf-low';
  }

  protected statusClass(item: AnomalyItem): string {
    if (item.supersededById) return 'status-rejected';
    if (item.validationStatus === 'Confirmed' || item.validationStatus === 'Resolved') return 'status-confirmed';
    if (item.validationStatus === 'Rejected') return 'status-rejected';
    return 'status-pending';
  }

  protected statusText(item: AnomalyItem): string {
    if (item.supersededById) return 'Đã bị thay thế';
    if (item.validationStatus === 'Confirmed') return 'Đã xác nhận';
    if (item.validationStatus === 'Resolved') return 'Đã xử lý';
    if (item.validationStatus === 'Rejected') return 'Đã từ chối';
    return 'Chờ thẩm định';
  }

  protected handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/images/defect-preview-frame.png';
  }
}
