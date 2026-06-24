import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  imports: [],
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pagination {
  readonly page = input.required<number>(); readonly totalPages = input.required<number>(); readonly totalCount = input(0); readonly pageChanged = output<number>();
  protected readonly pages = computed(() => { const total = this.totalPages(); const current = this.page(); const start = Math.max(1, Math.min(current - 2, total - 4)); return Array.from({ length: Math.min(5, total) }, (_, index) => start + index); });
}
