import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
import { AnomalyApi, AnomalyItem, AnomalyPage } from '../../data-access/anomaly-api';

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
  protected readonly statusFilter = signal('Pending');
  protected readonly viewMode = signal<'grid' | 'table'>('grid');

  protected readonly response = signal<AnomalyPage>({
    items: [],
    totalCount: 0,
    pageIndex: 1,
    pageSize: 12,
    totalPages: 1,
  });

  protected readonly filteredItems = computed(() => {
    const rawItems = this.response().items;
    const query = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return rawItems.filter((item) => {
      const matchStatus = !status || item.validationStatus.toLowerCase() === status.toLowerCase();
      if (!matchStatus) return false;

      if (!query) return true;
      return (
        item.categoryName.toLowerCase().includes(query) ||
        item.assetCode.toLowerCase().includes(query) ||
        (item.towerCode && item.towerCode.toLowerCase().includes(query)) ||
        (item.missionCode && item.missionCode.toLowerCase().includes(query))
      );
    });
  });

  protected readonly pendingCount = computed(() =>
    this.response().items.filter((item) => item.validationStatus === 'Pending').length,
  );

  protected readonly highConfidenceCount = computed(() =>
    this.response().items.filter((item) => item.confidenceScore >= 90).length,
  );

  protected readonly criticalCount = computed(() =>
    this.response().items.filter((item) => item.isEmergency || (item.severity && item.severity >= 4)).length,
  );

  constructor() {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query);
      });

    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .listPending({
        pageIndex: this.page(),
        pageSize: this.pageSize(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (res) => {
          this.response.set(res);
        },
        error: (err: unknown) => {
          this.error.set(this.getErrorMessage(err));
        },
      });
  }

  protected onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchSubject.next(target.value);
  }

  protected openDetail(item: AnomalyItem): void {
    void this.router.navigate(['/ai-review', item.id], {
      state: { anomaly: item },
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

  protected statusClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'approved') return 'status-confirmed';
    if (s === 'rejected' || s === 'dismissed') return 'status-rejected';
    return 'status-pending';
  }

  protected statusText(status: string): string {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'approved') return 'Đã xác nhận';
    if (s === 'rejected' || s === 'dismissed') return 'Đã từ chối';
    return 'Chờ thẩm định';
  }

  protected handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/images/defect-insulator-crack.png';
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
      if (error.status === 403) return 'Bạn không có quyền thẩm định kết quả AI (Cần vai trò Analyst).';
      const body = error.error as Record<string, unknown> | null;
      return String(body?.['message'] || error.message || 'Lỗi khi tải danh sách sự cố AI.');
    }
    return 'Không thể kết nối đến máy chủ AI.';
  }
}
