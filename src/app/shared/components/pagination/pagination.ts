import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type PageItem = number | '...';

@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly totalCount = input<number>(0);
  readonly pageSize = input<number>(10);
  readonly totalKnown = input<boolean>(true);
  readonly itemCount = input<number | null>(null);
  readonly pageChanged = output<number>();

  protected readonly hasRecords = computed(() => {
    const count = this.itemCount();
    return this.totalCount() > 0 || (count !== null && count > 0);
  });

  protected readonly startIndex = computed(() => {
    if (!this.hasRecords()) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  protected readonly endIndex = computed(() => {
    if (!this.hasRecords()) return 0;
    const count = this.itemCount();
    if (!this.totalKnown() && count !== null) {
      return (this.page() - 1) * this.pageSize() + count;
    }
    return Math.min(this.page() * this.pageSize(), this.totalCount());
  });

  protected readonly visiblePages = computed<readonly PageItem[]>(() => {
    const total = this.totalPages();
    const current = this.page();

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }

    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }

    return [1, '...', current - 1, current, current + 1, '...', total];
  });

  protected goToPage(target: PageItem): void {
    if (typeof target === 'number' && target !== this.page() && target >= 1 && target <= this.totalPages()) {
      this.pageChanged.emit(target);
    }
  }

  protected prevPage(): void {
    if (this.page() > 1) {
      this.pageChanged.emit(this.page() - 1);
    }
  }

  protected nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.pageChanged.emit(this.page() + 1);
    }
  }
}
