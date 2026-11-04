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
import { Router } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { debounceTime, distinctUntilChanged, finalize, Subject } from 'rxjs';
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
  imports: [DatePipe, NzIconModule],
  templateUrl: './detection-list.html',
  styleUrl: './detection-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectionList {
  private readonly api = inject(AnomalyApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchSubject = new Subject<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(12);
  protected readonly search = signal('');
  protected readonly viewMode = signal<'grid' | 'table'>('grid');
  protected readonly showSuperseded = signal(false);
  protected readonly executionLabels = EXECUTION_LOCATION_LABELS;

  protected readonly response = signal<AnomalyPage>({
    items: [],
    totalCount: 0,
    pageIndex: 1,
    pageSize: 12,
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

  protected load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .listPending({ pageIndex: this.page(), pageSize: this.pageSize(), search: this.search() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (res) => this.response.set(res),
        error: (err: unknown) => this.error.set(anomalyErrorMessage(err, 'Không thể tải hàng đợi thẩm định.')),
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
