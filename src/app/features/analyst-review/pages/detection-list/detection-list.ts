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
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { debounceTime, distinctUntilChanged, finalize, Subject } from 'rxjs';
import { EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';
import { ToastService } from '../../../../core/toast/toast.service';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import {
  AnomalyApi,
  anomalyErrorMessage,
  AnomalyItem,
  AnomalyPage,
  EXECUTION_LOCATION_LABELS,
  groupSuperseded,
} from '../../data-access/anomaly-api';

@Component({
  selector: 'app-detection-list',
  imports: [DatePipe, RouterLink, NzIconModule, Pagination],
  templateUrl: './detection-list.html',
  styleUrl: './detection-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectionList {
  private readonly api = inject(AnomalyApi);
  private readonly alertsApi = inject(EmergencyAlertsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly searchSubject = new Subject<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(15);
  protected readonly search = signal('');
  protected readonly viewMode = signal<'grid' | 'table'>('grid');
  protected readonly showSuperseded = signal(false);
  protected readonly statusFilter = signal<'ALL' | 'Pending' | 'Reviewed' | 'Confirmed' | 'Rejected'>('Pending');
  protected readonly pendingCount = signal(0);
  protected readonly executionLabels = EXECUTION_LOCATION_LABELS;

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
    return this.showSuperseded() ? this.response().items : this.grouping().visible;
  });

  protected readonly emptyStateIcon = computed(() => {
    if (this.statusFilter() === 'Confirmed') return 'file-done';
    if (this.statusFilter() === 'Rejected') return 'stop';
    if (this.statusFilter() === 'Reviewed') return 'audit';
    return 'check-circle';
  });

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
        return 'Tất cả các kết quả đã thẩm định (chấp nhận hoặc từ chối) sẽ hiển thị tại đây.';
      case 'Confirmed':
        return 'Các kết quả phát hiện khuyết tật sau khi được chấp nhận sẽ hiển thị tại đây.';
      case 'Rejected':
        return 'Các kết quả phát hiện bị từ chối hoặc báo động sai sẽ hiển thị tại đây.';
      case 'ALL':
        return 'Không có dữ liệu phù hợp với điều kiện tìm kiếm hiện tại.';
      case 'Pending':
      default:
        return 'Tất cả các kết quả phát hiện khuyết tật đã được xử lý hoàn tất hoặc không có dữ liệu phù hợp.';
    }
  });

  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.response().totalPages }, (_, index) => index + 1),
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
    this.searchSubject
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query);
        this.page.set(1);
        this.load();
      });

    this.load();
  }

  protected setStatusFilter(nextFilter: 'ALL' | 'Pending' | 'Reviewed' | 'Confirmed' | 'Rejected'): void {
    if (this.statusFilter() === nextFilter) return;
    this.statusFilter.set(nextFilter);
    this.page.set(1);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');

    const filter = this.statusFilter();
    if (filter === 'Pending' || filter === 'ALL') {
      this.alertsApi
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

  private fetchList(filter: 'ALL' | 'Pending' | 'Reviewed' | 'Confirmed' | 'Rejected'): void {
    let req$;

    if (filter === 'Pending') {
      req$ = this.api.listPending({ pageIndex: this.page(), pageSize: this.pageSize(), search: this.search() });
    } else if (filter === 'Reviewed') {
      req$ = this.api.listReviewed('ALL_REVIEWED', { pageIndex: this.page(), pageSize: this.pageSize(), search: this.search() });
    } else if (filter === 'Confirmed') {
      req$ = this.api.listReviewed('Confirmed', { pageIndex: this.page(), pageSize: this.pageSize(), search: this.search() });
    } else if (filter === 'Rejected') {
      req$ = this.api.listReviewed('Rejected', { pageIndex: this.page(), pageSize: this.pageSize(), search: this.search() });
    } else {
      req$ = this.api.listAll({ pageIndex: this.page(), pageSize: this.pageSize(), search: this.search() });
    }

    req$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
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
    if (item.supersededById) return 'Superseded';
    if (item.validationStatus === 'Confirmed') return 'Confirmed';
    if (item.validationStatus === 'Resolved') return 'Resolved';
    if (item.validationStatus === 'Rejected') return 'Rejected';
    if (item.validationStatus === 'InReview') return 'InReview';
    return 'Pending';
  }

  protected isEmergencyItem(item: AnomalyItem): boolean {
    return Boolean(item.isEmergency || (item.severity ?? 0) >= 4);
  }

  protected handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/images/defect-preview-frame.png';
  }
}
