import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { PreMissionAssessment } from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';
import { PreMissionApi } from '../../data-access/pre-mission-api';

@Component({
  selector: 'app-assessment-list',
  imports: [RouterLink, DatePipe, NzIconModule],
  templateUrl: './assessment-list.html',
  styleUrl: './assessment-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentList {
  private readonly api = inject(PreMissionApi);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly items = signal<readonly PreMissionAssessment[]>([]);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly totalCount = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly statusFilter = signal('');
  protected readonly searchQuery = signal('');

  protected readonly statuses = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'READY', label: 'Sẵn sàng (READY)' },
    { value: 'NOT_READY', label: 'Chưa sẵn sàng (NOT_READY)' },
    { value: 'EVALUATING', label: 'Đang đánh giá (EVALUATING)' },
    { value: 'DRAFT', label: 'Bản nháp (DRAFT)' },
    { value: 'EXPIRED', label: 'Hết hạn (EXPIRED)' },
    { value: 'CONSUMED', label: 'Đã tạo nhiệm vụ (CONSUMED)' },
  ];

  protected readonly filteredItems = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.items();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.assessmentCode.toLowerCase().includes(q) ||
        item.regionName.toLowerCase().includes(q) ||
        (item.lineName && item.lineName.toLowerCase().includes(q))
    );
  });

  protected readonly stats = computed(() => {
    const list = this.items();
    return [
      { label: 'Tổng số đánh giá', value: this.totalCount() || list.length },
      { label: 'Sẵn sàng (READY)', value: list.filter((x) => x.status === 'READY').length },
      { label: 'Chưa sẵn sàng (NOT_READY)', value: list.filter((x) => x.status === 'NOT_READY').length },
      { label: 'Hết hạn / Tiêu thụ', value: list.filter((x) => x.status === 'EXPIRED' || x.status === 'CONSUMED').length },
    ];
  });

  protected readonly startIndex = computed(() => {
    if (!this.totalCount()) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  protected readonly endIndex = computed(() => {
    return Math.min(this.page() * this.pageSize(), this.totalCount() || this.items().length);
  });

  protected readonly pageButtons = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const buttons: number[] = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
        buttons.push(i);
      }
    }
    return buttons;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.page(), this.pageSize(), this.statusFilter()).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.page.set(res.page);
        this.pageSize.set(res.pageSize);
        this.totalCount.set(res.totalCount);
        this.totalPages.set(res.totalPages);
      },
      error: () => {
        this.error.set('Không tải được danh sách đánh giá tiền nhiệm vụ. Vui lòng thử lại.');
      },
      complete: () => {
        this.loading.set(false);
      },
    });
  }

  protected onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  protected onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  protected goToPage(targetPage: number): void {
    if (targetPage < 1 || targetPage > this.totalPages() || targetPage === this.page()) return;
    this.page.set(targetPage);
    this.load();
  }

  protected statusTone = statusTone;
  protected statusLabel = statusLabel;
}
