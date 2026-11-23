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
import { debounceTime, distinctUntilChanged, finalize, Subject, Subscription } from 'rxjs';
import { EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { statusColorClass, statusLabel } from '../../../../shared/status/status';
import {
  AnomalyApi,
  anomalyErrorMessage,
  AnomalyItem,
  AnomalyPage,
  EXECUTION_LOCATION_LABELS,
  groupSuperseded,
} from '../../data-access/anomaly-api';

type ReviewStatusFilter = 'ALL' | 'Pending' | 'Reviewed' | 'Confirmed' | 'Rejected';

@Component({
  selector: 'app-detection-list',
  imports: [DatePipe, RouterLink, Pagination],
  templateUrl: './detection-list.html',
  styleUrl: './detection-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectionList {
  private readonly api = inject(AnomalyApi);
  private readonly alertsApi = inject(EmergencyAlertsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchSubject = new Subject<string>();
  private activeSub: Subscription | null = null;

  protected readonly initialLoading = signal(true);
  protected readonly fetching = signal(false);
  protected readonly loading = computed(() => this.initialLoading() || this.fetching());
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(15);
  protected readonly search = signal('');
  protected readonly priorityFilter = signal<'' | 'emergency' | 'normal'>('');
  protected readonly viewMode = signal<'grid' | 'table'>('grid');
  protected readonly showSuperseded = signal(false);
  protected readonly statusFilter = signal<ReviewStatusFilter>('Pending');
  protected readonly pendingCount = signal(0);
  protected readonly executionLabels = EXECUTION_LOCATION_LABELS;
  protected readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i + 1);
  protected readonly skeletonCards = Array.from({ length: 6 }, (_, i) => i + 1);

  protected readonly response = signal<AnomalyPage>({
    items: [],
    totalCount: 0,
    pageIndex: 1,
    pageSize: 15,
    totalPages: 1,
  });

  private readonly grouping = computed(() => groupSuperseded(this.response().items));

  protected readonly hiddenSupersededCount = computed(() => this.grouping().hiddenCount);

  protected readonly displayedItems = computed<readonly AnomalyItem[]>(() => {
    const base = this.showSuperseded() ? this.response().items : this.grouping().visible;
    const priority = this.priorityFilter();
    if (priority === 'emergency') {
      return base.filter((item) => this.isEmergencyItem(item));
    }
    if (priority === 'normal') {
      return base.filter((item) => !this.isEmergencyItem(item));
    }
    return base;
  });

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.search().trim() || this.priorityFilter() || this.showSuperseded()),
  );

  protected readonly emptyStateTitle = computed(() => {
    switch (this.statusFilter()) {
      case 'Reviewed':
        return 'Chưa có phát hiện nào đã được thẩm định';
      case 'Confirmed':
        return 'Chưa có phát hiện nào được chấp nhận';
      case 'Rejected':
        return 'Không có phát hiện nào bị từ chối';
      case 'ALL':
        return 'Không tìm thấy kết quả phát hiện nào';
      case 'Pending':
      default:
        return 'Không có phát hiện nào cần thẩm định';
    }
  });

  protected readonly emptyStateDescription = computed(() => {
    switch (this.statusFilter()) {
      case 'Reviewed':
        return 'Tất cả các kết quả đã thẩm định (chấp nhận, từ chối hoặc đã khắc phục) sẽ hiển thị tại đây.';
      case 'Confirmed':
        return 'Các kết quả phát hiện khuyết tật sau khi được chấp nhận sẽ hiển thị tại đây.';
      case 'Rejected':
        return 'Các kết quả phát hiện bị từ chối hoặc báo động giả sẽ hiển thị tại đây.';
      case 'ALL':
        return 'Không có dữ liệu phù hợp với điều kiện tìm kiếm hiện tại.';
      case 'Pending':
      default:
        return 'Tất cả các kết quả phát hiện khuyết tật đã được xử lý hoàn tất hoặc không có dữ liệu phù hợp.';
    }
  });

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const p = (params.get('priority') ?? '').trim().toLowerCase();
        if (p === 'emergency' || p === 'normal') {
          this.priorityFilter.set(p);
        }
      });

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query);
        this.page.set(1);
        this.load();
      });

    this.destroyRef.onDestroy(() => {
      this.activeSub?.unsubscribe();
    });

    this.load();
  }

  protected setStatusFilter(nextFilter: ReviewStatusFilter): void {
    if (this.statusFilter() === nextFilter) return;
    this.statusFilter.set(nextFilter);
    this.page.set(1);
    this.load();
  }

  protected load(): void {
    this.activeSub?.unsubscribe();
    this.fetching.set(true);
    this.error.set('');

    const filter = this.statusFilter();
    if (filter === 'Pending' || filter === 'ALL') {
      this.activeSub = this.alertsApi
        .fetchActiveAlerts()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.fetchList(filter),
          error: () => this.fetchList(filter),
        });
    } else {
      this.fetchList(filter);
    }
  }

  private fetchList(filter: ReviewStatusFilter): void {
    const params = {
      pageIndex: this.page(),
      pageSize: this.pageSize(),
      search: this.search(),
    };

    const req$ =
      filter === 'Pending'
        ? this.api.listPending(params)
        : filter === 'Reviewed'
          ? this.api.listReviewed('ALL_REVIEWED', params)
          : filter === 'Confirmed'
            ? this.api.listReviewed('Confirmed', params)
            : filter === 'Rejected'
              ? this.api.listReviewed('Rejected', params)
              : this.api.listAll(params);

    this.activeSub = req$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.initialLoading.set(false);
          this.fetching.set(false);
        }),
      )
      .subscribe({
        next: (res) => {
          this.response.set(res);
          if (filter === 'Pending') {
            this.pendingCount.set(res.totalCount);
          }
        },
        error: (err: unknown) =>
          this.error.set(anomalyErrorMessage(err, 'Không thể tải danh sách kết quả thẩm định.')),
      });
  }

  protected onSearchInput(event: Event): void {
    this.searchSubject.next((event.target as HTMLInputElement).value);
  }

  protected onShowSupersededChange(event: Event): void {
    this.showSuperseded.set((event.target as HTMLInputElement).checked);
  }

  protected onPriorityChange(event: Event): void {
    const val = ((event.target as HTMLSelectElement | null)?.value ?? '') as '' | 'emergency' | 'normal';
    this.priorityFilter.set(val);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.priorityFilter.set('');
    this.showSuperseded.set(false);
    this.page.set(1);
    this.load();
  }

  protected supersededCountFor(item: AnomalyItem): number {
    return this.grouping().supersededByReplacement.get(item.id)?.length ?? 0;
  }

  protected openDetail(item: AnomalyItem): void {
    void this.router.navigate(['/ai-review', item.id], {
      state: { anomaly: item, superseded: this.grouping().supersededByReplacement.get(item.id) ?? [] },
    });
  }

  protected setPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.response().totalPages || nextPage === this.page()) return;
    this.page.set(nextPage);
    this.load();
  }

  protected statusText(item: AnomalyItem): string {
    if (item.supersededById) return 'Đã thay thế';
    switch (item.validationStatus) {
      case 'Confirmed':
        return 'Đã xác nhận';
      case 'Resolved':
        return 'Đã khắc phục';
      case 'Rejected':
        return 'Đã từ chối';
      case 'InReview':
        return 'Đang thẩm định';
      case 'Pending':
      default:
        return statusLabel(item.validationStatus || 'Pending');
    }
  }

  protected itemStatusColorClass(item: AnomalyItem): string {
    if (item.supersededById) return statusColorClass('CANCELLED');
    return statusColorClass(item.validationStatus || 'PENDING');
  }

  protected confidenceColorClass(score: number): string {
    if (score >= 90) return 'text-emerald-700 font-semibold';
    if (score >= 75) return 'text-blue-700 font-semibold';
    return 'text-amber-700 font-semibold';
  }

  protected isEmergencyItem(item: AnomalyItem): boolean {
    if (item.isEmergency) return true;
    const sev = item.severity;
    if (sev === null || sev === undefined) return false;
    return sev > 1 ? sev >= 4 : sev >= 0.85;
  }

  protected isItemFinalized(item: AnomalyItem): boolean {
    return (
      item.validationStatus === 'Confirmed' ||
      item.validationStatus === 'Rejected' ||
      item.validationStatus === 'Resolved'
    );
  }

  protected handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
