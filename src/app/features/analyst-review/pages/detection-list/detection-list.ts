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
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { statusColorClass, statusLabel } from '../../../../shared/status/status';
import { ToastService } from '../../../../core/toast/toast.service';
import { ActiveLearningGateway } from '../../active-learning/active-learning-gateway';
import {
  LabelStatus,
  LearningAcceptanceStatus,
  SaveImageLabelsResult,
} from '../../active-learning/active-learning.models';
import { LabelEditorModal } from '../../active-learning/label-editor-modal/label-editor-modal';
import {
  AnomalyApi,
  anomalyErrorMessage,
  AnomalyItem,
  AnomalyPage,
  EXECUTION_LOCATION_LABELS,
  groupSuperseded,
} from '../../data-access/anomaly-api';

type ReviewStatusFilter = 'Pending' | 'Confirmed' | 'Rejected' | 'Labeling';

@Component({
  selector: 'app-detection-list',
  imports: [DatePipe, RouterLink, Pagination, LabelEditorModal],
  templateUrl: './detection-list.html',
  styleUrl: './detection-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectionList {
  private readonly api = inject(AnomalyApi);
  private readonly activeLearning = inject(ActiveLearningGateway);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchSubject = new Subject<string>();
  private activeSub: Subscription | null = null;

  protected readonly activeLearningEnabled = this.activeLearning.enabled;
  protected readonly activeLearningLocalMode = this.activeLearning.isLocalMode;
  protected readonly editingLabelItem = signal<AnomalyItem | null>(null);
  protected readonly submittingLearningId = signal<string | null>(null);

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
    const base = this.grouping().visible;
    const priority = this.priorityFilter();
    const filtered =
      priority === 'emergency'
        ? base.filter((item) => this.isEmergencyItem(item))
        : priority === 'normal'
          ? base.filter((item) => !this.isEmergencyItem(item))
          : [...base];

    // Default sort: Khẩn cấp > Bình thường, then newest (createdAt desc)
    return filtered.sort((a, b) => {
      const aEm = this.isEmergencyItem(a) ? 1 : 0;
      const bEm = this.isEmergencyItem(b) ? 1 : 0;
      if (aEm !== bEm) return bEm - aEm;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  });

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.search().trim() || this.priorityFilter()),
  );

  protected readonly emptyStateTitle = computed(() => {
    switch (this.statusFilter()) {
      case 'Confirmed':
        return 'Chưa có phát hiện nào được chấp nhận';
      case 'Rejected':
        return 'Không có phát hiện nào bị từ chối';
      case 'Labeling':
        return 'Chưa có ảnh bị từ chối nào để sửa nhãn';
      case 'Pending':
      default:
        return 'Không có phát hiện nào cần thẩm định';
    }
  });

  protected readonly emptyStateDescription = computed(() => {
    switch (this.statusFilter()) {
      case 'Confirmed':
        return 'Các kết quả phát hiện khuyết tật sau khi được chấp nhận sẽ hiển thị tại đây.';
      case 'Rejected':
        return 'Các kết quả phát hiện bị từ chối hoặc báo động giả sẽ hiển thị tại đây.';
      case 'Labeling':
        return 'Các ảnh đã bị từ chối sẽ xuất hiện tại đây để chuyên viên sửa nhãn và gửi thử cho AI học.';
      case 'Pending':
      default:
        return 'Tất cả các kết quả phát hiện khuyết tật đã được xử lý hoàn tất hoặc không có dữ liệu phù hợp.';
    }
  });

  protected cardBoxStyle(item: AnomalyItem): { left: string; top: string; width: string; height: string } | null {
    const box = item.boundingBox;
    if (!box) return { left: '10%', top: '10%', width: '80%', height: '80%' };
    if (box.isNormalized || (box.x <= 100 && box.y <= 100 && box.width <= 100 && box.height <= 100 && box.x + box.width <= 100.5 && box.y + box.height <= 100.5)) {
      return { left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` };
    }
    return { left: '10%', top: '10%', width: '80%', height: '80%' };
  }

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
    this.fetchList(filter);
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
        : filter === 'Confirmed'
          ? this.api.listReviewed('Confirmed', params)
          : this.api.listReviewed('Rejected', params);

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

  protected labelStatusFor(item: AnomalyItem): LabelStatus | null {
    return this.activeLearning.statusFor(item);
  }

  protected learningStatusFor(item: AnomalyItem): LearningAcceptanceStatus | null {
    return this.activeLearning.learningStatusFor(item);
  }

  protected openLabelEditorFor(item: AnomalyItem): void {
    if (!this.activeLearningEnabled) return;
    this.editingLabelItem.set(item);
  }

  protected closeLabelEditor(): void {
    this.editingLabelItem.set(null);
  }

  protected onListLabelsSaved(result: SaveImageLabelsResult): void {
    this.editingLabelItem.set(null);
    const msg =
      result.labelStatus === 'FullyReviewed'
        ? 'Đã lưu nhãn toàn ảnh (Đã gắn nhãn). Bạn có thể bấm "Gửi AI học" để kiểm tra.'
        : 'Đã lưu nhãn ở trạng thái Nháp.';
    this.toast.success(msg);
  }

  protected submitForAiLearning(item: AnomalyItem): void {
    if (!this.activeLearningEnabled || this.submittingLearningId()) return;
    this.submittingLearningId.set(item.id);
    this.activeLearning
      .submitForLearning(item)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submittingLearningId.set(null)),
      )
      .subscribe({
        next: (res) => {
          if (res.status === 'Accepted') {
            this.toast.success(res.message);
          } else {
            this.toast.warning(res.message);
          }
        },
        error: () => {
          this.toast.error('Không thể gửi ảnh kiểm tra học AI.');
        },
      });
  }

  protected handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
